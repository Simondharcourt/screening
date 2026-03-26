# TODOS

## Onboarding / Session

### P2 — Auth on onboarding session endpoints
**Description:** `/onboarding/answer`, `/skip`, `/profile`, `/search-stream` accept any UUID without authentication. Session IDs are UUID v4 (122-bit entropy — hard to guess), but anyone who intercepts or leaks a session ID can access or modify that candidate's profile.
**Fix:** Verify session ownership against Supabase Auth before processing. Requires candidate auth flow to be implemented.
**Noted:** v feat/langgraph-profile-and-discovery adversarial review (2026-03-24)

### P3 — SSE stream doesn't handle client disconnection
**Description:** `_generate_discovery_stream` runs the full pipeline (parallel search + JIT scraping + 10 LLM calls) even if the client disconnects mid-stream. No `request.is_disconnected()` checks between steps.
**Fix:** Pass the `Request` object into the generator and poll `await request.is_disconnected()` between pipeline stages.
**Noted:** v feat/langgraph-profile-and-discovery adversarial review (2026-03-24)

### P3 — No TTL on LangGraph Redis checkpoints
**Description:** Every CV upload creates a Redis checkpoint keyed by `session_id`. Abandoned sessions (user uploads but never completes onboarding) leave checkpoint data in Redis indefinitely. Under sustained load, Redis memory grows unboundedly.
**Fix:** Configure `RedisSaver` with a TTL, or add a periodic cleanup task (Celery beat) to prune old checkpoints.
**Noted:** v feat/langgraph-profile-and-discovery adversarial review (2026-03-24)

## Database

### P3 — Supabase migration not yet run
**Description:** `backend/supabase_profile_migration.sql` adds `profile jsonb`, `onboarding_complete boolean`, `updated_at timestamptz` to the `candidates` table. Must be run manually in the Supabase SQL editor before the onboarding flow works in production.
**Action:** Run `backend/supabase_profile_migration.sql` in Supabase SQL editor.
**Noted:** v feat/langgraph-profile-and-discovery

## Completed

_(none yet)_
