#!/usr/bin/env node
/**
 * Validate supabase/migrations without a database.
 *
 * Checks, in order:
 *   1. Every file in supabase/migrations matches ^\d{14}_[a-z0-9_]+\.sql$
 *      (the Supabase CLI only picks up files named <14-digit timestamp>_<name>.sql;
 *      anything else is silently ignored by `db push`, which is worse than failing).
 *   2. The 14-digit prefix is a real UTC timestamp (YYYYMMDDHHMMSS) and is unique.
 *   3. Each file is non-empty and parses with the real Postgres grammar
 *      (libpg-query, the Postgres parser compiled to WebAssembly).
 *   4. No statement would break the transaction the CLI wraps each migration in:
 *      explicit BEGIN/COMMIT/ROLLBACK, or CREATE INDEX CONCURRENTLY.
 *
 * Exit codes: 0 all good, 1 at least one problem, 2 could not run (libpg-query
 * missing, run `npm ci`).
 *
 * Usage: npm run db:check   (or: node scripts/check-migrations.mjs)
 *
 * This is the fast, Docker-free half of CI. The other half
 * (.github/workflows/supabase-migrations.yml) applies the migrations to a real
 * Postgres 17 via `supabase db start` and runs `supabase db lint --local`.
 */

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations')
const NAME_PATTERN = /^(\d{14})_([a-z0-9_]+)\.sql$/

let parse
try {
  ;({ parse } = await import('libpg-query'))
} catch (err) {
  console.error('check-migrations: cannot load libpg-query (a devDependency).')
  console.error('  Fix: npm ci   (or: npm install)')
  console.error(`  Underlying error: ${err.message}`)
  process.exit(2)
}

const problems = []
const seenProblems = new Set()
const report = (file, message) => {
  const line = `${file}: ${message}`
  if (seenProblems.has(line)) return
  seenProblems.add(line)
  problems.push(line)
}

/** True if YYYYMMDDHHMMSS denotes a real UTC instant. */
function isValidTimestamp(ts) {
  const y = +ts.slice(0, 4), mo = +ts.slice(4, 6), d = +ts.slice(6, 8)
  const h = +ts.slice(8, 10), mi = +ts.slice(10, 12), s = +ts.slice(12, 14)
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  return (
    y >= 2000 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    h < 24 && mi < 60 && s < 60
  )
}

/** Walk a parse tree and call visit(nodeTypeName, node) for every node. */
function walk(node, visit) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && /^[A-Z]/.test(key)) {
      visit(key, value)
    }
    walk(value, visit)
  }
}

let entries
try {
  entries = (await readdir(migrationsDir, { withFileTypes: true })).filter((e) => e.isFile())
} catch (err) {
  console.error(`check-migrations: cannot read ${migrationsDir}: ${err.message}`)
  process.exit(2)
}

if (entries.length === 0) {
  console.error(`check-migrations: ${path.relative(repoRoot, migrationsDir)} is empty`)
  process.exit(1)
}

const seenTimestamps = new Map()
const summary = []

for (const entry of entries.map((e) => e.name).sort()) {
  const match = NAME_PATTERN.exec(entry)
  if (!match) {
    report(entry, 'name must match ^\\d{14}_[a-z0-9_]+\\.sql$ (e.g. 20261014000000_add_thing.sql); the CLI ignores anything else')
    continue
  }
  const [, timestamp] = match
  if (!isValidTimestamp(timestamp)) {
    report(entry, `prefix ${timestamp} is not a valid YYYYMMDDHHMMSS timestamp`)
  }
  if (seenTimestamps.has(timestamp)) {
    report(entry, `duplicate timestamp ${timestamp} (also used by ${seenTimestamps.get(timestamp)}); migration order would be ambiguous`)
  } else {
    seenTimestamps.set(timestamp, entry)
  }

  const sql = await readFile(path.join(migrationsDir, entry), 'utf8')
  if (sql.trim().length === 0) {
    report(entry, 'file is empty')
    continue
  }
  if (sql.includes('\r')) {
    report(entry, 'contains CRLF line endings; use LF')
  }

  let tree
  try {
    tree = await parse(sql)
  } catch (err) {
    const where = err.sqlDetails?.cursorPosition
      ? ` (at character ${err.sqlDetails.cursorPosition})`
      : ''
    report(entry, `does not parse as Postgres SQL${where}: ${err.message}`)
    continue
  }

  const statementCount = tree.stmts?.length ?? 0
  if (statementCount === 0) {
    report(entry, 'contains no SQL statements (comments only)')
  }

  walk(tree, (type, node) => {
    if (type === 'TransactionStmt') {
      report(entry, 'contains an explicit BEGIN/COMMIT/ROLLBACK; the CLI already wraps each migration in a transaction')
    }
    if (type === 'IndexStmt' && node.concurrent === true) {
      report(entry, 'uses CREATE INDEX CONCURRENTLY, which cannot run inside the migration transaction')
    }
  })

  const failed = problems.some((p) => p.startsWith(`${entry}: `))
  summary.push(`  ${failed ? 'FAIL' : 'ok  '}  ${entry}  (${statementCount} statement${statementCount === 1 ? '' : 's'})`)
}

console.log(`check-migrations: ${entries.length} file${entries.length === 1 ? '' : 's'} in ${path.relative(repoRoot, migrationsDir)}`)
for (const line of summary) console.log(line)

if (problems.length > 0) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  FAIL  ${p}`)
  process.exit(1)
}

console.log('\nAll migrations look good.')
