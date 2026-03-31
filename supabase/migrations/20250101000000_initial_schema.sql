-- =============================================================================
-- Initial schema — consolidated from all supabase_schema_*.sql files
-- Represents the current production state as of 2025-03-31
-- =============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- Tables
-- =============================================================================

-- Users (linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('recruiter', 'candidate')),
    email       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job postings (internal + scraped external jobs)
CREATE TABLE IF NOT EXISTS public.job_postings (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recruiter_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title                 VARCHAR(255) NOT NULL,
    description           TEXT NOT NULL,
    questions             JSONB,
    source                TEXT NOT NULL DEFAULT 'internal',
    external_id           TEXT,
    external_url          TEXT,
    status                VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    is_active             BOOLEAN NOT NULL DEFAULT true,
    embedding             vector(1024),
    last_seen_at          TIMESTAMPTZ DEFAULT now(),
    expires_at            TIMESTAMPTZ,
    has_full_description  BOOLEAN NOT NULL DEFAULT false,
    description_full      TEXT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT job_postings_source_external_id_key UNIQUE (source, external_id)
);

-- Candidates
CREATE TABLE IF NOT EXISTS public.candidates (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
    name                VARCHAR(255),
    email               VARCHAR(255),
    phone               VARCHAR(50),
    profile_text        TEXT,
    cv_url              TEXT,
    profile             JSONB,
    onboarding_complete BOOLEAN NOT NULL DEFAULT false,
    embedding           vector(1024),
    updated_at          TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Screenings (candidate ↔ job link)
CREATE TABLE IF NOT EXISTS public.screenings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id      UUID REFERENCES public.job_postings(id) ON DELETE CASCADE,
    candidate_id        UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
    status              VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'interviewed', 'evaluated')),
    compatibility_score INTEGER,
    performance_score   INTEGER,
    call_status         VARCHAR(50) NOT NULL DEFAULT 'not_started',
    transcript          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (job_posting_id, candidate_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS job_postings_embedding_idx ON public.job_postings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS candidates_embedding_idx   ON public.candidates    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS candidates_user_id_idx     ON public.candidates    (user_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenings    ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_users"      ON public.users        FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_jobs"       ON public.job_postings FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_candidates" ON public.candidates   FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_screenings" ON public.screenings   FOR ALL TO service_role USING (true);

-- Users: self access only
CREATE POLICY "users_self_access" ON public.users FOR ALL USING (auth.uid() = id);

-- Jobs: readable + writable by authenticated
CREATE POLICY "auth_read_jobs"   ON public.job_postings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_jobs" ON public.job_postings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_jobs" ON public.job_postings FOR UPDATE TO authenticated USING (true);

-- Candidates: readable + writable by authenticated
CREATE POLICY "auth_read_candidates"   ON public.candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_candidates" ON public.candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_candidates" ON public.candidates FOR UPDATE TO authenticated USING (true);

-- Screenings: readable + writable by authenticated
CREATE POLICY "auth_read_screenings"   ON public.screenings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_screenings" ON public.screenings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_screenings" ON public.screenings FOR UPDATE TO authenticated USING (true);

-- =============================================================================
-- Auth trigger: auto-create public.users on signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.users (id, role, email)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'role', 'candidate'),
        new.email
    );
    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- =============================================================================
-- Storage
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('cvs', 'cvs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_full_access_cvs"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'cvs');

-- =============================================================================
-- RPC functions
-- =============================================================================

-- Similarity search: candidates for a given job
CREATE OR REPLACE FUNCTION match_candidates_for_job(
    query_embedding vector(1024),
    match_job_id    uuid,
    match_threshold float,
    match_count     int
)
RETURNS TABLE (
    id          uuid,
    name        text,
    email       text,
    profile_text text,
    cv_url      text,
    created_at  timestamptz,
    similarity  float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        c.id, c.name, c.email, c.profile_text, c.cv_url, c.created_at,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM candidates c
    JOIN screenings s ON s.candidate_id = c.id
    WHERE s.job_posting_id = match_job_id
      AND 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Similarity search: jobs for a given candidate (used by job discovery graph)
CREATE OR REPLACE FUNCTION match_jobs_for_candidate(
    query_embedding vector(1024),
    match_threshold float DEFAULT 0.3,
    match_count     int   DEFAULT 50
)
RETURNS TABLE (
    id          uuid,
    title       text,
    description text,
    external_url text,
    source      text,
    similarity  float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        j.id, j.title, j.description, j.external_url, j.source,
        1 - (j.embedding <=> query_embedding) AS similarity
    FROM job_postings j
    WHERE j.status = 'active'
      AND j.embedding IS NOT NULL
      AND 1 - (j.embedding <=> query_embedding) > match_threshold
    ORDER BY j.embedding <=> query_embedding
    LIMIT match_count;
$$;
