CREATE OR REPLACE FUNCTION match_jobs_for_candidate(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.3,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  external_url text,
  source text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    j.id, 
    j.title, 
    j.description, 
    j.external_url, 
    j.source,
    1 - (j.embedding <=> query_embedding) AS similarity
  FROM job_postings j
  WHERE j.status = 'active'
    AND j.embedding IS NOT NULL
    AND 1 - (j.embedding <=> query_embedding) > match_threshold
  ORDER BY j.embedding <=> query_embedding
  LIMIT match_count;
$$;
