-- ============================================================================
-- Approval queue for anything that speaks in the project's voice outside the
-- site: monthly social posts and the neighborhood-association note.
--
-- Rows are written by the monthly cron (one per month per channel), emailed
-- to the admin with one-tap Approve / Skip links, and published through the
-- channel's official API by app/api/drafts/[id]/quick-action when approved.
-- Service role only (RLS on, no policies).
--
-- Rollback: drop table if exists public.outbound_drafts;
-- ============================================================================

create table if not exists public.outbound_drafts (
  id           uuid primary key default gen_random_uuid(),
  month        text not null
                 constraint outbound_drafts_month_format
                 check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  channel      text not null
                 constraint outbound_drafts_channel_check
                 check (channel in ('bluesky', 'x', 'association')),
  body         text not null,
  status       text not null default 'draft'
                 constraint outbound_drafts_status_check
                 check (status in ('draft', 'approved', 'published', 'skipped', 'failed')),
  created_at   timestamptz not null default now(),
  approved_at  timestamptz,
  published_at timestamptz,
  result       jsonb,
  error        text,
  constraint outbound_drafts_month_channel_key unique (month, channel)
);

alter table public.outbound_drafts enable row level security;
