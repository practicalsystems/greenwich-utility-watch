-- ============================================================================
-- Remove the two anon INSERT policies that PR #4 (April 2026 security audit,
-- "Security: harden Supabase RLS policies and update Next.js", merged
-- 2026-04-10) deleted from supabase/schema.sql but that were never actually
-- dropped from the live database.
--
-- WHY
--   Every write the app performs goes through a server-side API route that
--   uses the service role key (lib/supabase.ts createServerClient):
--     * app/api/submissions/route.ts            .upload() + .insert()
--     * app/api/admin/submissions/[id]/route.ts  .update()
--     * app/api/submissions/[id]/quick-action/route.ts .update()
--     * app/api/admin/settings/route.ts          .update() / .insert()
--   Those routes are where rate limiting (lib/rateLimit.ts), input validation
--   (lib/validate.ts), content moderation (lib/contentCheck.ts) and the
--   magic-byte file quarantine (lib/fileQuarantine.ts) live. An INSERT policy
--   for the anon role lets anyone holding the public anon key skip all of that
--   and write rows or upload arbitrary files straight to Supabase.
--
--   PR #4's description told the operator to run exactly these two statements
--   in the SQL editor after merging. A read-only check of pg_policies on
--   2026-10-14 showed both policies still present, so the hardening was never
--   applied. This migration applies it, and because it is now under CLI
--   control it cannot silently go missing again.
--
-- EFFECT ON THE APP: none. The service role bypasses RLS, and no code path
--   uses the anon client for writes (createBrowserClient in lib/supabase.ts
--   is exported but imported nowhere). The two SELECT policies are untouched,
--   so the public gallery and photo URLs keep working.
--
-- ROLLBACK (only if something unexpected breaks):
--   create policy "Anyone can submit a report" on public.submissions
--     for insert to anon, authenticated with check (status = 'pending');
--   create policy "Anyone can upload submission photos" on storage.objects
--     for insert to anon, authenticated with check (bucket_id = 'submission-photos');
-- ============================================================================

drop policy if exists "Anyone can submit a report" on public.submissions;

drop policy if exists "Anyone can upload submission photos" on storage.objects;
