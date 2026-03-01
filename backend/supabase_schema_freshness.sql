-- Migration: job freshness tracking
-- last_seen_at: updated on every scrape run → used to detect stale jobs (strategy 1+2)
-- expires_at:   set from source metadata (e.g. France Travail dateActualisation + 30j) (strategy 4)

ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
