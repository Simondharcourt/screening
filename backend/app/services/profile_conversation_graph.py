import logging
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt
from langgraph.checkpoint.redis import RedisSaver
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field, ValidationError
from langfuse import observe

from app.core.config import settings
from app.core.database import supabase
from app.schemas.candidate import (
    CandidateProfile, INFO_GRID, QUESTION_CONFIG, compute_completion_score
)

logger = logging.getLogger(__name__)


# ── Graph state ───────────────────────────────────────────────────────────────

class ProfileConversationState(TypedDict):
    session_id: str
    profile: dict              # CandidateProfile.model_dump()
    qa_history: list[dict]     # [{"question": ..., "answer": ...}]
    current_question: Optional[str]
    is_complete: bool


# ── LLM output schemas ────────────────────────────────────────────────────────

class GapAnalysisResult(BaseModel):
    question: Optional[str] = Field(None, description="Prochaine question à poser, ou None si profil complet")
    is_complete: bool = Field(description="True si tous les champs critiques sont remplis")


class AnswerProcessorResult(BaseModel):
    structured_updates: dict = Field(
        default_factory=dict,
        description="Champs du profil à mettre à jour. Clés = noms de champs CandidateProfile."
    )
    narrative_addition: str = Field(
        default="",
        description="Phrase à ajouter au résumé narratif (summary) du candidat."
    )


# ── Nodes ─────────────────────────────────────────────────────────────────────

@observe(name="gap_analyzer")
def gap_analyzer_node(state: ProfileConversationState) -> dict:
    """Compares INFO_GRID against filled profile, returns next question or sets is_complete."""
    profile = CandidateProfile.model_validate(state["profile"])

    # Build list of missing fields with their question text
    missing = []
    for field in INFO_GRID:
        value = getattr(profile, field)
        if value is None or value == [] or value == "":
            config = QUESTION_CONFIG[field]
            missing.append({"field": field, "question": config["question"], "skippable": config["skippable"]})

    if not missing:
        return {"is_complete": True, "current_question": None}

    # Ask LLM to pick the most relevant next question given context
    llm = ChatAnthropic(model=settings.LLM_MODEL_FAST, temperature=0, max_tokens=256,
                        api_key=settings.ANTHROPIC_API_KEY)
    structured_llm = llm.with_structured_output(GapAnalysisResult)

    missing_summary = "\n".join(
        f"- {m['field']}: {m['question']}" for m in missing[:5]
    )
    profile_summary = (
        f"Poste visé: {profile.job_title_target}\n"
        f"Expérience: {profile.experience_years or '?'} ans\n"
        f"Compétences: {', '.join(profile.skills) or 'non précisé'}"
    )
    qa_summary = "\n".join(
        f"Q: {qa['question']}\nR: {qa['answer']}" for qa in state["qa_history"][-3:]
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "Tu aides à compléter un profil candidat. Choisis la prochaine question à poser "
         "parmi les informations manquantes. Priorise les informations les plus utiles pour "
         "le matching d'emploi. Si le profil est suffisamment complet pour trouver des emplois "
         "pertinents, marque is_complete=True même s'il reste des champs optionnels vides."),
        ("human",
         "Profil actuel:\n{profile}\n\n"
         "Questions déjà posées:\n{qa_history}\n\n"
         "Informations manquantes (par ordre de priorité):\n{missing}\n\n"
         "Quelle est la prochaine question à poser ?"),
    ])

    messages = prompt.invoke({
        "profile": profile_summary,
        "qa_history": qa_summary or "Aucune",
        "missing": missing_summary,
    })
    result = structured_llm.invoke(messages)

    logger.info(f"[gap_analyzer] is_complete={result.is_complete}, question={result.question!r}")
    return {
        "is_complete": result.is_complete,
        "current_question": result.question,
    }


@observe(name="answer_processor")
def answer_processor_node(state: ProfileConversationState) -> dict:
    """Waits for candidate answer (via interrupt), then updates profile."""
    answer: str = interrupt(state["current_question"])

    profile = CandidateProfile.model_validate(state["profile"])

    llm = ChatAnthropic(model=settings.LLM_MODEL_FAST, temperature=0, max_tokens=512,
                        api_key=settings.ANTHROPIC_API_KEY)
    structured_llm = llm.with_structured_output(AnswerProcessorResult)

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "Tu mets à jour un profil candidat. Extrais les informations structurées de la réponse "
         "et génère une courte phrase narrative à ajouter au résumé. "
         "structured_updates: uniquement les champs CandidateProfile modifiés. "
         "narrative_addition: 1 phrase enrichissant le résumé en français."),
        ("human",
         "Profil actuel:\n{profile}\n\n"
         "Question posée: {question}\n"
         "Réponse du candidat: {answer}"),
    ])

    messages = prompt.invoke({
        "profile": profile.model_dump_json(),
        "question": state["current_question"],
        "answer": answer,
    })
    result: AnswerProcessorResult = structured_llm.invoke(messages)

    # Apply structured updates — only whitelisted INFO_GRID fields (prevents
    # completion_score/summary injection via LLM-controlled structured_updates).
    _UPDATABLE_FIELDS = set(INFO_GRID)
    for field, value in result.structured_updates.items():
        if field in _UPDATABLE_FIELDS and value is not None:
            try:
                setattr(profile, field, value)
            except (ValidationError, ValueError) as e:
                logger.warning(f"[answer_processor] skipping invalid value for {field}: {e}")

    # Append to narrative summary
    if result.narrative_addition:
        profile.summary = (profile.summary + " " + result.narrative_addition).strip()

    profile.completion_score = compute_completion_score(profile)

    # Sync to Supabase
    _sync_profile_to_supabase(state["session_id"], profile)

    new_qa = {"question": state["current_question"], "answer": answer}
    logger.info(f"[answer_processor] updated {list(result.structured_updates.keys())}, score={profile.completion_score}")

    return {
        "profile": profile.model_dump(),
        "qa_history": state["qa_history"] + [new_qa],
    }


@observe(name="finalize_profile")
def finalize_node(state: ProfileConversationState) -> dict:
    """Generates final summary, regenerates embedding, marks onboarding complete."""
    from app.services.embedding_service import EmbeddingService

    profile = CandidateProfile.model_validate(state["profile"])

    # Generate final summary if needed
    if not profile.summary:
        profile.summary = (
            f"{profile.job_title_target} avec {profile.experience_years or '?'} ans d'expérience. "
            f"Compétences: {', '.join(profile.skills[:5])}."
        )

    profile.completion_score = compute_completion_score(profile)

    # Regenerate embedding from enriched profile
    embedding_text = f"{profile.job_title_target} {' '.join(profile.skills)} {profile.summary} {profile.aspirations or ''}"
    embedding = EmbeddingService.generate(embedding_text)

    # Save to Supabase with embedding + onboarding_complete
    try:
        supabase.table("candidates").update({
            "profile": profile.model_dump(),
            "embedding": embedding,
            "onboarding_complete": True,
        }).eq("id", state["session_id"]).execute()
    except Exception as e:
        logger.error(f"[finalize] Supabase update failed: {e}")

    logger.info(f"[finalize] session={state['session_id']} complete, score={profile.completion_score}")
    return {"profile": profile.model_dump(), "is_complete": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sync_profile_to_supabase(session_id: str, profile: CandidateProfile):
    try:
        supabase.table("candidates").update({
            "profile": profile.model_dump(),
        }).eq("id", session_id).execute()
    except Exception as e:
        logger.warning(f"[profile sync] failed for session={session_id}: {e}")


# ── Routing ───────────────────────────────────────────────────────────────────

def route_after_gap(state: ProfileConversationState) -> str:
    # is_complete=True → go to finalize
    # is_complete=False → go to answer_processor (which will interrupt and wait for HTTP request)
    return "finalize" if state["is_complete"] else "answer_processor"


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_profile_graph(redis_url: str = None, checkpointer=None, no_checkpointer: bool = False):
    """Builds and compiles the ProfileConversationGraph with Redis checkpointer.

    Returns (compiled_graph, checkpointer). The caller must call checkpointer.setup()
    once at application startup (when Redis is available) to create the required indexes.
    Pass no_checkpointer=True for LangGraph Studio (Studio handles persistence itself).
    """
    if not no_checkpointer and checkpointer is None:
        checkpointer = RedisSaver(redis_url=redis_url)

    builder = StateGraph(ProfileConversationState)
    builder.add_node("gap_analyzer", gap_analyzer_node)
    builder.add_node("answer_processor", answer_processor_node)
    builder.add_node("finalize", finalize_node)

    builder.set_entry_point("gap_analyzer")
    builder.add_conditional_edges("gap_analyzer", route_after_gap, {
        "answer_processor": "answer_processor",
        "finalize": "finalize",
    })
    builder.add_edge("answer_processor", "gap_analyzer")
    builder.add_edge("finalize", END)

    return builder.compile(checkpointer=checkpointer), checkpointer
