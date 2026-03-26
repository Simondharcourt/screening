import logging
from typing import TypedDict, Annotated
import operator

from langgraph.graph import StateGraph, END
from langgraph.types import Send
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from langfuse import observe

from app.core.config import settings
from app.core.database import supabase
from app.services.scraper_service import WTTJScraper
from app.services.embedding_service import EmbeddingService
from app.services.job_service import JobService
from app.schemas.candidate import CandidateProfile

logger = logging.getLogger(__name__)

ENRICH_THRESHOLD = 500    # chars — below this, JIT scrape the full description
TOP_N_JOBS = 15           # kept after dedup
RANK_TOP_N = 10           # sent to LLM reranker


# ── Graph state ───────────────────────────────────────────────────────────────

class JobDiscoveryState(TypedDict):
    session_id: str
    profile: dict                                      # CandidateProfile.model_dump()
    algolia_jobs: Annotated[list[dict], operator.add]  # parallel fan-in
    pgvector_jobs: Annotated[list[dict], operator.add] # parallel fan-in
    merged_jobs: list[dict]
    enriched_jobs: list[dict]
    ranked_jobs: list[dict]


# ── Search nodes ──────────────────────────────────────────────────────────────

@observe(name="search_algolia")
def search_algolia_node(state: JobDiscoveryState) -> dict:
    """Queries WTTJ Algolia, upserts to local DB, returns job dicts."""
    from app.services.skill_extractor import extract_skills_from_profile
    profile = CandidateProfile.model_validate(state["profile"])

    search_text = f"{profile.job_title_target} {' '.join(profile.skills[:5])}"
    search_terms = extract_skills_from_profile(search_text)
    query = " ".join(search_terms[:5])

    raw_jobs = WTTJScraper.fetch_jobs(query, nb_pages=3)
    JobService.upsert_wttj_batch(raw_jobs, [])  # persist to DB (side effect only)

    # Use Algolia's external_id as the stable key — avoids zip misalignment
    # from upsert_wttj_batch skipping jobs with no external_id.
    jobs = [
        {
            "id": str(raw.get("id", "")),
            "title": raw.get("title", ""),
            "description": raw.get("description", ""),
            "external_url": raw.get("external_url"),
            "source": "wttj",
        }
        for raw in raw_jobs
        if raw.get("id")
    ]

    logger.info(f"[search_algolia] {len(jobs)} jobs fetched")
    return {"algolia_jobs": jobs}


@observe(name="search_pgvector")
def search_pgvector_node(state: JobDiscoveryState) -> dict:
    """Queries local DB via pgvector similarity search."""
    profile = CandidateProfile.model_validate(state["profile"])
    embedding_text = f"{profile.job_title_target} {' '.join(profile.skills)} {profile.summary} {profile.aspirations or ''}"
    embedding = EmbeddingService.generate(embedding_text)

    if not embedding:
        return {"pgvector_jobs": []}

    resp = supabase.rpc("match_jobs_for_candidate", {
        "query_embedding": embedding,
        "match_threshold": 0.3,
        "match_count": 30,
    }).execute()

    jobs = []
    for row in (resp.data or []):
        jobs.append({
            "id": row["id"],
            "title": row.get("title", ""),
            "description": row.get("description", ""),
            "external_url": row.get("external_url"),
            "source": row.get("source", "wttj"),
            "_similarity": row.get("similarity", 0.0),
        })

    logger.info(f"[search_pgvector] {len(jobs)} jobs matched")
    return {"pgvector_jobs": jobs}


# ── Dedup + merge ─────────────────────────────────────────────────────────────

@observe(name="dedup_merge")
def dedup_merge_node(state: JobDiscoveryState) -> dict:
    """Merges algolia + pgvector results, deduplicates by external_url, keeps top N."""
    all_jobs = state["algolia_jobs"] + state["pgvector_jobs"]

    seen_urls: set[str] = set()
    deduped = []
    for job in all_jobs:
        key = job.get("external_url") or job.get("id")
        if key and key not in seen_urls:
            seen_urls.add(key)
            deduped.append(job)

    deduped.sort(key=lambda j: j.get("_similarity", 0.0), reverse=True)
    merged = deduped[:TOP_N_JOBS]

    logger.info(f"[dedup_merge] {len(all_jobs)} → {len(merged)} after dedup+limit")
    return {"merged_jobs": merged}


# ── JIT enrichment ────────────────────────────────────────────────────────────

def _scrape_job_description(url: str) -> str:
    """Scrapes full job description from source URL. Returns empty string on failure."""
    from app.services.jit_enrichment_service import JITEnrichmentService
    return JITEnrichmentService.fetch_full_description(url) or ""


@observe(name="enrich_jit")
def enrich_jit_node(state: JobDiscoveryState) -> dict:
    """Scrapes full descriptions for jobs with short snippets. Parallel, falls back to snippet."""
    jobs = state["merged_jobs"][:RANK_TOP_N]

    short_job_ids: set[str] = {
        j["id"] for j in jobs
        if len(j.get("description") or "") < ENRICH_THRESHOLD and j.get("external_url")
    }
    to_enrich = [j for j in jobs if j["id"] in short_job_ids]
    to_skip = [j for j in jobs if j["id"] not in short_job_ids]

    enriched = list(to_skip)

    if to_enrich:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_job = {executor.submit(_scrape_job_description, j["external_url"]): j for j in to_enrich}
            for future in as_completed(future_to_job):
                job = future_to_job[future]
                try:
                    full_desc = future.result()
                except Exception as e:
                    logger.warning(f"[enrich_jit] scrape failed for {job.get('external_url')}: {e}")
                    full_desc = None
                enriched_job = dict(job)
                enriched_job["description"] = full_desc if full_desc else job.get("description", "")
                enriched.append(enriched_job)

        logger.info(f"[enrich_jit] enriched {len(to_enrich)}/{len(jobs)} jobs")

    return {"enriched_jobs": enriched}


# ── LLM rerank ────────────────────────────────────────────────────────────────

class RankedJob(BaseModel):
    score: int = Field(description="Score de compatibilité 0-100")
    strengths: list[str] = Field(description="2-3 points forts du matching")
    weaknesses: list[str] = Field(description="1-2 points faibles ou manquants")
    justification: str = Field(description="Explication courte en 1-2 phrases")


@observe(name="llm_rerank")
def llm_rerank_node(state: JobDiscoveryState) -> dict:
    """Scores each enriched job against the candidate profile. Returns ranked list."""
    profile = CandidateProfile.model_validate(state["profile"])
    jobs = state["enriched_jobs"]

    profile_text = (
        f"Poste visé: {profile.job_title_target}\n"
        f"Expérience: {profile.experience_years or '?'} ans\n"
        f"Compétences: {', '.join(profile.skills)}\n"
        f"Remote: {profile.remote_pref or 'flexible'}\n"
        f"Salaire min: {profile.salary_min or 'non précisé'} €\n"
        f"Aspirations: {profile.aspirations or 'non précisé'}\n"
        f"Valeurs: {', '.join(profile.values) or 'non précisé'}\n"
        f"Résumé: {profile.summary}"
    )

    llm = ChatAnthropic(
        model=settings.LLM_MODEL_FAST,
        temperature=0,
        max_tokens=512,
        api_key=settings.ANTHROPIC_API_KEY,
    )
    structured_llm = llm.with_structured_output(RankedJob)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Tu es un expert RH. Évalue la compatibilité entre ce candidat et cette offre. Score de 0 à 100."),
        ("human", "Profil candidat:\n{profile}\n\nOffre ({title}):\n{description}\n\nÉvalue la compatibilité."),
    ])
    chain = prompt | structured_llm

    ranked = []
    for i, job in enumerate(jobs):
        try:
            result: RankedJob = chain.invoke({
                "profile": profile_text,
                "title": job["title"],
                "description": (job.get("description") or "")[:2000],
            })
            ranked.append({
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
            })
            logger.info(f"[llm_rerank] job {i+1}/{len(jobs)} '{job['title']}' → score={result.score}")
        except Exception as e:
            logger.error(f"[llm_rerank] failed for job {job.get('id')}: {e}")

    ranked.sort(key=lambda x: x["score"], reverse=True)
    for i, r in enumerate(ranked):
        r["rank"] = i + 1

    return {"ranked_jobs": ranked}


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_job_discovery_graph():
    """Builds and compiles the JobDiscoveryGraph. No checkpointer — stateless per request."""
    builder = StateGraph(JobDiscoveryState)

    builder.add_node("search_algolia", search_algolia_node)
    builder.add_node("search_pgvector", search_pgvector_node)
    builder.add_node("dedup_merge", dedup_merge_node)
    builder.add_node("enrich_jit", enrich_jit_node)
    builder.add_node("llm_rerank", llm_rerank_node)

    def fan_out_search(state: JobDiscoveryState):
        return [
            Send("search_algolia", state),
            Send("search_pgvector", state),
        ]

    builder.set_conditional_entry_point(fan_out_search)
    builder.add_edge("search_algolia", "dedup_merge")
    builder.add_edge("search_pgvector", "dedup_merge")
    builder.add_edge("dedup_merge", "enrich_jit")
    builder.add_edge("enrich_jit", "llm_rerank")
    builder.add_edge("llm_rerank", END)

    return builder.compile()
