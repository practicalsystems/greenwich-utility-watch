-- Restrict what the public (anon) key can read from public.submissions.
--
-- Why: the RLS policy "Anyone can view approved submissions" limits anon to
-- approved rows, but the default table-level SELECT grant exposes every
-- column of those rows, including submitter_name, submitter_email and
-- admin_notes. The public anon key ships in the browser bundle
-- (NEXT_PUBLIC_SUPABASE_ANON_KEY), so anyone can query those columns.
--
-- The app never reads with the anon key (every page and route uses
-- createServerClient() with the service role, which bypasses grants and
-- RLS), so this change is invisible to the app and only closes the hole.
--
-- Column-level grants: revoke the table-wide SELECT, then grant SELECT on the
-- public-safe columns only. Both statements are idempotent.
--
-- Rollback:
--   grant select on public.submissions to anon, authenticated;

revoke select on public.submissions from anon, authenticated;

grant select (
  id,
  created_at,
  address,
  cross_streets,
  pole_id,
  latitude,
  longitude,
  description,
  status,
  photos,
  problem_type,
  duration
) on public.submissions to anon, authenticated;
