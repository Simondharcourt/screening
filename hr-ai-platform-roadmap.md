# HR AI Screening Platform — Project Roadmap

## Vision

An open-source AI-powered HR platform that automates candidate screening through voice agents, evaluates candidates with LLM-based scoring, and provides recruiters with a clean dashboard to manage job postings and candidates.

**Target:** Production-ready, publicly deployable, open-source on GitHub.

**Why this project exists:** Demonstrate end-to-end ability to build and ship complex GenAI products — multi-agent orchestration, voice AI, evaluation pipelines, and full-stack product delivery.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + TailwindCSS |
| Backend | FastAPI (Python) |
| Agent Orchestration | LangGraph |
| Voice | Vapi |
| LLM | OpenAI GPT-4o or Mistral |
| Database | PostgreSQL |
| Infra | Docker + GitHub Actions + Railway |
| Evaluation | LLM-as-judge (custom pipeline) |

---

## Architecture Overview

```
Frontend (React + TypeScript)
    │
    ▼
Backend (FastAPI)
    ├── Auth (JWT)
    ├── Jobs API
    ├── Candidates API
    ├── Interviews API
    └── Agent Orchestrator (LangGraph)
          ├── Job Description Agent
          │     └── Generates structured job posting from minimal input
          ├── Screening Agent (via Vapi)
          │     ├── Conducts voice interview
          │     ├── Handles follow-up questions
          │     └── Manages conversation flow
          └── Evaluation Agent
                ├── Parses transcript
                ├── Scores on 5 criteria (LLM-as-judge)
                └── Generates candidate summary
    │
    ▼
PostgreSQL
    ├── jobs
    ├── candidates
    ├── interviews
    └── evaluations
```

---

## Data Models

### Job
```python
id: UUID
title: str
description: str  # LLM-generated
requirements: list[str]
screening_questions: list[str]  # LLM-generated from job
created_at: datetime
status: enum(draft, active, closed)
```

### Candidate
```python
id: UUID
name: str
email: str
phone: str
job_id: UUID
status: enum(pending, scheduled, interviewed, evaluated)
created_at: datetime
```

### Interview
```python
id: UUID
candidate_id: UUID
job_id: UUID
vapi_call_id: str
transcript: str
duration_seconds: int
status: enum(scheduled, in_progress, completed, failed)
started_at: datetime
ended_at: datetime
```

### Evaluation
```python
id: UUID
interview_id: UUID
scores: dict  # {clarity: 8, relevance: 7, soft_skills: 6, ...}
overall_score: float
summary: str  # LLM-generated
strengths: list[str]
weaknesses: list[str]
recommendation: enum(strong_yes, yes, maybe, no)
created_at: datetime
```

---

## Sprint Breakdown

---

### Sprint 1 — Weeks 1-2 : Foundations

**Goal:** Project is set up, running locally with Docker, and can create/store job postings.

#### Tasks

**Setup**
- [ ] Initialize GitHub repo with README, LICENSE (MIT), .gitignore
- [ ] Docker Compose with FastAPI + PostgreSQL services
- [ ] Alembic for DB migrations
- [ ] GitHub Actions CI: lint (ruff) + tests (pytest) on every push
- [ ] Environment variables management (.env + pydantic-settings)
- [ ] Basic logging setup

**Backend**
- [ ] FastAPI project structure (routers, models, schemas, services)
- [ ] PostgreSQL connection with SQLAlchemy
- [ ] `POST /jobs` — create a job
- [ ] `GET /jobs` — list all jobs
- [ ] `GET /jobs/{id}` — get job detail
- [ ] JWT auth (basic — one admin user)

**Job Description Agent (LangGraph)**
- [ ] LangGraph node: take (title + 3-5 bullet points) → generate full job description
- [ ] LangGraph node: generate 5 screening questions from job description
- [ ] Expose via `POST /jobs/generate` endpoint

**Frontend**
- [ ] React app setup (Vite + TypeScript + TailwindCSS)
- [ ] Job creation form (title + bullet points input)
- [ ] Display generated job description (editable before saving)
- [ ] Jobs list page

**Deliverable:** A recruiter can create a job posting with AI-generated description and screening questions, stored in DB.

---

### Sprint 2 — Weeks 3-4 : Voice Screening Agent

**Goal:** A candidate can receive a voice call conducted by the AI agent, and the transcript is stored.

#### Tasks

**Vapi Integration**
- [ ] Vapi account setup and API key configuration
- [ ] Create Vapi assistant programmatically (system prompt from job + screening questions)
- [ ] Configure Vapi webhook to receive call events (call.started, call.ended, transcript.ready)
- [ ] `POST /interviews/initiate` — triggers outbound call to candidate via Vapi

**Screening Agent (LangGraph)**
- [ ] Node: build dynamic system prompt from job description + screening questions
- [ ] Node: handle follow-up logic (if answer is too short → ask follow-up)
- [ ] Node: detect end of interview (all questions answered or max duration reached)
- [ ] Webhook handler: receive transcript from Vapi → store in DB

**Candidate Management**
- [ ] `POST /candidates` — add a candidate to a job
- [ ] `GET /candidates` — list candidates with status
- [ ] `GET /candidates/{id}` — candidate detail with interview status

**Frontend**
- [ ] Candidates list page (per job)
- [ ] Add candidate form
- [ ] Trigger interview button → calls `POST /interviews/initiate`
- [ ] Interview status display (pending / in progress / completed)

**Deliverable:** A candidate can be called by the AI agent, interviewed, and the transcript is stored in DB.

---

### Sprint 3 — Weeks 5-6 : Evaluation Pipeline

**Goal:** After each interview, candidates are automatically scored on 5 criteria by a LLM-as-judge pipeline.

#### Tasks

**Evaluation Agent (LangGraph)**
- [ ] Node: parse transcript into structured Q&A pairs
- [ ] Node: score each answer on 5 criteria using LLM-as-judge:
  - `clarity` (0-10): How clear and structured is the answer?
  - `relevance` (0-10): How relevant is the answer to the question?
  - `technical_fit` (0-10): Does the answer match job requirements?
  - `soft_skills` (0-10): Communication, enthusiasm, professionalism
  - `depth` (0-10): Does the candidate go beyond surface-level answers?
- [ ] Node: compute overall score (weighted average)
- [ ] Node: generate candidate summary (strengths, weaknesses, recommendation)
- [ ] Auto-trigger evaluation after transcript is received from Vapi webhook

**Backend**
- [ ] `GET /evaluations/{candidate_id}` — get evaluation results
- [ ] Store full evaluation JSON in DB

**Evaluation Quality**
- [ ] Prompt engineering: few-shot examples for each scoring criterion
- [ ] Output validation: ensure scores are integers 0-10, handle LLM failures gracefully
- [ ] Retry logic on LLM failures

**Frontend**
- [ ] Candidate detail page: transcript viewer + scores radar chart
- [ ] Score breakdown per criterion with LLM justification
- [ ] Recommendation badge (Strong Yes / Yes / Maybe / No)

**Deliverable:** Every completed interview automatically generates a structured evaluation with scores and summary.

---

### Sprint 4 — Weeks 7-8 : Recruiter Dashboard

**Goal:** A clean, usable dashboard that lets a recruiter manage their pipeline end-to-end.

#### Tasks

**Dashboard**
- [ ] Overview page: active jobs, candidates per status, recent activity
- [ ] Job detail page: all candidates with scores, sortable by overall score
- [ ] Candidate comparison view: side-by-side scores for top candidates (2-3)
- [ ] Pipeline view: kanban-style status board (pending → scheduled → interviewed → evaluated)

**UX Polish**
- [ ] Loading states and error handling throughout
- [ ] Responsive design (mobile-friendly)
- [ ] Empty states (no jobs yet, no candidates yet)
- [ ] Toast notifications (interview initiated, evaluation ready)

**Deployment**
- [ ] Deploy backend on Railway (or Render)
- [ ] Deploy frontend on Vercel (or Railway)
- [ ] Set up production PostgreSQL (Railway or Supabase)
- [ ] Configure Vapi webhooks for production URL
- [ ] Environment variables in production

**Deliverable:** Platform is live at a public URL, fully usable end-to-end.

---

### Sprint 5 — Weeks 9-10 : Polish & Open Source

**Goal:** The project is clean, documented, and impressive on GitHub.

#### Tasks

**Testing**
- [ ] Unit tests for LangGraph agents (mock LLM calls)
- [ ] Unit tests for evaluation scoring logic
- [ ] Integration tests for main API routes (pytest + httpx)
- [ ] Test coverage > 70%

**Documentation**
- [ ] README: project overview, architecture diagram, setup instructions, demo GIF/video
- [ ] CONTRIBUTING.md: how to run locally, how to contribute
- [ ] API docs: FastAPI auto-generates Swagger — verify and clean up
- [ ] Architecture decision records (ADR) for key choices (LangGraph, Vapi, LLM-as-judge)

**Code Quality**
- [ ] Ruff linting passing with no errors
- [ ] Type hints throughout Python codebase
- [ ] Remove all debug code and hardcoded values
- [ ] Secrets audit: ensure no API keys in code or git history

**Demo**
- [ ] Record a 2-3 min demo video (Loom): create job → add candidate → trigger interview → view evaluation
- [ ] Add demo video to README
- [ ] Create a live demo instance with sample data

**Deliverable:** GitHub repo ready to be shared publicly and shown in interviews.

---

## Key Technical Decisions

### Why LangGraph?
LangGraph allows explicit control over agent state and flow — critical for a screening agent where conversation logic must be predictable and debuggable. It also directly maps to Pigment's tech stack.

### Why Vapi?
Vapi handles the complexity of real-time voice (WebRTC, STT, TTS, interruption handling) so the focus stays on agent logic. It integrates easily via webhook and REST API.

### Why LLM-as-judge?
Rather than rule-based scoring, LLM-as-judge allows nuanced evaluation of free-form answers. Using few-shot prompts + structured output ensures consistency and explainability — a key concern for production HR tools.

### Why FastAPI + PostgreSQL?
FastAPI for its async support and auto-generated OpenAPI docs. PostgreSQL for its reliability and JSON support (useful for storing evaluation scores).

---

## What to Explain in Interviews

### At Pigment (GenAI Engineer)
- LangGraph multi-agent architecture and how state is managed across nodes
- LLM-as-judge pipeline: prompt engineering, few-shot examples, output validation
- How evaluation pipeline is deterministic and auditable
- Handling LLM failures gracefully in production

### At Maki (Software Engineer / AI Deployment Architect)
- End-to-end voice agent implementation with Vapi
- How screening questions are dynamically generated from job descriptions
- Conversation flow management (follow-ups, edge cases, timeouts)
- From 0 to prod in ~6 weeks as a solo developer

---

## Folder Structure

```
hr-ai-platform/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── jobs.py
│   │   │   ├── candidates.py
│   │   │   ├── interviews.py
│   │   │   └── evaluations.py
│   │   ├── agents/
│   │   │   ├── job_description_agent.py
│   │   │   ├── screening_agent.py
│   │   │   └── evaluation_agent.py
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   └── core/          # Config, DB, auth
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

## Environment Variables

```env
# LLM
OPENAI_API_KEY=...

# Vapi
VAPI_API_KEY=...
VAPI_WEBHOOK_SECRET=...

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/hr_platform

# Auth
SECRET_KEY=...
ALGORITHM=HS256

# App
ENVIRONMENT=development
FRONTEND_URL=http://localhost:3000
```

---

## Getting Started (for the AI taking over)

1. Read this entire document before writing any code
2. Start with Sprint 1 tasks in order
3. Each sprint has a clear deliverable — verify it works before moving to the next
4. Use the folder structure above from the start
5. Write tests as you go, not at the end
6. Commit frequently with clear messages (feat:, fix:, test:, docs:)
