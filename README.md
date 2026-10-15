# Greenwich Utility Watch

A community reporting tool for documenting utility pole concerns in Greenwich, CT. Residents submit photos and descriptions of problem poles; a single admin reviews submissions and approves them to a public gallery.

**Live site:** [greenwichutilitywatch.org](https://greenwichutilitywatch.org)

---

## Documentation

| Document | What it covers |
|---|---|
| [AGENTS.md](./AGENTS.md) | Working agreements for agents and contributors |
| [SETUP.md](./SETUP.md) | Local setup from scratch: Supabase schema, env vars, first deploy |
| [SECURITY.md](./SECURITY.md) | How to report a vulnerability |
| [supabase/README.md](./supabase/README.md) | Database migration workflow |

Operational runbooks, decision records, the roadmap and marketing material are kept in a private companion repository and are intentionally not published here.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database + Storage | Supabase (Postgres + object storage) |
| Hosting | Vercel |
| Styling | Tailwind CSS |
| Analytics | Vercel Analytics |
| Email | Resend |
| Content moderation | obscenity |
| Tests | Vitest |

---

## Local development

### Prerequisites

- Node.js 18+
- A Supabase project (free tier is fine)

### 1. Clone and install

```bash
git clone <repo-url>
cd greenwich-utility-watch
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Apply the schema with the Supabase CLI (no SQL editor copy-paste):
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   This creates the `submissions` and `admin_settings` tables, read-only RLS policies, and the `submission-photos` storage bucket.
3. The schema lives in [`supabase/migrations/`](./supabase/migrations/) and is deployed by CI on merge to `main`. See [`supabase/README.md`](./supabase/README.md) for the workflow, and for the one-time baseline step the existing production project needs.

### 3. Configure environment variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in all required values (see table below).

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL (`https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key (safe to expose client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key — **never expose this client-side** |
| `ADMIN_PASSWORD` | Yes | Password for the admin dashboard login |
| `ADMIN_SECRET` | Yes | Secret used to sign session tokens — use a random 64-char string |
| `NEXT_PUBLIC_SITE_URL` | No | Full public URL, used in notification messages and email links |
| `NOTIFY_WEBHOOK_URL` | No | Webhook URL for new-submission alerts (Discord, Slack, ntfy.sh, etc.) |
| `RESEND_API_KEY` | No | Resend API key for email alerts ([resend.com](https://resend.com)) |
| `EMAIL_FROM` | For subscriber email | Sender on a Resend-verified domain, e.g. `Greenwich Utility Watch <updates@mail.greenwichutilitywatch.org>`. Admin alerts fall back to `onboarding@resend.dev` without it; **subscriber features (opt-in form, monthly send, pole updates) are disabled until it is set** |
| `ALERT_EMAIL` | No | Email address to receive pending-submission alerts and daily digests |
| `CRON_SECRET` | Recommended | You set it; Vercel Cron sends it as a bearer token and the cron routes reject requests without it |
| `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` | For Bluesky | Project account handle (e.g. `greenwichutilitywatch.org`) and an app password; approved monthly posts publish via the AT Protocol API. Optional `BLUESKY_SERVICE` (default `https://bsky.social`) |
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` | For X | OAuth 1.0a user-context credentials for the project's X account (free tier, read+write app) |
| `ASSOCIATION_RECIPIENTS` | Optional | Comma-separated newsletter contacts the approved association note is emailed to from `EMAIL_FROM`. Empty: the note is approve-and-copy only |

Generate a strong `ADMIN_SECRET`:
```bash
openssl rand -hex 32
```

---

## Application routes

| Route | Description |
|-------|-------------|
| `/` | Public submission form |
| `/gallery` | Public gallery of approved reports |
| `/about` | About page |
| `/press` | Press & data: live numbers, oldest exhibits, photo links, open-data links, contact address |
| `/poles/[id]` | Permanent page for one approved report (the link target for the feed, social posts and badge) |
| `/feed.xml` | RSS 2.0 feed of approved reports |
| `/data/reports.json` | JSON export of approved reports (public columns + neighborhood, age_days, url) |
| `/data/reports.csv` | CSV export, same columns |
| `/badge.svg` | Live SVG badge, "N poles reported · oldest X days" (`?style=dark` for dark backgrounds); CDN-cached 5 min |
| `/badge` | Embed instructions and copy-paste snippets |
| `/reports` | Monthly "State of the Poles" index |
| `/reports/YYYY-MM` | One month's report (stored snapshot, or a live view until the cron publishes it) |
| `/reports/feed.xml` | RSS of published monthly reports |
| `/subscribe/confirm` | Double opt-in confirmation landing (signed token; the Confirm button POSTs to `/api/subscribe/confirm`) |
| `/subscribe/unsubscribe` | One-click unsubscribe landing (signed token, never expires) |
| `/admin` | Admin login |
| `/admin/dashboard` | Admin review dashboard (requires auth) |

### API routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/api/submissions` | None | Accept a new public submission (auto-approved if it passes quality + content checks) |
| `POST` | `/api/admin/login` | Password | Create admin session |
| `POST` | `/api/admin/logout` | None | Destroy admin session cookie |
| `PATCH` | `/api/admin/submissions/[id]` | Session cookie | Update submission status/notes |
| `GET/POST` | `/api/submissions/[id]/quick-action` | Signed token | One-tap approve/reject from email links |
| `POST` | `/api/subscribe` | None (rate limited) | Start a double opt-in subscription; 503 until `EMAIL_FROM` is set |
| `POST` | `/api/subscribe/confirm` | Signed token | Perform the double opt-in confirmation (from the landing page button) |
| `POST` | `/api/subscribe/unsubscribe` | Signed token | RFC 8058 one-click unsubscribe target (`List-Unsubscribe-Post`) |
| `GET/POST` | `/api/drafts/[id]/quick-action` | Signed token (7 days) | One-tap Approve / Skip of a monthly draft from the admin email; GET confirms, POST publishes through the channel's API |
| `GET` | `/api/cron/digest` | `CRON_SECRET` | Daily admin digest (Vercel Cron, 12:00 UTC); also continues monthly-report subscriber sends and publishes approved drafts whose channel has since been connected |
| `GET` | `/api/cron/monthly-report` | `CRON_SECRET` | Build and publish the monthly report, email subscribers, draft the month's posts and email the admin for approval (Vercel Cron, 1st of the month 13:00 UTC; `?month=YYYY-MM` to backfill, `&force=1` to regenerate undecided drafts) |

---

## Auto-approval

Submissions that pass automated quality and content checks are published immediately; everything else goes to the manual review queue, where the admin gets a one-tap approve/reject email. Flagged submissions are never rejected automatically. The exact thresholds live in [`lib/autoApprove.ts`](./lib/autoApprove.ts) and are intentionally not documented here.

## Admin workflow

1. Navigate to `/admin` and log in with `ADMIN_PASSWORD`
2. The dashboard shows submissions grouped by status (Pending / Approved / Rejected)
3. Click **Review** on any submission to open the detail modal
4. Add optional internal notes, then **Approve** or **Reject**
5. Approved submissions appear immediately in the public gallery

### Email alerts

If `RESEND_API_KEY` and `ALERT_EMAIL` are set:

- **Pending alert**: when a submission needs manual review, an email is sent immediately with the submission details, why it wasn't auto-approved, and one-tap Approve/Reject buttons
- **Daily digest**: a summary email at ~8am ET listing auto-approved count, pending items, and overall system health
- **One-tap actions**: approve or reject directly from the email via signed links (GET shows a confirmation page, POST performs the action, safe from email link scanners)

Webhook notifications (`NOTIFY_WEBHOOK_URL`) continue to work alongside email for Discord/Slack/ntfy.sh.

---

## Security architecture

### Content moderation
Public-facing text fields (description and address) are checked for profanity and inappropriate content by [`lib/contentCheck.ts`](./lib/contentCheck.ts) using the `obscenity` package. Flagged submissions skip auto-approval and go to the manual review queue. Content is never rejected outright.

### Input validation
All form fields are validated server-side in [`lib/validate.ts`](./lib/validate.ts):
- Text fields are stripped of null bytes and control characters
- Enum fields (`problem_type`, `duration`) are whitelisted against the values shown in the form
- GPS coordinates are bounds-checked to the Greenwich, CT area
- Email addresses are regex-validated

### File quarantine
Uploaded photos go through [`lib/fileQuarantine.ts`](./lib/fileQuarantine.ts) before touching storage:
- File count enforced server-side (max 5)
- File size enforced server-side (max 10 MB each)
- **Magic bytes** are read and compared against known JPEG/PNG/GIF/WebP/HEIC signatures — the declared MIME type and file extension are ignored, preventing disguised file uploads

### Session tokens
Admin sessions use HMAC-SHA256 signed tokens ([`lib/sessions.ts`](./lib/sessions.ts)):
- Each token embeds a random ID and timestamp
- Tokens expire after 7 days based on the embedded timestamp
- **To invalidate all active sessions immediately:** rotate `ADMIN_SECRET` in your environment variables and redeploy
- For per-session revocation (e.g. after a suspected compromise), rotate `ADMIN_SECRET`

### Supabase RLS design
All database writes and storage uploads are routed through server-side API routes using the service role key (which bypasses RLS). The Supabase anon role has **read-only access**: it can view approved submissions and stored photos, but cannot insert rows or upload files directly. This prevents attackers from bypassing the application's rate limiting, input validation, and file quarantine by writing to Supabase directly with the public anon key.

### Rate limiting
Public endpoints and the admin login are rate limited per IP in [`lib/rateLimit.ts`](./lib/rateLimit.ts).

### HTTP security headers
Set on every response via `next.config.js`:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`

---

## Testing

```bash
npm test                 # run all tests once
npm run test:watch       # watch mode
npm run test:coverage    # with coverage report
```

Tests live in `__tests__/lib/` and `lib/` and cover security-critical library code: session token creation/verification, input validation, file quarantine (magic bytes), rate limiting, password verification, and content moderation (profanity detection, false positive protection).

---

## Deployment (Vercel)

1. Push to GitHub and import the repo in [vercel.com](https://vercel.com)
2. Add all environment variables in **Project → Settings → Environment Variables**
3. Deploy — Vercel runs `npm run build` automatically

The gallery page uses ISR (`revalidate = 60`) so it rebuilds in the background every 60 seconds without a full redeploy.

---

## Rotating secrets

| Scenario | Action |
|----------|--------|
| Suspected session token theft | Change `ADMIN_SECRET` + redeploy → all existing sessions are instantly invalidated |
| Admin password compromised | Change `ADMIN_PASSWORD` + redeploy |
| Supabase service role key leaked | Rotate in Supabase dashboard → update `SUPABASE_SERVICE_ROLE_KEY` + redeploy |

---

## Adding error tracking (Sentry)

For production error monitoring with stack traces:

```bash
npx @sentry/wizard@latest -i nextjs
```

This adds `sentry.client.config.ts`, `sentry.server.config.ts`, and wraps `next.config.js` automatically. Add `SENTRY_DSN` to your environment variables.
