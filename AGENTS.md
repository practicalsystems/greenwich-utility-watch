# AGENTS.md — Greenwich Utility Watch

Canonical, tool-agnostic guide for any agent or developer working in this repo. Read it before
touching code. `CLAUDE.md` and `.github/copilot-instructions.md` both point here.

## What this is

Greenwich Utility Watch is a community reporting tool for utility pole problems in Greenwich, CT.
Residents submit photos and a short description from their phone. Submissions that pass the automated
quality and content checks in `lib/autoApprove.ts` are published immediately; everything else queues
for a single admin to review, with one-tap approve/reject links by email.
Public surfaces: submission form (`/`), gallery (`/gallery`), impact dashboard (`/dashboard`),
about (`/about`), press kit (`/press`), per-report permalinks (`/poles/<id>`), RSS (`/feed.xml`) and
JSON/CSV export (`/data/reports.json`, `/data/reports.csv`). Admin: `/admin` login, `/admin/dashboard` review queue.
Live at https://greenwichutilitywatch.org.

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | `proxy.ts` is Next 16's name for middleware; it gates `/admin/dashboard` |
| Language | TypeScript 5, `strict: true` | path alias `@/*` → repo root |
| UI | React 19, Tailwind CSS 3, Leaflet / react-leaflet 5, Recharts 3 | Majors of react, react-leaflet, recharts, typescript, tailwindcss and vitest are deliberate migrations, not weekly Dependabot PRs; Tailwind 4 deferred (browser floor); see `.github/dependabot.yml` |
| Data + files | Supabase (Postgres + Storage) via `@supabase/supabase-js` | anon role is read-only, see security rules |
| Email | Resend + `@react-email/components` | `lib/email.ts` |
| Content filter | `obscenity` | `lib/contentCheck.ts` |
| Tests | Vitest 5, node environment | `__tests__/lib/`, `lib/*.test.ts` |
| Lint | ESLint 10 flat config, `eslint-config-next` | `eslint.config.mjs` (`next lint` no longer exists) |
| Hosting | Vercel (Node 24.x), Vercel Analytics, Vercel Cron | `vercel.json` |
| Runtime | Node 24 everywhere (CI, devcontainer, Vercel) | `@types/node` is pinned to the same major; bump it only when the runtime moves |

## Commands

```bash
npm ci              # install from the lockfile (not `npm install`)
npm run dev         # http://localhost:3000
npm test            # vitest run (94 tests, well under a second)
npm run test:watch
npm run lint        # eslint .
npm run typecheck   # tsc --noEmit
npm run build       # next build; needs the 5 required env vars (placeholders work, see .github/workflows/ci.yml)
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build, plus a gitleaks scan of the
full git history. Run the same sequence locally before pushing.

## Secrets

Vercel is the source of truth for every secret. Never commit `.env.local`, any `.env*`, or
`.vercel/` (all gitignored). To get dev secrets:

```bash
npm i -g vercel@latest
vercel login
vercel link --yes --project greenwich-utility-watch --scope practicalsystems-projects
vercel env pull .env.local
```

The full environment variable table is in [README.md → Environment variables](README.md#environment-variables).
Required for a build: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `ADMIN_SECRET`. In Codespaces / any devcontainer
the `postAttachCommand` prints these steps.

## Infrastructure

- **Vercel**: team `practicalsystems-projects`, project `greenwich-utility-watch` (the names `vercel link`
  needs; raw IDs are not recorded here). `main` auto-deploys to production; every PR gets a preview.
- **Supabase**: one project (the ref is set as `SUPABASE_PROJECT_ID` in
  `.github/workflows/supabase-migrations.yml`). Tables `public.submissions`, `public.admin_settings`,
  `public.monthly_reports`, `public.subscribers` (service role only) and `public.outbound_drafts`;
  storage bucket `submission-photos` (public read). Schema changes are timestamped files in
  `supabase/migrations/`, validated on every PR and pushed by CI on merge to `main`; see
  `supabase/README.md`.
- **Resend**: admin alerts, the daily digest and subscriber mail (`lib/email.ts`, `lib/emailConfig.ts`);
  subscriber mail only sends when `EMAIL_FROM` is set on a verified domain.
- **Vercel Cron**: `GET /api/cron/digest` daily and `GET /api/cron/monthly-report` monthly (`vercel.json`),
  both authenticated with `CRON_SECRET`. Hobby plan: two crons maximum.
- **GitHub**: private repository. Dependabot runs weekly for npm and GitHub Actions.
- Operational detail (IDs, rotation history, incident notes) lives in the private companion repository.

## Repo map

```
app/                       App Router routes. app/api/** are the ONLY writers to Supabase
  page.tsx                 public submission form
  gallery/ dashboard/      public pages (ISR, revalidate = 60)
  press/ poles/[id]        press kit + per-report permalinks (ISR)
  badge.svg/ badge/        embeddable live badge (CDN-cached SVG) + embed page
  feed.xml/ data/          RSS feed and JSON/CSV export route handlers (revalidate = 300)
  admin/                   login page + review dashboard
  api/submissions          POST: validate → quarantine → upload → auto-approve or queue
  api/admin/**             login / logout / settings / submission status (session cookie)
  api/submissions/[id]/quick-action   signed one-tap approve/reject from email
  api/cron/digest          daily digest
  api/cron/monthly-report  monthly State of the Poles: build, store snapshot, revalidate /reports, email subscribers
  api/subscribe            POST opt-in; api/subscribe/unsubscribe one-click (RFC 8058)
  api/drafts/[id]/quick-action   one-tap Approve / Skip of a monthly draft (GET confirms, POST publishes)
  subscribe/confirm, subscribe/unsubscribe   token landing pages
  reports/ reports/[month] monthly report index + page (snapshot or live view); reports/feed.xml RSS
components/                client components (SubmissionForm, GalleryView, AdminDashboard, map, charts)
lib/                       all business logic, unit-tested: validate, fileQuarantine, contentCheck,
                           autoApprove, sessions, rateLimit, quickActionToken, email, notify, supabase,
                           publicReport (public column list + derived fields; every public surface goes
                           through it), publicData (the one Supabase loader for public pages),
                           neighborhoods (GPS → approximate village), feed (RSS), csv, badge (SVG),
                           monthlyReport (pure State of the Poles builder + text rendering),
                           signedToken (generic HMAC tokens; quickActionToken and subscribers build on it),
                           subscribers (double opt-in, unsubscribe, monthly + pole sends), emailTemplates,
                           drafts (pure monthly post / note generator), draftsQueue (rows, tokens, approval
                           email, publish), social/ (bluesky, x adapters; index dispatches + association send)
supabase/                  schema.sql + migrations/
proxy.ts                   auth gate for /admin/dashboard
next.config.js             CSP + security headers, image remotePatterns
.gitleaks.toml             secret-scan config (one allowlisted test fixture)
```

## Engineering rules

1. Every change is a branch + PR against `main`. `main` is protected; never push to it directly.
2. CI must be green before merge: lint, typecheck, tests, build, gitleaks.
3. Small, focused commits with clear messages. One concern per PR.
4. Logic in `lib/` gets Vitest coverage; add or update tests in the same PR.
5. No new dependency without a stated reason in the PR body. Prefer what Next.js, Supabase and
   Vercel already provide.
6. Fill in the PR template (What / Why / How tested / Checklist).
7. If you touch anything credential-shaped, run
   `gitleaks git --redact --no-banner -c .gitleaks.toml .` before pushing. Allowlist test fixtures
   by literal value, never by whole file.

## Security and architecture rules (settled; do not relitigate)

- **All Supabase writes go through Next.js API routes using the service role key.** The anon role
  is read-only by design: it has SELECT on approved rows and public columns only, and no INSERT
  policies on `public.submissions` or the `submission-photos` bucket. Never add write policies for
  it, and never write to Supabase from a client component.
- **Uploaded files are validated by magic bytes and size** in `lib/fileQuarantine.ts`; the declared
  MIME type and extension are ignored. Keep it that way.
- **When a Next.js CVE lands, check whether the vulnerable feature is actually used here** (Pages
  Router, image optimizer, server actions, etc.) before treating it as exploitable. Upgrade anyway
  when it is cheap.
- **Notification principle**: alert the admin only on items that need human judgment. Auto-approval
  handles the bulk, the content filter catches bad content, the daily digest is the audit trail.
  Do not add notifications that fire on every submission.
- Admin auth is one password plus an HMAC-signed, httpOnly session cookie (`lib/sessions.ts`,
  7-day expiry). Rotating `ADMIN_SECRET` invalidates every session. No user system, by design.
- Rate limits live in `lib/rateLimit.ts`; change them there, not in route handlers.
- Nothing is ever posted to a social account or emailed to a third party without a one-tap human approval
  (`lib/draftsQueue.ts`). Adapters live in `lib/social/` and use only official APIs; Nextdoor and Facebook
  have none and are out of scope by their terms.
- Subscriber addresses never leave the server: no public surface selects from `subscribers`, and the only
  thing shown to the admin is a count.

## Product guardrails

- Owned channels only, factual-neutral civic tone. No person is named on any public surface; the only
  published contact is `CONTACT_EMAIL` in `lib/site.ts`.
- Nothing is posted to a social account or emailed to a third party without one-tap human approval.
- Do not build escalation pipelines to the utility or the Town; that is a product decision recorded
  in the private companion repository, revisited when the submission volume justifies it.
- Already decided against: user accounts for submitters (friction). Ask before re-proposing.

## Docs map

- [README.md](README.md) — product overview, env var table, routes, security architecture
- [SETUP.md](SETUP.md) — first-time Supabase + Vercel setup
- [SECURITY.md](SECURITY.md) — vulnerability reporting
- [supabase/README.md](supabase/README.md) — migration workflow
- Operability: `.github/workflows/ci.yml`, `.devcontainer/devcontainer.json`, `.gitleaks.toml`,
  `.github/dependabot.yml`, `.github/pull_request_template.md`
- Roadmap, decision records, operations runbook and marketing plan: private companion repository.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
