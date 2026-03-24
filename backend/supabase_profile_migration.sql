-- Add rich profile columns to candidates table
alter table candidates
  add column if not exists profile jsonb,
  add column if not exists onboarding_complete boolean default false,
  add column if not exists updated_at timestamptz default now();

-- Index for profile queries
create index if not exists candidates_user_id_idx on candidates(user_id);
