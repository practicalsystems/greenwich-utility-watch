-- ============================================================================
-- Monthly "State of the Poles" snapshots + official follow-up fields.
--
-- 1. public.monthly_reports: one row per calendar month, written by the cron
--    route /api/cron/monthly-report (service role) and read by /reports and
--    /reports/<month>. Storing the snapshot keeps the published report stable
--    even as later approvals or edits change the live numbers. RLS is on with
--    no policies, so only the service role can read or write it, exactly like
--    admin_settings.
--
-- 2. Four follow-up columns on public.submissions so an official response can
--    be recorded and shown on the public record (ROADMAP 3a "per-report status
--    timeline"). They are edited by the admin (app/api/admin/submissions/[id])
--    and are part of the public record, so the anon column grant from
--    20261014000002 is extended to include them. Everything here is
--    idempotent.
--
-- Rollback:
--   drop table if exists public.monthly_reports;
--   alter table public.submissions
--     drop column if exists reported_to, drop column if exists reported_at,
--     drop column if exists official_response, drop column if exists resolved_at;
-- ============================================================================

create table if not exists public.monthly_reports (
  month        text primary key
                 constraint monthly_reports_month_format
                 check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  generated_at timestamptz not null default now(),
  data         jsonb not null
);

alter table public.monthly_reports enable row level security;

alter table public.submissions
  add column if not exists reported_to       text
    constraint submissions_reported_to_check
    check (reported_to is null or reported_to in ('Eversource', 'Frontier', 'Town of Greenwich', 'PURA', 'Other')),
  add column if not exists reported_at       date,
  add column if not exists official_response text,
  add column if not exists resolved_at       date;

grant select (reported_to, reported_at, official_response, resolved_at)
  on public.submissions to anon, authenticated;
