# Candidate Profile & Job Discovery — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Redesign of candidate onboarding profile collection and job discovery/ranking pipeline using LangGraph

---

## 1. Context & Goals

### Current state
- `analyze_cv()` does one LLM call on upload → fills a thin `CandidateProfile` (7 fields, max 3 questions shown all at once)
- All questions answered in a single batch, merged by field name
- Profile lives only in Redis (ephemeral, lost after 1h)
- Job search and ranking are ad-hoc async generators in `onboarding.py`
- No JIT enrichment — jobs ranked on short Algolia snippets

### Goals
1. Collect a **richer candidate profile** covering both hard criteria (filtering) and soft fit (ranking)
2. Ask questions **one by one**, adaptively, based on what's still missing
3. **Persist profile to Supabase** — living document, updatable over time
4. Clean up job discovery into a **maintainable, extensible pipeline**
5. Practice and establish **LangGraph patterns** for the codebase

---

## 2. Data Model

### `CandidateProfile` (Pydantic)

```python
class CandidateProfile(BaseModel):
    # Hard criteria — filterable
    job_title_target: str
    experience_years: Optional[int] = None
    skills: list[str] = []
    location_pref: Optional[str] = None
    remote_pref: Optional[str] = None        # 'remote' | 'hybrid' | 'onsite'
    salary_min: Optional[int] = None
    contract_type: Optional[str] = None      # 'cdi' | 'cdd' | 'freelance' | 'any'

    # Soft fit — used for ranking
    aspirations: Optional[str] = None        # what they want to move toward (primary)
    values: list[str] = []                   # e.g. ['autonomy', 'impact', 'ownership']
    preferred_sector: list[str] = []
    preferred_team_size: Optional[str] = None  # 'startup' | 'mid' | 'large'
    dislikes: Optional[str] = None           # optional, skippable

    # Narrative — cumulative free text, fed to LLM ranker
    summary: str = ""

    # Meta
    completion_score: float = 0.0            # filled_fields / len(INFO_GRID), unweighted
```

### Information grid

Priority-ordered list of fields the `gap_analyzer` uses to decide the next question. Stored as a Python constant (coupled to schema, safe from drift). Question phrasing stored in a config dict alongside it.

```python
INFO_GRID = [
    "job_title_target",   # critical
    "experience_years",
    "skills",
    "remote_pref",
    "location_pref",
    "salary_min",
    "contract_type",
    "aspirations",        # soft fit starts here
    "values",
    "preferred_sector",
    "preferred_team_size",
    "dislikes",           # lowest priority, skippable
]

QUESTION_CONFIG = {
    "aspirations": {
        "question": "Qu'est-ce qui vous attire le plus dans votre prochain poste ?",
        "skippable": True,
    },
    # ... one entry per INFO_GRID field
}
```

### Supabase `candidates` table

```sql
candidates (
    id                   uuid primary key,
    user_id              uuid references auth.users,
    profile              jsonb,           -- full CandidateProfile
    embedding            vector(1024),    -- from summary + skills + aspirations
    cv_url               text,
    onboarding_complete  boolean default false,
    created_at           timestamptz,
    updated_at           timestamptz
)
```

Embedding is regenerated when `summary`, `skills`, or `aspirations` changes — the three highest-signal fields for pgvector matching.

---

## 3. `ProfileConversationGraph`

Handles candidate onboarding Q&A and profile updates. Uses Redis checkpointer for resumability.

### State

```python
class ProfileConversationState(TypedDict):
    session_id: str
    profile: CandidateProfile
    qa_history: list[dict]       # [{"question": ..., "answer": ...}]
    current_question: str | None
    is_complete: bool
```

### Topology

```
analyze_cv ──► gap_analyzer ──► [wait for answer]
                   ▲                    │
                   │            answer_processor
                   └────────────────────┘
                   │ (is_complete=True)
                   ▼
               finalize
```

### Nodes

**`analyze_cv`** — runs once on CV upload. Pre-fills profile from CV text using structured LLM output. Computes initial `completion_score`. Saves to Redis (session) and Supabase (persistent).

**`gap_analyzer`** — compares `INFO_GRID` against filled profile fields. Single LLM call returns the next targeted question for the highest-priority missing field. If all critical fields are filled → `is_complete = True` → routes to `finalize`.

**`answer_processor`** — single LLM call (structured output) returning:
```python
{
  "structured_updates": {"aspirations": "...", "values": ["autonomy"]},
  "narrative_addition": "Cherche un environnement avec forte autonomie...",
}
```
Updates profile, appends to `qa_history`, recomputes `completion_score`, syncs to Supabase.

**`finalize`** — generates final `summary` from full profile, regenerates embedding, saves to Supabase, sets `onboarding_complete = True`.

### Routing

The graph suspends between HTTP requests — `END` is not a terminal state but an inter-request pause. The Redis checkpointer preserves graph state across suspensions.

```python
def route_after_gap(state) -> str:
    # is_complete=True → all critical fields filled → go to finalize
    # is_complete=False → suspend (END), wait for next POST /answer request to resume
    return "finalize" if state["is_complete"] else END

def route_after_answer(state) -> str:
    return "gap_analyzer"
```

Flow per HTTP request:
1. `POST /answer` resumes the graph from the Redis checkpoint
2. `answer_processor` runs → updates profile
3. `gap_analyzer` runs → either suspends again (returns question) or routes to `finalize`

### Skip behavior

`POST /onboarding/skip/{id}` is valid at any point. Server-side behavior:
- If all critical fields (`job_title_target`, `skills`, `remote_pref`) are filled → run `finalize` normally
- If critical fields are missing → run `finalize` with whatever is available, `onboarding_complete = True`, `completion_score` reflects partial state. No error — partial profiles are acceptable.

Frontend enforces no gate on skip. The "once critical fields are filled" note in the frontend section is a UX hint (button becomes more prominent), not a hard block.

### Checkpointer

`langgraph-checkpoint-redis` keyed on `session_id`. Allows mid-session browser close and resumption. Profile updates (structured form) use `PATCH /onboarding/profile/{id}` — direct Supabase write, bypasses graph.

### API endpoints

```
POST  /onboarding/upload           → analyze_cv node → {profile, first_question, session_id}
POST  /onboarding/answer/{id}      → answer_processor → {profile, next_question, completion_score}
POST  /onboarding/skip/{id}        → finalize directly → {profile}
GET   /onboarding/profile/{id}     → current profile (for structured edit form)
PATCH /onboarding/profile/{id}     → direct field update, bypasses graph
```

---

## 4. `JobDiscoveryGraph`

Handles job search, JIT enrichment, and LLM reranking. Runs fresh on each invocation — no checkpointer.

### State

```python
class JobDiscoveryState(TypedDict):
    session_id: str
    profile: CandidateProfile
    algolia_jobs: list[dict]
    pgvector_jobs: list[dict]
    merged_jobs: list[dict]       # deduped, top 15
    enriched_jobs: list[dict]     # with full descriptions
    ranked_jobs: list[RankedJob]
```

### Topology

```
[search_algolia]  ──┐
                    ├──► dedup_merge ──► enrich_jit ──► llm_rerank ──► stream
[search_pgvector] ──┘
```

`search_algolia` and `search_pgvector` run in parallel via LangGraph `Send` API.

### Nodes

**`search_algolia`** — queries WTTJ Algolia with terms derived from profile. Upserts results to DB (intentional side effect — keeps local DB fresh for future pgvector searches). Streams `jobs_found` SSE events.

**`search_pgvector`** — pgvector similarity search on local DB using profile embedding.

**`dedup_merge`** — merges both result sets by `external_id`, scores by combined relevance, keeps top 15.

**`enrich_jit`** — for each job where `len(description) < 500`, scrapes full page in parallel via `asyncio.gather`. Uses Scrapling (dev) or ScrapingBee (prod). Falls back to snippet on failure — never blocks ranking.

**`llm_rerank`** — Haiku, structured output per job: `{score, strengths, weaknesses, justification}`. Uses full enriched description + richer profile context (aspirations, values, summary). Streams each result immediately as scored.

### Conditional enrichment

```python
def needs_enrichment(job: dict) -> bool:
    return len(job.get("description") or "") < 500
```

Jobs with rich descriptions skip scraping entirely — keeps ScrapingBee costs low.

### SSE event stream (unified)

```
event: jobs_found    → search phase, counter update
event: search_done   → dedup done, enrichment starting
event: job_ranked    → each job as scored (streamed immediately)
event: done          → ranking complete
```

Replaces the current two separate SSE endpoints (`search-stream` + `rank-stream`).

### API endpoint

```
GET /onboarding/search-stream/{session_id}   → runs full graph, SSE stream
```

---

## 5. Frontend changes

- **`QuestionsPanel`** → replaced by single-question display with progress indicator (`completion_score` as progress bar or "X fields remaining")
- **`ProfilePanel`** → shown alongside question, updates live after each answer
- **Skip button** → always visible once critical fields are filled, calls `POST /onboarding/skip/{id}`
- **Structured edit form** → post-onboarding, calls `PATCH /onboarding/profile/{id}` per field
- **"Continue Q&A" option** → button in edit form that resumes `ProfileConversationGraph` from checkpointed state

---

## 6. LangSmith tracing

Both graphs traced via Langfuse (`@observe` decorator, already used in `profile_analyzer_service.py`). LangGraph's built-in LangSmith callback is not used — Langfuse is the observability platform for this project.

Per-node traces:
- `ProfileConversationGraph`: completion scores over time, question quality, drop-off points
- `JobDiscoveryGraph`: per-job scores, enrichment rate (% jobs scraped), scraping failures, ranking latency

---

## 7. Out of scope

- Auth / candidate accounts (Phase 7, separate spec)
- France Travail as a search source (future node addition, no design changes needed)
- LinkedIn / Indeed sources (same)
- Bulk pre-scraping of descriptions (ruled out: cheap > latency)
