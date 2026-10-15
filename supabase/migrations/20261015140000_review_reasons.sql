-- ============================================================================
-- Why a submission is waiting for review.
--
-- app/api/submissions records the auto-approval failures (no GPS, short
-- description, content filter, image moderation flag or "image moderation
-- not configured") on the row itself so the admin dashboard can show them,
-- not only the alert email. Null for submissions that were auto-approved.
--
-- Admin-only: the anon column grant from 20261014000002 is deliberately NOT
-- extended, so the public key cannot read this column. Idempotent.
--
-- Rollback:
--   alter table public.submissions drop column if exists review_reasons;
-- ============================================================================

alter table public.submissions
  add column if not exists review_reasons text[];

comment on column public.submissions.review_reasons is
  'Auto-approval failures recorded at submission time; null when auto-approved. Admin-only.';
