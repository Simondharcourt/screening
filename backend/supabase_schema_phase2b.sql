-- Add Unique Constraint for Scraping De-duplication
-- We assume source and external_id can uniquely identify a job posting.
-- source could be 'francetravail' or 'wttj' or 'internal'

ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE job_postings ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- Make sure we don't have duplicates before adding the constraint
-- Then add the unique constraint (only if it doesn't exist already)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'job_postings_source_external_id_key'
    ) THEN
        ALTER TABLE job_postings ADD CONSTRAINT job_postings_source_external_id_key UNIQUE (source, external_id);
    END IF;
END $$;
