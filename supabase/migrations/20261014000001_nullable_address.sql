-- ============================================================================
-- Carry forward the old hand-run 001_nullable_address.sql ("Allow GPS-only
-- submissions without a text address", commit 187bc92, 2026-04-10).
--
-- WHY THIS IS A MIGRATION AND NOT PART OF THE BASELINE
--   The baseline records the live database as inspected on 2026-10-14, and
--   that inspection reported public.submissions.address as NOT NULL. That is
--   the pre-001 state, which means 001 was most likely never run against the
--   live project, exactly like the PR #4 policy drops.
--
--   The application has required this change since April 2026:
--     * lib/validate.ts accepts a submission with GPS coordinates and no
--       address, and returns address: null in that case.
--     * app/api/submissions/route.ts inserts that null straight into the
--       address column.
--     * lib/supabase.ts types address as string | null and displayLocation()
--       falls back to "GPS: lat, lng".
--   With NOT NULL still in place, every GPS-only report fails at the insert
--   with a 500 ("Could not save submission. Please try again.").
--
-- SAFETY
--   DROP NOT NULL is metadata-only (no table rewrite, no lock beyond a brief
--   ACCESS EXCLUSIVE), reversible, and a silent no-op if the column is
--   already nullable. So this is correct whether or not the 2026-10-14
--   reading of the column was accurate.
-- ============================================================================

alter table public.submissions
  alter column address drop not null;
