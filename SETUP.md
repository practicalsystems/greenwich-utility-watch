# Greenwich Utility Watch — Setup & Deployment Guide

## 1. Install Dependencies

```bash
cd greenwich-utility-watch
npm install
```

---

## 2. Set Up Supabase

### 2a. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note your **Project URL** and **API keys** (under Settings → API).

### 2b. Apply the Database Schema
The schema is versioned as Supabase CLI migrations in `supabase/migrations/` (there is no `schema.sql` to paste any more). From the repo root:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>   # from the dashboard URL
npx supabase db push
```

This creates:
- The `submissions` table with all fields
- The `admin_settings` table (single row, seeded)
- Row Level Security (RLS) policies (read-only for the anon role, all writes go through server-side API routes)
- The `submission-photos` storage bucket

For the existing production project (which predates the CLI) there is a one-time baseline step instead; see `supabase/README.md`. Later schema changes are pushed automatically by GitHub Actions when they merge to `main`.

---

## 3. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role secret key |
| `ADMIN_PASSWORD` | Choose any strong password |
| `ADMIN_SECRET` | Choose any random string (used to sign the admin session token) |

---

## 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- **Submit a report:** `http://localhost:3000/`
- **Public gallery:** `http://localhost:3000/gallery`
- **Admin login:** `http://localhost:3000/admin`
- **Admin dashboard:** `http://localhost:3000/admin/dashboard` (after login)

---

## 5. Deploy to Vercel

### 5a. Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
gh repo create greenwich-utility-watch --public --source=. --push
# or: git remote add origin https://github.com/YOUR_USERNAME/greenwich-utility-watch.git && git push -u origin main
```

### 5b. Import to Vercel
1. Go to [vercel.com](https://vercel.com) → **Add New Project**.
2. Import your GitHub repository.
3. Vercel will auto-detect Next.js — no build settings needed.

### 5c. Add Environment Variables
In Vercel's project settings under **Environment Variables**, add these from your `.env.local`:

**Required:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PASSWORD`
- `ADMIN_SECRET`

**Optional (for email alerts):**
- `RESEND_API_KEY` — Resend API key for email notifications
- `ALERT_EMAIL` — email address to receive alerts and daily digests

### 5d. Deploy
Click **Deploy**. Vercel will build and deploy. Your site will be live at `your-project.vercel.app`.

---

## How It Works

### Submission Flow
1. Resident fills out the form on `/` and hits **Submit Report**.
2. Photos are uploaded to Supabase Storage (`submission-photos` bucket).
3. Text is checked for profanity/inappropriate content.
4. If the submission has a photo, GPS, a known problem type, a 20+ char description, and clean content, it is **auto-approved** and appears in the gallery immediately.
5. Otherwise, it goes to `status = 'pending'` and an email alert is sent to the admin (if configured).
6. Admin reviews pending items at `/admin/dashboard` (or via one-tap email links) and approves or rejects.
7. A daily digest email summarizes the last 24 hours of activity.

### Admin Authentication
- POST your password to `/api/admin/login`.
- If correct, an `httpOnly` cookie containing an HMAC-signed token is set.
- Middleware validates the token on every `/admin/dashboard` request.
- The cookie expires in 7 days. Sign out with the **Sign out** button.

### Security Notes
- `SUPABASE_SERVICE_ROLE_KEY` is never exposed to the browser — only used in server-side API routes.
- The admin password is verified server-side and never stored in the database.
- All database writes and storage uploads go through the Next.js API routes (using the service role key), which enforce rate limiting, input validation, and file quarantine.
- RLS policies restrict the anon role to read-only access (approved submissions only). There is no INSERT policy for the anon role, preventing direct writes that would bypass server-side protections.

---

## Troubleshooting

**Photos not uploading?** Check that the `submission-photos` bucket exists in Supabase Storage and is set to **public**.

**Admin login not working?** Make sure `ADMIN_PASSWORD` and `ADMIN_SECRET` are set in both `.env.local` (local) and Vercel environment variables (production).

**Gallery empty?** You need to approve submissions from the admin dashboard first.

**"relation does not exist" error?** The migrations have not been applied to that project. Run `npx supabase migration list` to compare local and remote, then `npx supabase db push` (see `supabase/README.md`).
