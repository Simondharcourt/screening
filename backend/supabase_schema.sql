-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table (if not using Supabase Auth users directly, but we link to auth.users)
-- We'll assume recruiters and candidates are linked to auth.users
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('recruiter', 'candidate')),
    email VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Job Postings table
CREATE TABLE IF NOT EXISTS public.job_postings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recruiter_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    questions JSONB, -- Array of strings/objects
    source VARCHAR(50) DEFAULT 'internal',
    external_id VARCHAR(255),
    external_url TEXT,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Candidates table
CREATE TABLE IF NOT EXISTS public.candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- Nullable if added manually by recruiter
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    profile_text TEXT,
    cv_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Screenings (Linking Candidates to Jobs)
CREATE TABLE IF NOT EXISTS public.screenings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_posting_id UUID REFERENCES public.job_postings(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'interviewed', 'evaluated')),
    compatibility_score INTEGER,
    performance_score INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(job_posting_id, candidate_id)
);

-- 5. Storage Bucket for CVs
INSERT INTO storage.buckets (id, name, public) 
VALUES ('cvs', 'cvs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies (Allow authenticated users / service role full access for now)
CREATE POLICY "Allow authenticated full access to cvs"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'cvs');

-- DB RLS Policies (Optional but good practice, currently we use service_role so it bypasses RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access Users" ON public.users FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access Jobs" ON public.job_postings FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access Candidates" ON public.candidates FOR ALL TO service_role USING (true);
CREATE POLICY "Service Role Full Access Screenings" ON public.screenings FOR ALL TO service_role USING (true);

-- Allow authenticated users to read and insert (we will refine this later based on roles)
CREATE POLICY "Auth Read Access Jobs" ON public.job_postings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth Insert Jobs" ON public.job_postings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth Update Jobs" ON public.job_postings FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth Read Access Candidates" ON public.candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth Insert Candidates" ON public.candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth Update Candidates" ON public.candidates FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Auth Read Access Screenings" ON public.screenings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth Insert Screenings" ON public.screenings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth Update Screenings" ON public.screenings FOR UPDATE TO authenticated USING (true);
