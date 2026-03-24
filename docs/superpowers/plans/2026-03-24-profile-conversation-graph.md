# Profile Conversation Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current single-shot CV analysis + batch Q&A with a LangGraph-powered adaptive Q&A that builds a richer candidate profile persisted to Supabase.

**Architecture:** `ProfileConversationGraph` with two looping nodes (`gap_analyzer` → `answer_processor`) and a `finalize` node. Redis checkpointer enables mid-session resumption. Profile is the single source of truth in Supabase, synced after each answer.

**Tech Stack:** LangGraph, langgraph-checkpoint-redis, FastAPI SSE, Supabase (jsonb + vector), Langfuse, React + TanStack

**Spec:** `docs/superpowers/specs/2026-03-24-candidate-profile-and-job-discovery-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/schemas/candidate.py` | Create | `CandidateProfile`, `ProfileConversationState`, `INFO_GRID`, `QUESTION_CONFIG` |
| `backend/app/services/profile_conversation_graph.py` | Create | LangGraph graph: nodes + routing + build function |
| `backend/app/services/profile_analyzer_service.py` | Modify | Update `analyze_cv` to use new `CandidateProfile` schema |
| `backend/app/routers/onboarding.py` | Modify | New endpoints: `/upload`, `/answer/{id}`, `/skip/{id}`, `/profile/{id}` GET+PATCH |
| `backend/supabase_profile_migration.sql` | Create | Alter `candidates` table: add `profile jsonb`, `onboarding_complete bool` |
| `backend/tests/test_profile_conversation_graph.py` | Create | Unit tests for nodes and routing |
| `frontend/src/api/onboarding.ts` | Modify | New API functions matching new endpoint shapes |
| `frontend/src/hooks/useOnboardingStream.ts` | Modify | Handle single-question flow + progress score |
| `frontend/src/components/onboarding/QuestionCard.tsx` | Create | Single question display with skip button + progress bar |
| `frontend/src/components/onboarding/QuestionsPanel.tsx` | Delete | Replaced by `QuestionCard` |

---

## Task 1: Install dependency + Supabase migration

**Files:**
- Modify: `backend/pyproject.toml`
- Create: `backend/supabase_profile_migration.sql`

- [ ] **Step 1: Add langgraph-checkpoint-redis**

```bash
cd backend
uv add langgraph-checkpoint-redis
```

Expected: `langgraph-checkpoint-redis` appears in `pyproject.toml` dependencies.

- [ ] **Step 2: Verify import works**

```bash
uv run python -c "from langgraph.checkpoint.redis import RedisSaver; print('ok')"
```

Expected: `ok`

- [ ] **Step 3: Write Supabase migration SQL**

Create `backend/supabase_profile_migration.sql`:

```sql
-- Add rich profile columns to candidates table
alter table candidates
  add column if not exists profile jsonb,
  add column if not exists onboarding_complete boolean default false,
  add column if not exists updated_at timestamptz default now();

-- Index for profile queries
create index if not exists candidates_user_id_idx on candidates(user_id);
```

- [ ] **Step 4: Run migration in Supabase dashboard**

Copy the SQL into the Supabase SQL editor and run it. Verify columns exist:

```sql
select column_name, data_type from information_schema.columns
where table_name = 'candidates';
```

Expected: `profile` (jsonb), `onboarding_complete` (boolean), `updated_at` (timestamp).

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/supabase_profile_migration.sql
git commit -m "feat: add langgraph-checkpoint-redis dep and candidates table migration"
```

---

## Task 2: Candidate schema + information grid

**Files:**
- Create: `backend/app/schemas/candidate.py`
- Test: `backend/tests/test_candidate_schema.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_candidate_schema.py`:

```python
from app.schemas.candidate import CandidateProfile, INFO_GRID, QUESTION_CONFIG, compute_completion_score

def test_completion_score_only_required_field():
    # job_title_target is filled (1/12), all others None/empty
    profile = CandidateProfile(job_title_target="Dev", summary="")
    score = compute_completion_score(profile)
    assert score == round(1 / 12, 2)

def test_completion_score_partial():
    profile = CandidateProfile(
        job_title_target="Dev",
        skills=["Python"],
        remote_pref="remote",
        summary=""
    )
    score = compute_completion_score(profile)
    assert 0.0 < score < 1.0

def test_completion_score_full():
    profile = CandidateProfile(
        job_title_target="Dev", experience_years=5, skills=["Python"],
        location_pref="Paris", remote_pref="hybrid", salary_min=60000,
        contract_type="cdi", aspirations="Lead a team", values=["autonomy"],
        preferred_sector=["tech"], preferred_team_size="startup",
        dislikes="micromanagement", summary="Senior dev"
    )
    assert compute_completion_score(profile) == 1.0

def test_info_grid_matches_profile_fields():
    profile_fields = set(CandidateProfile.model_fields.keys()) - {"summary", "completion_score"}
    for field in INFO_GRID:
        assert field in profile_fields, f"{field} in INFO_GRID not in CandidateProfile"

def test_question_config_covers_grid():
    for field in INFO_GRID:
        assert field in QUESTION_CONFIG, f"{field} missing from QUESTION_CONFIG"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_candidate_schema.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.schemas.candidate'`

- [ ] **Step 3: Create the schema**

Create `backend/app/schemas/candidate.py`:

```python
from typing import Optional
from pydantic import BaseModel, Field


class CandidateProfile(BaseModel):
    # Hard criteria
    job_title_target: str = Field(description="Titre de poste visé")
    experience_years: Optional[int] = Field(None, description="Années d'expérience")
    skills: list[str] = Field(default_factory=list, description="Compétences techniques. Max 10.")
    location_pref: Optional[str] = Field(None, description="Ville ou région préférée")
    remote_pref: Optional[str] = Field(None, description="'remote', 'hybrid', 'onsite', ou None")
    salary_min: Optional[int] = Field(None, description="Salaire minimum annuel en euros")
    contract_type: Optional[str] = Field(None, description="'cdi', 'cdd', 'freelance', 'any'")

    # Soft fit
    aspirations: Optional[str] = Field(None, description="Ce que le candidat veut atteindre")
    values: list[str] = Field(default_factory=list, description="Valeurs importantes: autonomy, impact...")
    preferred_sector: list[str] = Field(default_factory=list, description="Secteurs d'intérêt")
    preferred_team_size: Optional[str] = Field(None, description="'startup', 'mid', 'large'")
    dislikes: Optional[str] = Field(None, description="Ce que le candidat veut éviter")

    # Narrative
    summary: str = Field(default="", description="Résumé narratif du profil")

    # Meta
    completion_score: float = Field(default=0.0, description="filled_fields / len(INFO_GRID)")


# Priority-ordered — gap_analyzer works top-to-bottom
INFO_GRID = [
    "job_title_target",
    "experience_years",
    "skills",
    "remote_pref",
    "location_pref",
    "salary_min",
    "contract_type",
    "aspirations",
    "values",
    "preferred_sector",
    "preferred_team_size",
    "dislikes",
]

QUESTION_CONFIG: dict[str, dict] = {
    "job_title_target": {
        "question": "Quel type de poste recherchez-vous ?",
        "skippable": False,
    },
    "experience_years": {
        "question": "Combien d'années d'expérience avez-vous ?",
        "skippable": False,
    },
    "skills": {
        "question": "Quelles sont vos principales compétences techniques ?",
        "skippable": False,
    },
    "remote_pref": {
        "question": "Préférez-vous travailler en remote, hybride ou présentiel ?",
        "skippable": False,
    },
    "location_pref": {
        "question": "Dans quelle ville ou région souhaitez-vous travailler ?",
        "skippable": True,
    },
    "salary_min": {
        "question": "Quelle est votre fourchette de salaire minimum souhaitée ?",
        "skippable": True,
    },
    "contract_type": {
        "question": "Recherchez-vous un CDI, CDD, ou êtes-vous ouvert au freelance ?",
        "skippable": True,
    },
    "aspirations": {
        "question": "Qu'est-ce qui vous attire le plus dans votre prochain poste ?",
        "skippable": True,
    },
    "values": {
        "question": "Quelles valeurs sont importantes pour vous dans votre environnement de travail ? (ex: autonomie, impact, apprentissage)",
        "skippable": True,
    },
    "preferred_sector": {
        "question": "Y a-t-il des secteurs ou types d'entreprises qui vous attirent particulièrement ?",
        "skippable": True,
    },
    "preferred_team_size": {
        "question": "Préférez-vous travailler dans une startup, une PME ou un grand groupe ?",
        "skippable": True,
    },
    "dislikes": {
        "question": "Y a-t-il des environnements ou situations que vous voulez absolument éviter ?",
        "skippable": True,
    },
}


def compute_completion_score(profile: CandidateProfile) -> float:
    """filled_fields / len(INFO_GRID), unweighted."""
    filled = 0
    for field in INFO_GRID:
        value = getattr(profile, field)
        if value is not None and value != [] and value != "":
            filled += 1
    return round(filled / len(INFO_GRID), 2)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_candidate_schema.py -v
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/candidate.py backend/tests/test_candidate_schema.py
git commit -m "feat: richer CandidateProfile schema with INFO_GRID and completion score"
```

---

## Task 3: Update `analyze_cv` to use new schema

**Files:**
- Modify: `backend/app/services/profile_analyzer_service.py`

- [ ] **Step 1: Update imports and CandidateProfile reference**

Replace the contents of `backend/app/services/profile_analyzer_service.py`:

```python
import logging
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from langfuse import observe
from app.core.config import settings
from app.schemas.candidate import CandidateProfile, compute_completion_score

logger = logging.getLogger(__name__)


@observe(name="analyze_cv")
def analyze_cv(cv_text: str) -> CandidateProfile:
    """
    Analyzes CV text and returns a pre-filled CandidateProfile.
    Only fills fields confidently derivable from the CV — leaves the rest None.
    """
    try:
        llm = ChatAnthropic(
            model=settings.LLM_MODEL,
            temperature=0,
            max_tokens=1024,
            api_key=settings.ANTHROPIC_API_KEY
        )
        structured_llm = llm.with_structured_output(CandidateProfile)

        prompt = ChatPromptTemplate.from_messages([
            ("system",
             "Tu es un expert RH. Analyse ce CV et extrais un profil structuré. "
             "Ne remplis que les champs dont tu es sûr d'après le CV. "
             "Laisse les champs manquants à None — ils seront demandés au candidat. "
             "Ne génère pas de questions (le champ ambiguities n'existe plus). "
             "Le champ summary doit être un résumé narratif de 2-3 phrases du parcours."),
            ("human", "CV du candidat:\n\n{cv_text}"),
        ])

        chain = prompt | structured_llm
        logger.info(f"[analyze_cv] model={settings.LLM_MODEL}, input={len(cv_text[:8000])} chars")
        result = chain.invoke({"cv_text": cv_text[:8000]})
        result.completion_score = compute_completion_score(result)
        logger.info(f"[analyze_cv] ✓ {result.job_title_target}, score={result.completion_score}")
        return result

    except Exception as e:
        logger.error(f"CV analysis failed: {e}")
        return CandidateProfile(
            job_title_target="Professionnel",
            summary="Profil en cours d'analyse.",
        )
```

- [ ] **Step 2: Verify existing onboarding router still imports cleanly**

```bash
uv run python -c "from app.routers.onboarding import router; print('ok')"
```

Expected: `ok` (router still imports `analyze_cv` and `CandidateProfile` — we kept those exports).

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/profile_analyzer_service.py
git commit -m "feat: update analyze_cv to populate richer CandidateProfile schema"
```

---

## Task 4: `ProfileConversationGraph` — nodes

**Files:**
- Create: `backend/app/services/profile_conversation_graph.py`
- Test: `backend/tests/test_profile_conversation_graph.py`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/test_profile_conversation_graph.py`:

```python
from unittest.mock import patch, MagicMock
from app.schemas.candidate import CandidateProfile
from app.services.profile_conversation_graph import (
    gap_analyzer_node,
    answer_processor_node,
    finalize_node,
)

BASE_STATE = {
    "session_id": "test-123",
    "profile": CandidateProfile(job_title_target="Dev", summary="").model_dump(),
    "qa_history": [],
    "current_question": None,
    "is_complete": False,
}

def test_gap_analyzer_returns_question_when_gaps_exist():
    with patch("app.services.profile_conversation_graph.ChatAnthropic") as mock_llm:
        mock_llm.return_value.with_structured_output.return_value.invoke.return_value = MagicMock(
            question="Combien d'années d'expérience avez-vous ?", is_complete=False
        )
        result = gap_analyzer_node(BASE_STATE)
    assert result["current_question"] is not None
    assert result["is_complete"] is False

def test_gap_analyzer_sets_complete_when_no_gaps():
    full_profile = CandidateProfile(
        job_title_target="Dev", experience_years=5, skills=["Python"],
        remote_pref="remote", location_pref="Paris", salary_min=60000,
        contract_type="cdi", aspirations="Lead", values=["autonomy"],
        preferred_sector=["tech"], preferred_team_size="startup",
        dislikes="micromanagement", summary="Senior dev"
    )
    state = {**BASE_STATE, "profile": full_profile.model_dump()}
    with patch("app.services.profile_conversation_graph.ChatAnthropic") as mock_llm:
        mock_llm.return_value.with_structured_output.return_value.invoke.return_value = MagicMock(
            question=None, is_complete=True
        )
        result = gap_analyzer_node(state)
    assert result["is_complete"] is True

def test_answer_processor_updates_profile():
    state = {
        **BASE_STATE,
        "current_question": "Combien d'années d'expérience ?",
    }
    with patch("app.services.profile_conversation_graph.ChatAnthropic") as mock_llm:
        mock_llm.return_value.with_structured_output.return_value.invoke.return_value = MagicMock(
            structured_updates={"experience_years": 5},
            narrative_addition="5 ans d'expérience Python."
        )
        # Simulate interrupt resume
        with patch("app.services.profile_conversation_graph.interrupt", return_value="5 ans"):
            result = answer_processor_node(state)
    assert result["profile"]["experience_years"] == 5
    assert len(result["qa_history"]) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
uv run pytest tests/test_profile_conversation_graph.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.profile_conversation_graph'`

- [ ] **Step 3: Create the graph**

Create `backend/app/services/profile_conversation_graph.py`:

```python
import logging
from typing import TypedDict, Optional
from langgraph.graph import StateGraph, END
from langgraph.types import interrupt
from langgraph.checkpoint.redis import RedisSaver
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
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
        f"- {m['field']}: {m['question']}" for m in missing[:5]  # top 5 gaps
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

    result = (prompt | structured_llm).invoke({
        "profile": profile_summary,
        "qa_history": qa_summary or "Aucune",
        "missing": missing_summary,
    })

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

    result: AnswerProcessorResult = (prompt | structured_llm).invoke({
        "profile": profile.model_dump_json(),
        "question": state["current_question"],
        "answer": answer,
    })

    # Apply structured updates
    for field, value in result.structured_updates.items():
        if hasattr(profile, field) and value is not None:
            setattr(profile, field, value)

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

def build_profile_graph(redis_url: str):
    """Builds and compiles the ProfileConversationGraph with Redis checkpointer."""
    checkpointer = RedisSaver.from_conn_string(redis_url)

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

    return builder.compile(checkpointer=checkpointer)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_profile_conversation_graph.py -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/profile_conversation_graph.py backend/tests/test_profile_conversation_graph.py
git commit -m "feat: ProfileConversationGraph with gap_analyzer, answer_processor, finalize nodes"
```

---

## Task 5: Update onboarding router — profile endpoints

**Files:**
- Modify: `backend/app/routers/onboarding.py`

This task replaces the existing `/upload` and `/answer/{id}` endpoints. Keep the search/rank SSE endpoints intact — they are replaced in Plan 2.

- [ ] **Step 1: Add graph singleton and new endpoint logic**

At the top of `backend/app/routers/onboarding.py`, add the graph import and singleton:

```python
from langgraph.types import Command
from app.services.profile_conversation_graph import build_profile_graph
from app.schemas.candidate import CandidateProfile
from app.core.config import settings

# Graph singleton — built once on module load
_profile_graph = build_profile_graph(settings.REDIS_URL)
```

- [ ] **Step 2: Replace `/upload` endpoint**

Replace the existing `upload_cv` function:

```python
@router.post("/upload")
async def upload_cv(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()
    cv_text = extract_text_from_pdf(file_bytes)
    if not cv_text:
        raise HTTPException(status_code=422, detail="Impossible d'extraire le texte de ce PDF.")

    session_id = str(uuid.uuid4())

    # Pre-fill profile from CV (single LLM call, no questions)
    profile = await asyncio.to_thread(analyze_cv, cv_text)

    # Create candidate row in Supabase
    supabase.table("candidates").insert({
        "id": session_id,
        "profile": profile.model_dump(),
        "onboarding_complete": False,
    }).execute()

    # Initialize LangGraph state and run to first question
    config = {"configurable": {"thread_id": session_id}}
    initial_state = {
        "session_id": session_id,
        "profile": profile.model_dump(),
        "qa_history": [],
        "current_question": None,
        "is_complete": False,
    }
    result = await asyncio.to_thread(_profile_graph.invoke, initial_state, config)

    logger.info(f"[upload] session={session_id}, question={result.get('current_question')!r}")
    return {
        "session_id": session_id,
        "profile": result["profile"],
        "question": result.get("current_question"),
        "completion_score": result["profile"].get("completion_score", 0.0),
    }
```

- [ ] **Step 3: Replace `/answer/{session_id}` endpoint**

```python
class AnswerRequest(BaseModel):
    answer: str

@router.post("/answer/{session_id}")
async def submit_answer(session_id: str, body: AnswerRequest):
    config = {"configurable": {"thread_id": session_id}}
    result = await asyncio.to_thread(
        _profile_graph.invoke,
        Command(resume=body.answer),
        config,
    )
    return {
        "profile": result["profile"],
        "question": result.get("current_question"),
        "completion_score": result["profile"].get("completion_score", 0.0),
        "is_complete": result.get("is_complete", False),
    }
```

- [ ] **Step 4: Add `/skip/{session_id}` and `/profile/{session_id}` endpoints**

```python
@router.post("/skip/{session_id}")
async def skip_to_results(session_id: str):
    """Finalize profile immediately, skipping remaining questions."""
    config = {"configurable": {"thread_id": session_id}}
    snapshot = _profile_graph.get_state(config)
    if not snapshot:
        raise HTTPException(status_code=404, detail="Session not found")

    # Update graph state: set is_complete=True so gap_analyzer routes to finalize
    _profile_graph.update_state(config, {"is_complete": True})

    # Resume the graph — it will run gap_analyzer (sees is_complete=True) → finalize
    result = await asyncio.to_thread(
        _profile_graph.invoke, Command(resume=None), config
    )
    return {"profile": result["profile"], "is_complete": True}


@router.get("/profile/{session_id}")
async def get_profile(session_id: str):
    resp = supabase.table("candidates").select("profile").eq("id", session_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return resp.data["profile"]


class ProfilePatch(BaseModel):
    updates: dict  # {field: value}

@router.patch("/profile/{session_id}")
async def patch_profile(session_id: str, body: ProfilePatch):
    """Direct profile update — bypasses graph (used by structured edit form)."""
    resp = supabase.table("candidates").select("profile").eq("id", session_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = CandidateProfile.model_validate(resp.data["profile"])
    for field, value in body.updates.items():
        if hasattr(profile, field):
            setattr(profile, field, value)

    from app.schemas.candidate import compute_completion_score
    profile.completion_score = compute_completion_score(profile)

    supabase.table("candidates").update({"profile": profile.model_dump()}).eq("id", session_id).execute()
    return {"profile": profile.model_dump()}
```

- [ ] **Step 5: Start the API and verify endpoints respond**

```bash
uv run uvicorn app.main:app --reload --port 8000
```

Test with curl:
```bash
curl -X POST http://localhost:8000/onboarding/upload \
  -F "file=@/path/to/test.pdf"
```

Expected: `{"session_id": "...", "profile": {...}, "question": "...", "completion_score": 0.x}`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/onboarding.py
git commit -m "feat: update onboarding router to use ProfileConversationGraph"
```

---

## Task 6: Frontend — API client update

**Files:**
- Modify: `frontend/src/api/onboarding.ts`

- [ ] **Step 1: Update API types and functions**

Replace the `UploadResponse`, `submitAnswers`, and add new types in `frontend/src/api/onboarding.ts`:

```typescript
export interface UploadResponse {
  session_id: string
  profile: CandidateProfile
  question: string | null       // single question (was: questions: string[])
  completion_score: number
}

export interface AnswerResponse {
  profile: CandidateProfile
  question: string | null
  completion_score: number
  is_complete: boolean
}

export async function submitAnswer(
  sessionId: string,
  answer: string
): Promise<AnswerResponse> {
  const response = await fetch(`${API_BASE_URL}/onboarding/answer/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.detail || 'Failed to submit answer')
  }
  return response.json()
}

export async function skipOnboarding(sessionId: string): Promise<{ profile: CandidateProfile }> {
  const response = await fetch(`${API_BASE_URL}/onboarding/skip/${sessionId}`, {
    method: 'POST',
  })
  if (!response.ok) throw new Error('Skip failed')
  return response.json()
}

export async function patchProfile(
  sessionId: string,
  updates: Partial<CandidateProfile>
): Promise<{ profile: CandidateProfile }> {
  const response = await fetch(`${API_BASE_URL}/onboarding/profile/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  if (!response.ok) throw new Error('Patch failed')
  return response.json()
}
```

Also update `CandidateProfile` interface to include new fields:

```typescript
export interface CandidateProfile {
  job_title_target: string
  experience_years?: number
  skills: string[]
  location_pref?: string
  remote_pref?: string
  salary_min?: number
  contract_type?: string
  aspirations?: string
  values: string[]
  preferred_sector: string[]
  preferred_team_size?: string
  dislikes?: string
  summary: string
  completion_score: number
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/onboarding.ts
git commit -m "feat: update onboarding API client for single-question flow"
```

---

## Task 7: Frontend — single question UI + hook update

**Files:**
- Create: `frontend/src/components/onboarding/QuestionCard.tsx`
- Modify: `frontend/src/hooks/useOnboardingStream.ts`
- Modify: `frontend/src/routes/candidate/onboarding.tsx`
- Delete: `frontend/src/components/onboarding/QuestionsPanel.tsx` (after migration)

- [ ] **Step 1: Create `QuestionCard` component**

Create `frontend/src/components/onboarding/QuestionCard.tsx`:

```tsx
import { useState } from 'react'

interface Props {
  question: string
  completionScore: number    // 0.0–1.0
  onSubmit: (answer: string) => void
  onSkip: () => void
  isLoading: boolean
}

export function QuestionCard({ question, completionScore, onSubmit, onSkip, isLoading }: Props) {
  const [answer, setAnswer] = useState('')
  const pct = Math.round(completionScore * 100)

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 shadow-xl">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between text-white/60 text-sm mb-1">
          <span>Profil complété</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 bg-white/20 rounded-full">
          <div
            className="h-full bg-white rounded-full transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <p className="text-white text-lg font-medium mb-4">{question}</p>

      {/* Answer input */}
      <textarea
        value={answer}
        onChange={e => setAnswer(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && answer.trim()) { e.preventDefault(); onSubmit(answer.trim()) } }}
        placeholder="Votre réponse..."
        rows={3}
        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/40 resize-none focus:outline-none focus:border-white/50 transition-colors"
        disabled={isLoading}
      />

      {/* Actions */}
      <div className="flex justify-between items-center mt-4">
        <button
          onClick={onSkip}
          className="text-white/50 hover:text-white/80 text-sm transition-colors"
          disabled={isLoading}
        >
          Passer à la recherche →
        </button>
        <button
          onClick={() => { if (answer.trim()) onSubmit(answer.trim()) }}
          disabled={!answer.trim() || isLoading}
          className="px-6 py-2.5 bg-white text-indigo-700 font-semibold rounded-xl disabled:opacity-40 hover:scale-105 active:scale-95 transition-all duration-200"
        >
          {isLoading ? '...' : 'Suivant'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `useOnboardingStream` hook**

Replace the `questions: string[]` state with `currentQuestion: string | null` and `completionScore: number`. Update `submitAnswers` → `submitAnswer` (single answer, returns next question):

```typescript
// Key state changes:
export interface OnboardingState {
  phase: Phase
  profile: CandidateProfile | null
  currentQuestion: string | null    // was: questions: string[]
  completionScore: number           // new
  jobsTotal: number
  jobSources: Record<string, number>
  rankedJobs: RankedJobResult[]
  error: string | null
}

// submitAnswer: single answer → next question or null if complete
const submitAnswer = useCallback(async (answer: string) => {
  const sessionId = sessionIdRef.current
  if (!sessionId) return
  setState(prev => ({ ...prev, error: null }))
  try {
    const result = await apiSubmitAnswer(sessionId, answer)
    setState(prev => ({
      ...prev,
      profile: result.profile,
      currentQuestion: result.question,
      completionScore: result.completion_score,
      phase: result.is_complete || !result.question ? 'answering' : prev.phase,
    }))
  } catch (e: unknown) {
    setState(prev => ({ ...prev, error: e instanceof Error ? e.message : 'Erreur' }))
  }
}, [])

// skipOnboarding: POST /skip
const skipOnboarding = useCallback(async () => {
  const sessionId = sessionIdRef.current
  if (!sessionId) return
  await apiSkipOnboarding(sessionId)
  setState(prev => ({ ...prev, currentQuestion: null, phase: 'answering' }))
}, [])
```

- [ ] **Step 3: Update `onboarding.tsx` route**

Replace `QuestionsPanel` usage with `QuestionCard`:

```tsx
{/* Phase 1→2 — Profile + Question */}
{state.profile && !['ranking', 'results'].includes(state.phase) && (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 items-stretch animate-slide-up">
    <ProfilePanel profile={state.profile} />
    {state.currentQuestion && (
      <QuestionCard
        question={state.currentQuestion}
        completionScore={state.completionScore}
        onSubmit={submitAnswer}
        onSkip={skipOnboarding}
        isLoading={false}
      />
    )}
  </div>
)}
```

- [ ] **Step 4: Test the full onboarding flow in browser**

Start backend + frontend:
```bash
# terminal 1
cd backend && uv run uvicorn app.main:app --reload --port 8000
# terminal 2
cd frontend && npm run dev
```

Navigate to `/candidate/onboarding`, upload a PDF CV. Verify:
- Profile panel shows extracted data
- Single question appears with progress bar
- Answering advances to the next question
- "Passer à la recherche" skip button works

- [ ] **Step 5: Delete `QuestionsPanel.tsx`**

```bash
rm frontend/src/components/onboarding/QuestionsPanel.tsx
```

Verify no remaining imports:
```bash
grep -r "QuestionsPanel" frontend/src/
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/
git commit -m "feat: single-question onboarding UI with progress bar and skip button"
```

---

## Done

Plan 1 complete. The candidate onboarding now:
- Collects a richer profile (hard criteria + soft fit)
- Asks questions one by one, adaptively
- Persists to Supabase after every answer
- Is resumable mid-session via Redis checkpointer
- Has a skip-to-search button at any point

Next: **Plan 2 — Job Discovery Graph** (`docs/superpowers/plans/2026-03-24-job-discovery-graph.md`)
