import json
import asyncio
import logging
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional

from app.core.config import settings
from app.core.database import supabase
from app.services.cv_parser_service import extract_text_from_pdf
from app.services.profile_analyzer_service import analyze_cv
from app.schemas.candidate import CandidateProfile
from app.services.skill_extractor import extract_skills_from_profile
from app.services.embedding_service import EmbeddingService
from app.services.scraper_service import WTTJScraper
from app.services.job_service import JobService
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate

import redis as redis_lib
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/onboarding", tags=["Onboarding"])

# Redis client (same connection as Celery)
redis_client = redis_lib.from_url(settings.REDIS_URL, decode_responses=True)

POOL_TTL = 3600  # Job pool expires after 1 hour


# ── Helpers ──────────────────────────────────────────────────────────────────

def _pool_key(session_id: str) -> str:
    return f"onboarding:pool:{session_id}"

def _profile_key(session_id: str) -> str:
    return f"onboarding:profile:{session_id}"

def _save_profile(session_id: str, profile: CandidateProfile):
    redis_client.setex(_profile_key(session_id), POOL_TTL, profile.model_dump_json())

def _load_profile(session_id: str) -> Optional[CandidateProfile]:
    raw = redis_client.get(_profile_key(session_id))
    if not raw:
        return None
    return CandidateProfile.model_validate_json(raw)

def _add_to_pool(session_id: str, job_ids: list[str]):
    if job_ids:
        redis_client.sadd(_pool_key(session_id), *job_ids)
        redis_client.expire(_pool_key(session_id), POOL_TTL)

def _get_pool(session_id: str) -> list[str]:
    return list(redis_client.smembers(_pool_key(session_id)))


# ── Endpoint 1: Upload CV ─────────────────────────────────────────────────────

@router.post("/upload")
async def upload_cv(file: UploadFile = File(...)):
    """
    Receives a PDF CV, extracts text, analyzes profile, stores in Redis.
    Returns structured profile + clarifying questions + a fresh session_id.
    """
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    file_bytes = await file.read()
    cv_text = extract_text_from_pdf(file_bytes)

    if not cv_text:
        raise HTTPException(
            status_code=422,
            detail="Impossible d'extraire le texte de ce PDF. Le fichier est peut-être scanné ou protégé."
        )

    session_id = str(uuid.uuid4())

    profile = await asyncio.to_thread(analyze_cv, cv_text)

    _save_profile(session_id, profile)
    logger.info(f"[session={session_id}] Upload complete — {profile.job_title_target}, {len(profile.skills)} skills")

    return {
        "session_id": session_id,
        "profile": profile.model_dump(),
    }


# ── Endpoint 2: Answer questions ──────────────────────────────────────────────

class AnswerRequest(BaseModel):
    answers: dict  # {"remote_pref": "remote", "salary_min": 55000}

@router.post("/answer/{session_id}")
async def submit_answers(session_id: str, body: AnswerRequest):
    """
    Merges candidate answers into the stored profile.
    """
    profile = _load_profile(session_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    for field, value in body.answers.items():
        if hasattr(profile, field) and value is not None:
            setattr(profile, field, value)

    _save_profile(session_id, profile)
    return {"profile_updated": True, "profile": profile.model_dump()}


# ── Endpoint 3: Search stream (SSE) ──────────────────────────────────────────

async def _search_algolia_stream(session_id: str, search_terms: list[str]):
    """Async generator: queries Algolia, yields SSE events as jobs are found."""
    query = " ".join(search_terms[:5])
    raw_jobs = await asyncio.to_thread(WTTJScraper.fetch_jobs, query, 3)

    batch_size = 10
    for i in range(0, len(raw_jobs), batch_size):
        batch = raw_jobs[i:i + batch_size]
        db_ids = await asyncio.to_thread(JobService.upsert_wttj_batch, batch, [])
        _add_to_pool(session_id, [f"db:{jid}" for jid in db_ids])
        pool_size = redis_client.scard(_pool_key(session_id))
        yield f"event: jobs_found\ndata: {json.dumps({'source': 'algolia', 'delta': len(batch), 'total': pool_size})}\n\n"
        await asyncio.sleep(0)


async def _search_local_db_stream(session_id: str, profile: CandidateProfile):
    """Async generator: queries pgvector local DB, yields SSE events."""
    profile_text = f"{profile.job_title_target} {' '.join(profile.skills)} {profile.summary}"
    embedding = await asyncio.to_thread(EmbeddingService.generate, profile_text)

    if not embedding:
        return

    resp = await asyncio.to_thread(
        lambda: supabase.rpc("match_jobs_for_candidate", {
            "query_embedding": embedding,
            "match_threshold": 0.3,
            "match_count": 50
        }).execute()
    )

    job_ids = [f"db:{row['id']}" for row in (resp.data or [])]
    _add_to_pool(session_id, job_ids)

    pool_size = redis_client.scard(_pool_key(session_id))
    yield f"event: jobs_found\ndata: {json.dumps({'source': 'local_db', 'delta': len(job_ids), 'total': pool_size})}\n\n"


async def _merge_generators(*gens):
    """Merges multiple async generators, yielding items as they arrive."""
    queue: asyncio.Queue = asyncio.Queue()

    async def drain(gen):
        async for item in gen:
            await queue.put(item)
        await queue.put(None)  # Sentinel

    tasks = [asyncio.create_task(drain(g)) for g in gens]
    finished = 0

    while finished < len(tasks):
        item = await queue.get()
        if item is None:
            finished += 1
        else:
            yield item


async def _generate_search_stream(session_id: str):
    """Main SSE generator for phase 2: parallel Algolia + local DB search."""
    profile = _load_profile(session_id)
    if not profile:
        yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
        return

    yield f'event: phase\ndata: {json.dumps({"id": 2, "label": "Recherche d\'offres en cours..."})}\n\n'

    search_terms = await asyncio.to_thread(
        extract_skills_from_profile,
        f"{profile.job_title_target} {' '.join(profile.skills)}"
    )

    async for event in _merge_generators(
        _search_algolia_stream(session_id, search_terms),
        _search_local_db_stream(session_id, profile)
    ):
        yield event

    total = redis_client.scard(_pool_key(session_id))
    yield f"event: search_done\ndata: {json.dumps({'total': total})}\n\n"
    yield "event: done\ndata: {}\n\n"


@router.get("/search-stream/{session_id}")
async def search_stream(session_id: str):
    """SSE endpoint: runs Algolia + local DB search in parallel, streams job counts."""
    return StreamingResponse(
        _generate_search_stream(session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


# ── Endpoint 4: Rank stream (SSE) ─────────────────────────────────────────────

class RankedJob(BaseModel):
    score: int = Field(description="Score de compatibilité 0-100")
    strengths: list[str] = Field(description="2-3 points forts du matching")
    weaknesses: list[str] = Field(description="1-2 points faibles ou manquants")
    justification: str = Field(description="Explication courte du score en 1-2 phrases")


async def _generate_rank_stream(session_id: str):
    """SSE generator for phase 3: LLM reranking of job pool."""
    profile = _load_profile(session_id)
    if not profile:
        yield f"event: error\ndata: {json.dumps({'error': 'Session not found'})}\n\n"
        return

    pool_ids = _get_pool(session_id)
    if not pool_ids:
        yield f"event: error\ndata: {json.dumps({'error': 'Aucune offre trouvée'})}\n\n"
        return

    yield f"event: phase\ndata: {json.dumps({'id': 3, 'label': 'Sélection des meilleures offres...', 'total': len(pool_ids)})}\n\n"

    # Take top 10 IDs from the pool (already sorted by pgvector similarity)
    db_ids = [pid.replace("db:", "") for pid in pool_ids if pid.startswith("db:")][:10]

    jobs_resp = await asyncio.to_thread(
        lambda: supabase.table("job_postings")
            .select("id, title, description, external_url, source")
            .in_("id", db_ids)
            .eq("status", "active")
            .execute()
    )
    jobs = jobs_resp.data or []

    if not jobs:
        yield f"event: error\ndata: {json.dumps({'error': 'Impossible de charger les offres'})}\n\n"
        return

    profile_text = (
        f"Poste visé: {profile.job_title_target}\n"
        f"Expérience: {profile.experience_years or '?'} ans\n"
        f"Compétences: {', '.join(profile.skills)}\n"
        f"Localisation: {profile.location_pref or 'flexible'}\n"
        f"Remote: {profile.remote_pref or 'flexible'}\n"
        f"Salaire min: {profile.salary_min or 'non précisé'} €\n"
        f"Résumé: {profile.summary}"
    )

    llm = ChatAnthropic(
        model=settings.LLM_MODEL_FAST,  # Haiku: 10x cheaper, sufficient for ranking
        temperature=0,
        max_tokens=512,
        api_key=settings.ANTHROPIC_API_KEY
    )
    structured_llm = llm.with_structured_output(RankedJob)

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         "Tu es un expert RH. Évalue la compatibilité entre ce candidat et cette offre. "
         "Sois direct et précis. Score de 0 à 100."),
        ("human",
         "Profil candidat:\n{profile}\n\n"
         "Offre d'emploi ({title}):\n{description}\n\n"
         "Évalue la compatibilité."),
    ])
    chain = prompt | structured_llm

    # Stream each result immediately as it's scored — no buffering
    rank = 0
    total_jobs = len(jobs)
    for job in jobs:
        try:
            logger.info(f"[rank-stream] scoring job {rank+1}/{total_jobs}: '{job['title']}'")
            result: RankedJob = await asyncio.to_thread(
                chain.invoke, {
                    "profile": profile_text,
                    "title": job["title"],
                    "description": (job.get("description") or "")[:2000],
                }
            )
            logger.info(f"[rank-stream] ✓ job {rank+1}/{total_jobs} score={result.score}/100")
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
            logger.error(f"Ranking failed for job {job['id']}: {e}")
            continue

    yield f"event: done\ndata: {json.dumps({'total': rank})}\n\n"


@router.get("/rank-stream/{session_id}")
async def rank_stream(session_id: str):
    """SSE endpoint: LLM reranks job pool, streams top 10 ranked jobs."""
    return StreamingResponse(
        _generate_rank_stream(session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
