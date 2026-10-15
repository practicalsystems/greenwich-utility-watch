-- ============================================================================
-- BASELINE: the live schema of the production Supabase project as it
-- existed on 2026-10-14, captured so the Supabase CLI can own the schema from
-- here on.
--
-- HOW THIS FILE IS USED
--   * On the hosted project this migration is NEVER executed. It is recorded
--     as already applied with:
--         npx supabase migration repair --status applied 20260316000000
--     because every object below already exists there (created by hand in the
--     SQL editor between March and April 2026 from supabase/schema.sql,
--     001_nullable_address.sql and 002_admin_settings.sql, all now deleted).
--   * On a fresh local stack (`npx supabase start` / `npx supabase db reset`)
--     it runs for real and produces a database identical to production.
--   * Every statement is idempotent, so even if someone runs `db push` against
--     production without doing the repair first, this file is a no-op there.
--
-- WHAT THIS FILE DELIBERATELY RECORDS
--   It documents what IS, not what was intended. In particular it recreates the
--   two anon INSERT policies ("Anyone can submit a report" and "Anyone can
--   upload submission photos"). The April 2026 security audit (PR #4) removed
--   them from supabase/schema.sql, but the matching DROP POLICY statements were
--   never run against the live database, so the policies are still there. The
--   follow-up migration 20261014000000_remove_anon_insert_policies.sql drops
--   them. Likewise `address` is NOT NULL here because that is what the live
--   column reports, even though 001_nullable_address.sql was meant to relax
--   it; 20261014000001_nullable_address.sql carries that change forward.
--
-- Source of truth for the column list, defaults, indexes, policies, bucket and
-- extensions: read-only queries against the live database on 2026-10-14
-- (information_schema, pg_indexes, pg_policies, storage.buckets,
-- pg_extension). Where the live database and the old schema.sql disagreed, the
-- live database won.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
-- plpgsql is built into Postgres and needs no statement. pgcrypto,
-- pg_stat_statements and supabase_vault are installed on every hosted Supabase
-- project by default; they are listed so this file is a complete inventory and
-- so a local stack matches production. uuid-ossp is the one extension the app
-- actually asked for (submissions.id default).
create extension if not exists "uuid-ossp"        with schema extensions;
create extension if not exists pgcrypto           with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists supabase_vault;


-- ----------------------------------------------------------------------------
-- public.submissions  (15 rows live on 2026-10-14)
-- ----------------------------------------------------------------------------
-- Column order matches the live table: problem_type and duration come last
-- because they were added with ALTER TABLE on 2026-03-17, after the initial
-- CREATE TABLE.
create table if not exists public.submissions (
  id              uuid primary key default extensions.uuid_generate_v4(),
  created_at      timestamptz not null default now(),
  address         text not null,
  cross_streets   text,
  pole_id         text,
  latitude        double precision,
  longitude       double precision,
  description     text not null,
  submitter_name  text,
  submitter_email text,
  status          text not null default 'pending'
                    constraint submissions_status_check
                    check (status in ('pending', 'approved', 'rejected')),
  admin_notes     text,
  photos          text[] not null default '{}',
  problem_type    text,
  duration        text
);

create index if not exists submissions_created_at_idx
  on public.submissions (created_at desc);

create index if not exists submissions_status_idx
  on public.submissions (status);

alter table public.submissions enable row level security;

-- Live policies, verbatim (names, roles and predicates). The drop-then-create
-- pair keeps the file idempotent; CREATE POLICY has no IF NOT EXISTS.
drop policy if exists "Anyone can view approved submissions" on public.submissions;
create policy "Anyone can view approved submissions"
  on public.submissions
  for select
  to anon, authenticated
  using (status = 'approved');

-- STALE: slated for removal by 20261014000000_remove_anon_insert_policies.sql.
-- Recorded here only because it exists on the live database.
drop policy if exists "Anyone can submit a report" on public.submissions;
create policy "Anyone can submit a report"
  on public.submissions
  for insert
  to anon, authenticated
  with check (status = 'pending');


-- ----------------------------------------------------------------------------
-- public.admin_settings  (single-row config table, 1 row live)
-- ----------------------------------------------------------------------------
create table if not exists public.admin_settings (
  id               uuid primary key default gen_random_uuid(),
  alert_email      text,
  alert_on_pending boolean not null default true,
  daily_digest     boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- RLS on, no policies: only the service role (which bypasses RLS) can read or
-- write it. That is the intended access pattern (lib/alertSettings.ts,
-- app/api/admin/settings/route.ts).
alter table public.admin_settings enable row level security;

-- The one settings row the app expects. Guarded so re-running never adds a
-- second row (the app reads with .limit(1).single()).
insert into public.admin_settings (alert_email)
select null
where not exists (select 1 from public.admin_settings);


-- ----------------------------------------------------------------------------
-- Storage: bucket submission-photos  (public, no size limit, no MIME
-- restriction, 20 objects live on 2026-10-14)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('submission-photos', 'submission-photos', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can view submission photos" on storage.objects;
create policy "Anyone can view submission photos"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'submission-photos');

-- STALE: slated for removal by 20261014000000_remove_anon_insert_policies.sql.
-- Recorded here only because it exists on the live database.
drop policy if exists "Anyone can upload submission photos" on storage.objects;
create policy "Anyone can upload submission photos"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'submission-photos');
