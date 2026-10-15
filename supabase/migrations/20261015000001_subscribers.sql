-- ============================================================================
-- Email subscribers (double opt-in, one-click unsubscribe).
--
-- One row per (email, pole). A row with submission_id NULL is a subscription
-- to the monthly "State of the Poles" report; a row with a submission_id is a
-- "tell me when this pole changes" watch, which also receives the monthly
-- report. Each row carries its own confirmation state; unsubscribing removes
-- every row for that email address.
--
-- RLS is on with no policies: only the service role (API routes) reads or
-- writes this table. Addresses never reach the browser or any public surface.
--
-- Rollback: drop table if exists public.subscribers;
-- ============================================================================

create table if not exists public.subscribers (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null,
  source               text not null default 'site'
                         constraint subscribers_source_check
                         check (source in ('site', 'submission', 'reports', 'pole')),
  submission_id        uuid references public.submissions (id) on delete cascade,
  created_at           timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  confirmed_at         timestamptz,
  unsubscribed_at      timestamptz,
  last_sent_at         timestamptz
);

-- One general subscription per address, and one watch per address per pole.
create unique index if not exists subscribers_general_email_idx
  on public.subscribers (lower(email))
  where submission_id is null;

create unique index if not exists subscribers_watch_email_idx
  on public.subscribers (lower(email), submission_id)
  where submission_id is not null;

create index if not exists subscribers_submission_id_idx
  on public.subscribers (submission_id);

alter table public.subscribers enable row level security;
