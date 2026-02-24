-- Enable the pgvector extension to work with embedding vectors
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Add embedding column to job_postings table
-- text-embedding-3-small produces 1536 dimensional vectors by default
ALTER TABLE job_postings
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 2. Add embedding column to candidates table
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Create HNSW indexes for fast similarity search
-- Adjust lists or m/ef_construction based on production needs, defaults are usually fine for small datasets
CREATE INDEX IF NOT EXISTS job_postings_embedding_idx ON job_postings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS candidates_embedding_idx ON candidates USING hnsw (embedding vector_cosine_ops);

-- Note: The cosine similarity operator is `<=>`
-- To query: `SELECT * FROM candidates ORDER BY embedding <=> '[...]' LIMIT 10;`

-- 4. Create Postgres function (RPC) for similarity search via Supabase Client
CREATE OR REPLACE FUNCTION match_candidates_for_job(
    query_embedding vector(1536),
    match_job_id uuid,
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    name text,
    email text,
    profile_text text,
    cv_url text,
    created_at timestamptz,
    similarity float
)
LANGUAGE sql
AS $$
    SELECT 
        c.id, 
        c.name, 
        c.email, 
        c.profile_text, 
        c.cv_url, 
        c.created_at, 
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM candidates c
    JOIN screenings s ON s.candidate_id = c.id
    WHERE s.job_posting_id = match_job_id
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;
