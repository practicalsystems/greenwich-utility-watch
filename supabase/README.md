# Database schema: Supabase CLI migrations

The schema of the hosted Supabase project (`<project-ref>`, us-east-1,
Postgres 17) is versioned here and applied with the
[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).
Nothing is pasted into the SQL editor any more.

```
supabase/
├── config.toml                                     CLI config (minimal; local ports, PG 17)
├── migrations/
│   ├── 20260316000000_baseline.sql                 the live schema as of 2026-10-14
│   ├── 20261014000000_remove_anon_insert_policies.sql  the PR #4 hardening, finally applied
│   └── 20261014000001_nullable_address.sql         the old 001 migration, carried forward
└── README.md                                       this file
```

`supabase/schema.sql`, `migrations/001_nullable_address.sql` and
`migrations/002_admin_settings.sql` were deleted in the PR that introduced this
layout. Their content is represented in the files above (schema.sql and 002 in
the baseline; 001 as `20261014000001`, see "Why 001 is a separate migration").

## How it works

* A migration is a plain SQL file named `<YYYYMMDDHHMMSS>_<snake_case_name>.sql`.
  The CLI applies files in timestamp order and records each one in
  `supabase_migrations.schema_migrations` on the target database.
* `supabase db push` compares that table with `supabase/migrations/` and runs
  only the files the database has not seen. Re-running it is a no-op.
* Each file runs inside one transaction. A failing statement rolls the whole
  file back and leaves the history table untouched.
* CI (`.github/workflows/supabase-migrations.yml`) validates every PR that
  touches `supabase/**` and pushes to production on merge to `main` once the
  deploy secrets exist. Details under "CI".

## One-time baseline procedure (production)

The hosted database was built by hand before the CLI was ever linked, so its
`supabase_migrations.schema_migrations` table is empty. The baseline migration
describes objects that already exist there and must be **marked applied, not
executed**. An operator with access to the Supabase org runs this exactly once,
after the introducing PR merges:

```bash
# from the repo root, on main
npx supabase login
npx supabase link --project-ref <project-ref>      # prompts for the DB password
npx supabase migration repair --status applied 20260316000000
npx supabase db push                                       # applies 20261014000000 and 20261014000001 only
npx supabase migration list                                # all three rows should show Local and Remote
```

What each step does:

| Step | Effect on production |
|---|---|
| `login` | Stores a personal access token on this machine. No DB change. |
| `link` | Records the project ref under `supabase/.temp/` (git-ignored) and verifies the DB password. No DB change. |
| `migration repair --status applied 20260316000000` | Inserts one row into `supabase_migrations.schema_migrations`. **Does not run the baseline SQL.** |
| `db push` | Runs `20261014000000_remove_anon_insert_policies.sql` and `20261014000001_nullable_address.sql`. The dry-run form `npx supabase db push --dry-run` lists them first without applying. |
| `migration list` | Read-only comparison of local files vs. remote history. |

Safety net: the baseline is written to be fully idempotent (`create ... if not
exists`, `on conflict do nothing`, `drop policy if exists` before every
`create policy`). If someone skips the `repair` step and runs `db push`, the
baseline executes as a no-op against production and everything still
converges. Doing the repair is still the right call because it keeps the
history honest about what was and was not run.

### Migration history

The history of what each migration changed and why is kept in the private companion repository.

## Day-to-day: adding a migration

```bash
npx supabase migration new add_thing          # creates supabase/migrations/<timestamp>_add_thing.sql
$EDITOR supabase/migrations/*_add_thing.sql    # write plain SQL; make it idempotent where cheap
npm run db:check                               # name + Postgres-grammar parse, no database needed
```

Then open a PR. CI applies every migration to a fresh Postgres 17 and lints
the result. On merge to `main`, CI runs `supabase db push` against production.

Rules of thumb:

* Never edit a migration that has already been pushed to production; add a new
  one. The history table records file names, not content.
* Never rename the baseline file or change its timestamp; `migration repair`
  recorded `20260316000000`.
* Keep the storage bucket defined by the baseline's `insert into
  storage.buckets`, not by `[storage.buckets.*]` in `config.toml`, so there is
  one source of truth. (`config.toml` is read by the local stack and by
  `supabase config push`, which this project does not use.)
* Data backfills belong in a migration too, guarded so they are safe to re-run
  (see the `where not exists` seed of `admin_settings` in the baseline).
* Prefer `npx supabase@2.121.0 ...` (the version CI pins) when exact parity
  matters; plain `npx supabase` is fine for everyday work.

## Local development (optional)

With Docker Desktop running:

```bash
npx supabase start          # local Postgres 17 + API + Storage + Studio, all migrations applied
npx supabase status         # prints local URL, anon key, service role key for .env.local
npx supabase db reset       # wipe and re-apply all migrations (fast way to test a new one)
npx supabase stop
```

`config.toml` disables Auth, Realtime, Edge Functions, Analytics and the local
SMTP server because the app uses none of them; `supabase start` is quicker
that way. The `anon` and `authenticated` roles that the RLS policies name are
part of the database image and exist regardless.

## Verifying state

```bash
npx supabase migration list            # Local vs Remote; a row missing on Remote is pending
npx supabase db push --dry-run         # exactly what the next push would run
npx supabase db diff --linked          # schema differences between migrations and production
                                       # (expect "No schema changes found" after the baseline procedure)
```

Or, read-only in the SQL editor:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
select policyname, cmd, roles from pg_policies where schemaname in ('public', 'storage') order by 1;
```

## CI

`.github/workflows/supabase-migrations.yml` has two jobs.

**validate** (every PR touching `supabase/**`, and every push to `main`):

1. `npm run db:check`: every file in `supabase/migrations/` matches
   `^\d{14}_[a-z0-9_]+\.sql$`, has a real timestamp, is unique, is non-empty,
   parses with the real Postgres grammar (`libpg-query`, a devDependency), and
   contains no explicit `BEGIN`/`COMMIT` or `CREATE INDEX CONCURRENTLY`
   (both break the per-file transaction).
2. `supabase db start`: boots a throwaway Postgres 17 in Docker and applies
   every migration in order. This is the real test.
3. `supabase db lint --local`: Supabase's schema linter against the result.

`supabase db lint` cannot run without a database (`--local`, `--linked` or
`--db-url`), which is why the Docker step exists and why `db:check` is the
quick pre-flight you can run without Docker. The validate job needs no secrets
and runs on forks.

**deploy** (push to `main` or manual "Run workflow", never on PRs): links to
`<project-ref>` and runs `supabase db push --dry-run` then
`supabase db push`. It runs only when both secrets below are present; when
they are not, the validate job prints a notice and the deploy job is skipped
rather than failed. The job is bound to the `production` GitHub environment,
so protection rules (required reviewers, wait timer) can be added in repo
settings if wanted.

### Secrets and variables the operator must add

In the repository settings (Settings → Secrets and variables → Actions):

| Name | Kind | Value |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Secret | A [personal access token](https://supabase.com/dashboard/account/tokens). Supabase's guidance for `link` + `db push`: scope it to this project with **Project Settings**, **API Keys** and **API Key Secrets** read access. |
| `SUPABASE_DB_PASSWORD` | Secret | The project's database password (Dashboard → Project Settings → Database; reset it there if unknown). |
| `SUPABASE_PROJECT_ID` | Env (already in the workflow) | `<project-ref>`. Not a secret; hard-coded in the workflow so a fork cannot redirect the push. |

Order matters on first setup: run the baseline procedure above **before**
adding the secrets, or the first `main` push after merge will run `db push`
with an empty remote history. Thanks to the idempotent baseline that still
converges, but the manual path keeps the history table accurate.
