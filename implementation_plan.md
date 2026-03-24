# Remaining Work

## Phase 7 — Candidate Authentication

Make the candidate side a proper authenticated experience.

**Flow:**
1. Public job board at `/jobs` — anyone can browse active postings
2. Candidate signs up / logs in via Supabase Auth (`role=candidate` in metadata)
3. Clicking "Postuler" creates a `screenings` record and redirects to `/candidate/coach`
4. Candidate dashboard at `/candidate/dashboard` — track application statuses

**What to build:**
- Supabase Auth for candidates (email/password or OAuth — Google/LinkedIn)
- Protect `/candidate/*` routes with auth guard
- Public `/jobs` page (read-only, no auth required)
- "Postuler" button on job cards → creates screening → redirects to coach
- Candidate dashboard: list of screenings with status (pending / interview done / reviewed)
- Backend: auth middleware to identify candidate from JWT on protected endpoints

**Key constraint:** Recruiter and candidate workspaces are completely separate. A candidate cannot access recruiter routes and vice versa.
