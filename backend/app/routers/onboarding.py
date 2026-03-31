import json
import asyncio
import logging
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Request, Depends
from fastapi.responses import StreamingResponse
from app.core.auth import AuthUser, get_current_user
from typing import Any
from pydantic import BaseModel
from app.core.config import settings
from app.core.database import supabase
from app.services.cv_parser_service import extract_text_from_pdf
from app.services.profile_analyzer_service import analyze_cv
from app.schemas.candidate import CandidateProfile, compute_completion_score
from langchain_core.prompts import ChatPromptTemplate
from app.core.llm import get_llm_fast
from langgraph.types import Command
from app.services.profile_conversation_graph import build_profile_graph
from app.services.job_discovery_graph import (
    search_algolia_node,
    search_pgvector_node,
    dedup_merge_node,
    enrich_jit_node,
    RankedJob,
    JobDiscoveryState,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])

# Graph singleton — built once on module load.
# checkpointer.setup() is called at app startup (see main.py lifespan).
_profile_graph, _checkpointer = build_profile_graph(settings.REDIS_URL)

# Reranking chain singleton — shared across all SSE connections
_ranking_chain = ChatPromptTemplate.from_messages([
    ("system", "Tu es un expert RH. Évalue la compatibilité entre ce candidat et cette offre. Score de 0 à 100."),
    ("human", "Profil:\n{profile}\n\nOffre ({title}):\n{description}\n\nÉvalue la compatibilité."),
]) | get_llm_fast(max_tokens=512).with_structured_output(RankedJob)


# ── Endpoint 1: Upload CV ─────────────────────────────────────────────────────

@router.post("/upload")
async def upload_cv(file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    _MAX_CV_SIZE = 10 * 1024 * 1024  # 10 MB
    file_bytes = await file.read(_MAX_CV_SIZE + 1)
    if len(file_bytes) > _MAX_CV_SIZE:
        raise HTTPException(status_code=413, detail="CV file exceeds 10 MB limit")
    cv_text = extract_text_from_pdf(file_bytes)
    if not cv_text:
        raise HTTPException(status_code=422, detail="Impossible d'extraire le texte de ce PDF.")

    session_id = str(uuid.uuid4())

    # Pre-fill profile from CV (single LLM call, no questions)
    profile = await asyncio.to_thread(analyze_cv, cv_text)

    # Create candidate row in Supabase
    await asyncio.to_thread(
        lambda: supabase.table("candidates").insert({
            "id": session_id,
            "profile": profile.model_dump(),
            "onboarding_complete": False,
        }).execute()
    )

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


# ── Endpoint 2: Answer question ───────────────────────────────────────────────

class AnswerRequest(BaseModel):
    answer: str

@router.post("/answer/{session_id}")
async def submit_answer(session_id: str, body: AnswerRequest):
    config = {"configurable": {"thread_id": session_id}}
    try:
        result = await asyncio.to_thread(
            _profile_graph.invoke,
            Command(resume=body.answer),
            config,
        )
    except Exception as e:
        logger.error(f"[submit_answer] session={session_id} error: {e}")
        raise HTTPException(status_code=404, detail="Session not found or already complete")
    return {
        "profile": result["profile"],
        "question": result.get("current_question"),
        "completion_score": result["profile"].get("completion_score", 0.0),
        "is_complete": result.get("is_complete", False),
    }


# ── Endpoint 3: Skip to results ───────────────────────────────────────────────

@router.post("/skip/{session_id}")
async def skip_to_results(session_id: str):
    """Finalize profile immediately, skipping remaining questions."""
    config = {"configurable": {"thread_id": session_id}}
    snapshot = _profile_graph.get_state(config)
    if not snapshot.values:
        raise HTTPException(status_code=404, detail="Session not found")
    if not snapshot.next:
        raise HTTPException(status_code=400, detail="Session already complete or not started")

    # Update graph state: set is_complete=True so gap_analyzer routes to finalize
    _profile_graph.update_state(config, {"is_complete": True})

    # Resume the graph — it will run gap_analyzer (sees is_complete=True) → finalize
    result = await asyncio.to_thread(
        _profile_graph.invoke, Command(resume=""), config
    )
    return {"profile": result["profile"], "is_complete": True}


# ── Endpoint 4: Get / Patch profile ──────────────────────────────────────────

@router.get("/profile/{session_id}")
async def get_profile(session_id: str):
    resp = supabase.table("candidates").select("profile").eq("id", session_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return resp.data["profile"]

@router.post("/claim/{session_id}")
async def claim_session(session_id: str, user: AuthUser = Depends(get_current_user)):
    """Lie une session d'onboarding anonyme à un compte auth."""
    resp = supabase.table("candidates").select("id,user_id").eq("id", session_id).maybe_single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Session not found")
    existing_uid = resp.data.get("user_id")
    if existing_uid and existing_uid != user.id:
        raise HTTPException(status_code=403, detail="Session already claimed")
        
    supabase.table("candidates").update({"user_id": user.id}).eq("id", session_id).execute()
    # Ensure user exists in public.users (though trigger does it, this is a safe fallback or not needed if trigger is there)
    return {"claimed": True}
        

class ProfilePatch(BaseModel):
    updates: dict[str, Any]

@router.patch("/profile/{session_id}")
async def patch_profile(session_id: str, body: ProfilePatch):
    """Direct profile update — bypasses graph (used by structured edit form)."""
    resp = supabase.table("candidates").select("profile").eq("id", session_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = CandidateProfile.model_validate(resp.data["profile"])
    _READONLY = {"completion_score"}  # computed fields — never set directly
    for field, value in body.updates.items():
        if hasattr(profile, field) and field not in _READONLY:
            setattr(profile, field, value)

    profile.completion_score = compute_completion_score(profile)

    supabase.table("candidates").update({"profile": profile.model_dump()}).eq("id", session_id).execute()
    return {"profile": profile.model_dump()}


# ── Endpoint 5: Search stream (SSE) ──────────────────────────────────────────

async def _generate_discovery_stream(session_id: str, request: Request):
    """
    Unified SSE stream: parallel search → JIT enrichment → LLM reranking.
    Emits: phase, jobs_found, search_done, job_ranked, done.
    """
    # Load profile from Supabase (persisted by ProfileConversationGraph)
    resp = await asyncio.to_thread(
        lambda: supabase.table("candidates").select("profile").eq("id", session_id).single().execute()
    )
    if not resp.data or not resp.data.get("profile"):
        yield f"event: error\ndata: {json.dumps({'error': 'Profile not found'})}\n\n"
        return

    profile = resp.data["profile"]
    yield "event: phase\ndata: " + json.dumps({"id": 1, "label": "Recherche d'offres..."}) + "\n\n"

    state: JobDiscoveryState = {
        "session_id": session_id,
        "profile": profile,
        "algolia_jobs": [],
        "pgvector_jobs": [],
        "merged_jobs": [],
        "enriched_jobs": [],
        "ranked_jobs": [],
    }

    # Parallel search
    algolia_result, pgvector_result = await asyncio.gather(
        asyncio.to_thread(search_algolia_node, state),
        asyncio.to_thread(search_pgvector_node, state),
    )
    state["algolia_jobs"] = algolia_result["algolia_jobs"]
    state["pgvector_jobs"] = pgvector_result["pgvector_jobs"]

    total = len(state["algolia_jobs"]) + len(state["pgvector_jobs"])
    yield f"event: jobs_found\ndata: {json.dumps({'source': 'algolia', 'delta': len(state['algolia_jobs']), 'total': total})}\n\n"
    yield f"event: jobs_found\ndata: {json.dumps({'source': 'local_db', 'delta': len(state['pgvector_jobs']), 'total': total})}\n\n"

    # Dedup + enrich
    state.update(await asyncio.to_thread(dedup_merge_node, state))
    yield f"event: search_done\ndata: {json.dumps({'total': len(state['merged_jobs'])})}\n\n"

    state.update(await asyncio.to_thread(enrich_jit_node, state))

    yield f"event: phase\ndata: {json.dumps({'id': 3, 'label': 'Sélection des meilleures offres...', 'total': len(state['enriched_jobs'])})}\n\n"

    # Rerank — stream each job as scored
    cp = CandidateProfile.model_validate(profile)
    profile_text = (
        f"Poste visé: {cp.job_title_target}\nExpérience: {cp.experience_years or '?'} ans\n"
        f"Compétences: {', '.join(cp.skills)}\nAspirations: {cp.aspirations or 'non précisé'}\n"
        f"Valeurs: {', '.join(cp.values) if cp.values else 'non précisé'}\nRésumé: {cp.summary}"
    )

    rank = 0
    for job in state["enriched_jobs"]:
        if await request.is_disconnected():
            logger.info(f"[discovery-stream] Client disconnected from session {session_id}")
            break
            
        try:
            result: RankedJob = await asyncio.to_thread(_ranking_chain.invoke, {
                "profile": profile_text,
                "title": job["title"],
                "description": (job.get("description") or "")[:2000],
            })
            rank += 1
            payload = {
                "rank": rank,
                "score": result.score,
                "job": {
                    "id": job["id"],
                    "title": job["title"],
                    "source": job.get("source", ""),
                    "external_url": job.get("external_url"),
                    "description_snippet": (job.get("description") or "")[:200],
                },
                "strengths": result.strengths,
                "weaknesses": result.weaknesses,
                "justification": result.justification,
            }
            yield f"event: job_ranked\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error(f"[discovery-stream] ranking failed for {job.get('id')}: {e}")

    yield f"event: done\ndata: {json.dumps({'total': rank})}\n\n"


@router.get("/search-stream/{session_id}")
async def search_stream(session_id: str, request: Request):
    """Unified SSE: parallel search → JIT enrichment → LLM reranking."""
    return StreamingResponse(
        _generate_discovery_stream(session_id, request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
