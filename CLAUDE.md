# HR AI Screening Platform — CLAUDE.md

## Project Overview

Open-source AI-powered HR platform that automates candidate screening through voice agents, scores candidates with LLM-as-judge, and gives recruiters a clean dashboard to manage their pipeline.

**Two-sided platform:**
- **Recruiters:** Create job postings (AI-generated), add candidates, trigger voice screening calls, consult dashboard with transcripts, scores, and recommendations.
- **Candidates:** Build their profile via AI coach dialogue, express interest in jobs, receive voice screening calls.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + React + TypeScript + TailwindCSS + TanStack Query + TanStack Router |
| Backend | FastAPI (Python, async) |
| Database | Supabase (PostgreSQL + pgvector + Realtime + Auth + Storage) |
| Cache / Queue / Worker | Redis + Celery |
| Agent Orchestration | LangGraph |
| Voice Agent | Vapi |
| LLM | Claude API (Anthropic) — primary for reasoning, evaluation, job generation |
| Embeddings | HuggingFace (intfloat/multilingual-e5-large) — local, 1024 dims |
| Vector Search | pgvector (Supabase) |
| External Jobs | France Travail API |
| Observability | LangSmith |
| Auth & Storage | Supabase Auth (magic link + OAuth) + Supabase Storage |
| Deployment | Railway (backend, EU region) + Vercel (frontend) |

---

## Project Structure

```
hr-ai-platform/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/          # jobs, candidates, interviews, evaluations
│   │   ├── agents/           # job_description_agent, screening_agent, evaluation_agent, coach_agent
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic
│   │   └── core/             # Config, DB, auth
│   ├── tests/
│   ├── alembic/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── api/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

---

## Database Schema

```
users (id, role: recruiter|candidate, email, created_at)
job_postings (id, recruiter_id, title, description, questions, source, external_id, external_url, embedding vector(1024), created_at, status)
candidates (id, user_id, profile_text, cv_url, embedding vector(1024), created_at)
screenings (id, job_posting_id, candidate_id, status, compatibility_score, performance_score, created_at)
interviews (id, candidate_id, job_id, vapi_call_id, transcript, duration_seconds, status, started_at, ended_at)
evaluations (id, interview_id, scores: dict, overall_score, summary, strengths, weaknesses, recommendation, created_at)
```

Key notes:
- `job_postings.source`: `internal | france_travail | ...` — external jobs only used for recommendations, never trigger Vapi calls
- `embedding vector(1024)` on both `job_postings` and `candidates` for RAG/matching
- Audios are NOT stored after transcription (GDPR)

---

## Agents

### 1. Job Description Agent (LangGraph)
- Input: title + bullet points
- Output: full job description + structured screening questions
- Endpoint: `POST /jobs/generate`

### 2. Screening Agent / Voice (LangGraph + Vapi)
- Outbound call to candidate, conducts pre-qualification interview
- Handles follow-up questions if answers are too short
- Written fallback if call fails twice or candidate prefers it
- Endpoint: `POST /screenings/{id}/call`

### 3. Evaluation Agent (LangGraph — LLM-as-judge)
- Triggered automatically after transcript received from Vapi webhook
- Scores on observable criteria only (no personality traits — legal compliance):
  - `clarity` (0-10): Structure and clarity of expression
  - `relevance` (0-10): Relevance to the question
  - `technical_fit` (0-10): Match with job requirements
  - `soft_skills` (0-10): Communication, professionalism
  - `depth` (0-10): Goes beyond surface-level answers
- Generates: overall score, strengths, weaknesses, recommendation (strong_yes / yes / maybe / no)

### 4. Candidate Coach Agent (LangGraph)
- Multi-turn written dialogue with the candidate
- Builds structured profile (skills, experiences, goals) iteratively
- LinkedIn/CV import as starting point
- Interface: SSE streaming from FastAPI

### 5. RAG / Matching
- `SELECT ... ORDER BY embedding <=> [vector] LIMIT 10` via pgvector
- Compatibility score (direct LLM call, not LangGraph): profile + job posting → score 0-100 + detailed justification
- Score detail always shown (not just a number) to keep humans in the loop

### 6. Celery Worker — External Jobs
- Polls France Travail API every 6h
- Normalizes into `job_postings` schema with `source=france_travail`
- Generates embeddings for each imported job
- External jobs: recommendations only, no Vapi calls triggered

---

## Key API Endpoints

```
POST   /jobs/generate              # AI job description generation
POST   /jobs                       # Save job posting
GET    /jobs                       # List jobs
GET    /jobs/{id}
POST   /candidates                 # Add candidate to a job
GET    /candidates                 # List candidates (with status)
GET    /candidates/{id}
POST   /screenings/{id}/call       # Trigger Vapi outbound call
GET    /evaluations/{candidate_id} # Get evaluation results
```

---

## GDPR & Compliance

- Explicit consent link sent before any voice call is triggered
- Right to erasure: account + all associated data deletable at any time
- EU hosting for all sensitive data (transcripts, profiles) — Railway EU region + Supabase EU
- Audio NOT stored after transcription
- Raw transcripts remain accessible to recruiter for human verification
- Evaluation criteria: observable behaviors only (clarity, relevance, depth) — no personality traits

---

## Environment Variables

```env
# LLM
ANTHROPIC_API_KEY=...
# No OpenAI API key needed anymore for embeddings (using local HF model)

# Vapi
VAPI_API_KEY=...
VAPI_WEBHOOK_SECRET=...

# Supabase
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=postgresql://...

# Redis / Celery
REDIS_URL=...

# LangSmith
LANGCHAIN_API_KEY=...
LANGCHAIN_PROJECT=hr-ai-platform

# Auth
SECRET_KEY=...
ALGORITHM=HS256

# App
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
```

---

## Development Guidelines

- **Never touch LangGraph agents until the core business flow works end-to-end** (recruiter CRUD, candidate management, status display)
- **Instrument LangSmith from the first agent** — trace all LangGraph calls in production
- **Explicit consent before any Vapi call** — always check consent flag before triggering outbound call
- **External jobs (France Travail) never trigger Vapi** — recommendations only
- **Score detail always displayed** — never show a single score without breakdown to keep humans in the loop
- Commit with conventional commits: `feat:`, `fix:`, `test:`, `docs:`
- Ruff for linting, pytest for tests, type hints throughout Python codebase

### Embeddings
- Using `intfloat/multilingual-e5-large` (HuggingFace, local, 1024 dims) — no OpenAI key needed
- Model is **lazy-loaded** in `embedding_service.py` to avoid SIGSEGV when Celery forks workers
- **TODO (Dockerfile):** Pre-bake the model (~560 MB) into the Docker image so Railway doesn't re-download it on every deploy. Pattern: run `HuggingFaceEmbeddings(model_name=...)` during `docker build` so the HF cache is included in the image layer. Redis and the worker should share the same image or a common base.

---

## Implementation Phases

1. **Phase 1 — Foundations:** Supabase setup, FastAPI skeleton, React + TanStack setup, Supabase Auth, deploy to Railway + Vercel
2. **Phase 2 — Core Recruiter (no AI):** Job CRUD, candidate management, dashboard, CV upload
3. **Phase 2b — External Jobs Scraper (parallel):** Celery worker, France Travail API, embeddings
4. **Phase 3 — Job Description Agent:** First LangGraph agent, LangSmith instrumentation
5. **Phase 4 — Candidate Coach Agent:** Multi-turn chat, SSE streaming, LinkedIn/CV import
6. **Phase 5 — Matching + RAG:** pgvector embeddings, compatibility score, recommendations, dashboard buttons
7. **Phase 6 — Voice Agent (Vapi):** Most complex — Vapi setup, webhook handler, transcript storage, Redis queue, fallback, Realtime display
