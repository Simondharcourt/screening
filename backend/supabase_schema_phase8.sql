-- Migration for Phase 8: Hybrid JIT Scraping Engine

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS external_url text,
  ADD COLUMN IF NOT EXISTS has_full_description boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description_full text;
