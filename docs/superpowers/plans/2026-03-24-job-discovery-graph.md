# Job Discovery Graph — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc async SSE generators in `onboarding.py` with a clean `JobDiscoveryGraph` that runs parallel search, conditional JIT enrichment, and LLM reranking — streamed as a single unified SSE endpoint.

**Architecture:** LangGraph graph with parallel `search_algolia` + `search_pgvector` nodes (via `Send`), followed by `dedup_merge` → `enrich_jit` → `llm_rerank`. No checkpointer — runs fresh per request. Single unified SSE stream replaces the two current endpoints.

**Tech Stack:** LangGraph (Send API), FastAPI StreamingResponse, ScrapingBee/Scrapling (JIT enrichment), Claude Haiku (reranking), Langfuse

**Spec:** `docs/superpowers/specs/2026-03-24-candidate-profile-and-job-discovery-design.md`

**Prerequisite:** Plan 1 (`2026-03-24-profile-conversation-graph.md`) must be complete — this plan depends on the richer `CandidateProfile` schema.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/services/job_discovery_graph.py` | Create | LangGraph graph: parallel search, dedup, enrich, rerank nodes |
| `backend/app/routers/onboarding.py` | Modify | Replace search-stream + rank-stream with unified `/search-stream/{id}` |
| `backend/tests/test_job_discovery_graph.py` | Create | Unit tests for dedup_merge and enrich_jit nodes |
| `frontend/src/api/onboarding.ts` | Modify | Remove `openRankStream`, update `openSearchStream` for unified events |
| `frontend/src/hooks/useOnboardingStream.ts` | Modify | Handle unified stream (search + rank in one flow) |

---

## Task 1: `JobDiscoveryGraph` — state + search nodes

**Files:**
- Create: `backend/app/services/job_discovery_graph.py`
- Test: `backend/tests/test_job_discovery_graph.py`

- [ ] **Step 1: Write failing test for search nodes**

Create `backend/tests/test_job_discovery_graph.py`:

```python
from unittest.mock import patch, MagicMock
from app.services.job_discovery_graph import dedup_merge_node, enrich_jit_node

SAMPLE_JOBS = [
    {"id": "1", "title": "Dev Python", "description": "Short", "external_url": "https://wttj.co/1", "source": "wttj"},
    {"id": "2", "title": "Dev React", "description": "A" * 600, "external_url": "https://wttj.co/2", "source": "wttj"},
    {"id": "3", "title": "Dev Python", "description": "Short", "external_url": "https://wttj.co/1", "source": "wttj"},  # dup of id=1
]

def test_dedup_merge_removes_duplicates():
    state = {
        "algolia_jobs": [SAMPLE_JOBS[0], SAMPLE_JOBS[2]],  # same external_url
        "pgvector_jobs": [SAMPLE_JOBS[1]],
    }
    result = dedup_merge_node(state)
    ids = [j["id"] for j in result["merged_jobs"]]
    assert len(set(ids)) == len(ids), "Duplicate ids found"
    assert len(result["merged_jobs"]) == 2

def test_dedup_merge_keeps_top_15():
    many_jobs = [{"id": str(i), "title": f"Job {i}", "description": "x", "external_url": f"https://x.co/{i}", "source": "wttj"} for i in range(20)]
    state = {"algolia_jobs": many_jobs, "pgvector_jobs": []}
    result = dedup_merge_node(state)
    assert len(result["merged_jobs"]) <= 15

def test_enrich_jit_skips_long_descriptions():
    state = {
        "merged_jobs": [SAMPLE_JOBS[1]],  # description > 500 chars
        "profile": {"job_title_target": "Dev", "skills": [], "summary": "", "values": [], "preferred_sector": [], "completion_score": 0},
    }
    with patch("app.services.job_discovery_graph._scrape_job_description") as mock_scrape:
        result = enrich_jit_node(state)
    mock_scrape.assert_not_called()
    assert result["enriched_jobs"][0]["description"] == SAMPLE_JOBS[1]["description"]

def test_enrich_jit_scrapes_short_descriptions():
    state = {
        "merged_jobs": [SAMPLE_JOBS[0]],  # short description
        "profile": {"job_title_target": "Dev", "skills": [], "summary": "", "values": [], "preferred_sector": [], "completion_score": 0},
    }
    with patch("app.services.job_discovery_graph._scrape_job_description", return_value="Full description here " * 30) as mock_scrape:
        result = enrich_jit_node(state)
    mock_scrape.assert_called_once()
    assert len(result["enriched_jobs"][0]["description"]) > 500
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
uv run pytest tests/test_job_discovery_graph.py -v
```

Expected: `ModuleNotFoundError: No module named 'app.services.job_discovery_graph'`

- [ ] **Step 3: Create graph file with state + search nodes**

Create `backend/app/services/job_discovery_graph.py`:

```python
import asyncio
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
    db_ids = JobService.upsert_wttj_batch(raw_jobs, [])

    # Return job dicts with db ids for downstream nodes
    jobs = []
    for raw, db_id in zip(raw_jobs, db_ids):
        jobs.append({
            "id": db_id,
            "title": raw.get("title", ""),
            "description": raw.get("description", ""),
            "external_url": raw.get("external_url"),
            "source": "wttj",
        })

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

    # pgvector jobs have similarity score — sort by it descending, algolia jobs go last
    deduped.sort(key=lambda j: j.get("_similarity", 0.0), reverse=True)
    merged = deduped[:TOP_N_JOBS]

    logger.info(f"[dedup_merge] {len(all_jobs)} → {len(merged)} after dedup+limit")
    return {"merged_jobs": merged}


# ── JIT enrichment ────────────────────────────────────────────────────────────

def _scrape_job_description(url: str) -> str:
    """Scrapes full job description from source URL. Returns empty string on failure."""
    try:
        if settings.ENVIRONMENT == "production":
            from scrapingbee import ScrapingBeeClient
            client = ScrapingBeeClient(api_key=settings.SCRAPINGBEE_API_KEY)
            response = client.get(url, params={"render_js": False})
            return response.text[:5000]
        else:
            from scrapling import StealthyFetcher
            page = StealthyFetcher.fetch(url)
            # Extract main content — WTTJ job descriptions are in <div class="job-content">
            content = page.find("div", {"class": "job-content"})
            return content.text[:5000] if content else ""
    except Exception as e:
        logger.warning(f"[enrich_jit] scraping failed for {url}: {e}")
        return ""


@observe(name="enrich_jit")
def enrich_jit_node(state: JobDiscoveryState) -> dict:
    """Scrapes full descriptions for jobs with short snippets. Parallel, falls back to snippet."""
    jobs = state["merged_jobs"][:RANK_TOP_N]

    to_enrich = [j for j in jobs if len(j.get("description") or "") < ENRICH_THRESHOLD and j.get("external_url")]
    to_skip = [j for j in jobs if j not in to_enrich]

    # Enrich in parallel
    from concurrent.futures import ThreadPoolExecutor
    enriched = list(to_skip)  # already rich enough

    if to_enrich:
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(_scrape_job_description, j["external_url"]): j for j in to_enrich}
            for future, job in futures.items():
                full_desc = future.result()
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
                "rank": i + 1,
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

    # Sort by score descending, re-assign ranks
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

    # Parallel search fan-out via Send, fan-in at dedup_merge
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
uv run pytest tests/test_job_discovery_graph.py -v
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/job_discovery_graph.py backend/tests/test_job_discovery_graph.py
git commit -m "feat: JobDiscoveryGraph with parallel search, JIT enrichment, and LLM reranking"
```

---

## Task 2: Unified SSE endpoint in onboarding router

**Files:**
- Modify: `backend/app/routers/onboarding.py`

The current `search-stream` + `rank-stream` endpoints are replaced by a single `search-stream` endpoint that runs the full `JobDiscoveryGraph` and streams events progressively.

- [ ] **Step 1: Import node functions for use in the unified stream**

At the top of `backend/app/routers/onboarding.py`, add:

```python
from app.services.job_discovery_graph import (
    search_algolia_node, search_pgvector_node,
    dedup_merge_node, enrich_jit_node,
    RankedJob,
)
```

Note: `build_job_discovery_graph()` is not used in the streaming endpoint — the nodes are called directly to enable mid-pipeline SSE event emission. The compiled graph is useful for future batch (non-streaming) use cases.

- [ ] **Step 2: Replace both SSE endpoints with unified stream**

Remove `_generate_search_stream`, `search_stream`, `_generate_rank_stream`, and `rank_stream` functions. Add:

```python
async def _generate_discovery_stream(session_id: str):
    """
    Unified SSE stream: runs JobDiscoveryGraph end-to-end.
    Emits: jobs_found (search), search_done, job_ranked (rerank), done.
    """
    import json

    # Load profile from Supabase (persisted by ProfileConversationGraph)
    resp = await asyncio.to_thread(
        lambda: supabase.table("candidates").select("profile").eq("id", session_id).single().execute()
    )
    if not resp.data or not resp.data.get("profile"):
        yield f"event: error\ndata: {json.dumps({'error': 'Profile not found'})}\\n\\n"
        return

    profile = resp.data["profile"]

    yield f"event: phase\ndata: {json.dumps({'id': 1, 'label': 'Recherche d\\'offres...'})}\\n\\n"

    # Run the graph — we intercept at each node by using a custom callback
    # Since LangGraph doesn't natively stream mid-graph, we run nodes manually
    # and yield SSE events between stages.

    from app.services.job_discovery_graph import (
        search_algolia_node, search_pgvector_node,
        dedup_merge_node, enrich_jit_node, llm_rerank_node,
        JobDiscoveryState,
        RankedJob,
    )
    import operator

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
    yield f"event: jobs_found\ndata: {json.dumps({'source': 'algolia', 'delta': len(state['algolia_jobs']), 'total': total})}\\n\\n"
    yield f"event: jobs_found\ndata: {json.dumps({'source': 'local_db', 'delta': len(state['pgvector_jobs']), 'total': total})}\\n\\n"

    # Dedup + enrich
    state.update(await asyncio.to_thread(dedup_merge_node, state))
    total_after_dedup = len(state["merged_jobs"])
    yield f"event: search_done\ndata: {json.dumps({'total': total_after_dedup})}\\n\\n"

    state.update(await asyncio.to_thread(enrich_jit_node, state))

    yield f"event: phase\ndata: {json.dumps({'id': 3, 'label': 'Sélection des meilleures offres...', 'total': len(state['enriched_jobs'])})}\\n\\n"

    # Rerank — stream each job as scored
    from langchain_anthropic import ChatAnthropic
    from langchain_core.prompts import ChatPromptTemplate
    from app.schemas.candidate import CandidateProfile as CP

    cp = CP.model_validate(profile)
    profile_text = (
        f"Poste visé: {cp.job_title_target}\nExpérience: {cp.experience_years or '?'} ans\n"
        f"Compétences: {', '.join(cp.skills)}\nAspirations: {cp.aspirations or 'non précisé'}\n"
        f"Valeurs: {', '.join(cp.values) or 'non précisé'}\nRésumé: {cp.summary}"
    )
    llm = ChatAnthropic(model=settings.LLM_MODEL_FAST, temperature=0, max_tokens=512,
                        api_key=settings.ANTHROPIC_API_KEY)
    structured_llm = llm.with_structured_output(RankedJob)
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Tu es un expert RH. Évalue la compatibilité entre ce candidat et cette offre. Score de 0 à 100."),
        ("human", "Profil:\n{profile}\n\nOffre ({title}):\n{description}\n\nÉvalue la compatibilité."),
    ])
    chain = prompt | structured_llm

    rank = 0
    for job in state["enriched_jobs"]:
        try:
            result: RankedJob = await asyncio.to_thread(chain.invoke, {
                "profile": profile_text,
                "title": job["title"],
                "description": (job.get("description") or "")[:2000],
            })
            rank += 1
            payload = {
                "rank": rank, "score": result.score,
                "job": {
                    "id": job["id"], "title": job["title"],
                    "source": job.get("source", ""),
                    "external_url": job.get("external_url"),
                    "description_snippet": (job.get("description") or "")[:200],
                },
                "strengths": result.strengths,
                "weaknesses": result.weaknesses,
                "justification": result.justification,
            }
            yield f"event: job_ranked\ndata: {json.dumps(payload, ensure_ascii=False)}\\n\\n"
        except Exception as e:
            logger.error(f"[discovery-stream] ranking failed for {job.get('id')}: {e}")

    yield f"event: done\ndata: {json.dumps({'total': rank})}\\n\\n"


@router.get("/search-stream/{session_id}")
async def search_stream(session_id: str):
    """Unified SSE: parallel search → JIT enrichment → LLM reranking."""
    return StreamingResponse(
        _generate_discovery_stream(session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 3: Remove the old `rank-stream` endpoint**

The old `GET /onboarding/rank-stream/{session_id}` endpoint is removed. The frontend no longer calls it.

- [ ] **Step 4: Verify API starts cleanly**

```bash
uv run uvicorn app.main:app --reload --port 8000
```

Expected: no import errors. Check `GET /docs` shows `/onboarding/search-stream/{session_id}` and no longer shows `/onboarding/rank-stream/{session_id}`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/onboarding.py
git commit -m "feat: unified job discovery SSE endpoint replacing search-stream + rank-stream"
```

---

## Task 3: Frontend — unified stream handler

**Files:**
- Modify: `frontend/src/api/onboarding.ts`
- Modify: `frontend/src/hooks/useOnboardingStream.ts`

- [ ] **Step 1: Remove `openRankStream` from API client**

In `frontend/src/api/onboarding.ts`:
- Remove `openRankStream` export
- Remove `SSERankEvent` type (its events are now part of the search stream)
- Update `SSESearchEvent` to include `job_ranked` and `done` events:

```typescript
export type SSESearchEvent =
  | { type: 'phase'; id: number; label: string; total?: number }
  | { type: 'jobs_found'; source: string; delta: number; total: number }
  | { type: 'search_done'; total: number }
  | { type: 'job_ranked'; data: RankedJobResult }
  | { type: 'done'; total: number }
  | { type: 'error'; error: string }
```

Update `openSearchStream` to handle the new event types:

```typescript
export function openSearchStream(
  sessionId: string,
  onEvent: (event: SSESearchEvent) => void,
  onError?: (err: Error) => void
): () => void {
  return openSSEStream(
    `${API_BASE_URL}/onboarding/search-stream/${sessionId}`,
    (eventName, data) => {
      const d = data as Record<string, unknown>
      if (eventName === 'phase') onEvent({ type: 'phase', ...d } as SSESearchEvent)
      else if (eventName === 'jobs_found') onEvent({ type: 'jobs_found', ...d } as SSESearchEvent)
      else if (eventName === 'search_done') onEvent({ type: 'search_done', ...d } as SSESearchEvent)
      else if (eventName === 'job_ranked') onEvent({ type: 'job_ranked', data: data as RankedJobResult })
      else if (eventName === 'done') onEvent({ type: 'done', ...d } as SSESearchEvent)
      else if (eventName === 'error') onEvent({ type: 'error', ...d } as SSESearchEvent)
    },
    onError
  )
}
```

- [ ] **Step 2: Update `useOnboardingStream` hook**

Remove `startRanking` callback and `closeRankRef`. The unified stream handles ranking automatically after search completes:

```typescript
// In uploadCv callback, update stream handler:
closeSearchRef.current = openSearchStream(
  result.session_id,
  (event) => {
    if (event.type === 'jobs_found') {
      setState(prev => ({
        ...prev,
        phase: prev.phase === 'profiling' ? 'searching' : prev.phase,
        jobsTotal: event.total,
        jobSources: { ...prev.jobSources, [event.source]: (prev.jobSources[event.source] ?? 0) + event.delta },
      }))
    } else if (event.type === 'search_done') {
      setState(prev => ({
        ...prev,
        // currentQuestion === null means candidate finished/skipped Q&A → ready for ranking
        phase: prev.currentQuestion === null ? 'answering' : prev.phase,
      }))
    } else if (event.type === 'phase' && event.id === 3) {
      // Reranking phase started — only transition if user already skipped/answered
      setState(prev => ({
        ...prev,
        phase: prev.phase === 'answering' ? 'ranking' : prev.phase,
      }))
    } else if (event.type === 'job_ranked') {
      setState(prev => ({ ...prev, rankedJobs: [...prev.rankedJobs, event.data] }))
    } else if (event.type === 'done') {
      setState(prev => ({ ...prev, phase: 'results' }))
    } else if (event.type === 'error') {
      setState(prev => ({ ...prev, error: event.error }))
    }
  }
)
```

- [ ] **Step 3: Remove `startRanking` from onboarding route**

In `frontend/src/routes/candidate/onboarding.tsx`:
- Remove `startRanking` from the hook destructure
- Remove the "Voir mes X offres" CTA button (ranking now starts automatically when stream reaches phase 3)
- The transition from `answering` → `ranking` is now triggered by the `phase: id=3` SSE event

- [ ] **Step 4: Full end-to-end test in browser**

```bash
# terminal 1
cd backend && uv run uvicorn app.main:app --reload --port 8000
# terminal 2
cd frontend && npm run dev
```

Upload a PDF CV. Verify:
1. Profile extracted, first question appears
2. Job counter increments during search (background)
3. After skip or all questions answered → ranking starts automatically
4. Jobs appear one by one as ranked
5. Results page shows ranked jobs with scores + justifications

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/onboarding.ts frontend/src/hooks/useOnboardingStream.ts frontend/src/routes/candidate/onboarding.tsx
git commit -m "feat: frontend handles unified discovery stream (search + rank in one flow)"
```

---

## Done

Plan 2 complete. The job discovery pipeline now:
- Runs parallel WTTJ Algolia + pgvector search
- JIT-enriches job descriptions only when needed (cheap)
- LLM-ranks with richer profile context (aspirations, values)
- Streams as a single unified SSE endpoint
- Starts ranking automatically after candidate completes/skips Q&A
