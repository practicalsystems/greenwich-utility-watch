import { NextRequest, NextResponse } from 'next/server'
import { isValidUUID } from '@/lib/validate'
import { decideDraft, getDraft, verifyDraftToken } from '@/lib/draftsQueue'
import { CHANNEL_LABELS } from '@/lib/drafts'

/**
 * One-tap Approve / Skip for a monthly draft, from the drafts email.
 * GET shows the exact text and a confirm button (link scanners cannot act);
 * POST applies the decision and, for Approve, publishes through the channel.
 */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function htmlPage(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} — Greenwich Utility Watch</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
      .card { background: white; border-radius: 16px; padding: 32px; max-width: 560px; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
      h1 { font-size: 20px; color: #1e293b; margin: 0 0 8px; }
      p { color: #64748b; font-size: 14px; margin: 8px 0; }
      pre { white-space: pre-wrap; font-family: inherit; font-size: 14px; color: #334155; background: #f1f5f9; border-radius: 8px; padding: 12px; }
      .btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; margin: 4px 4px 4px 0; }
      .btn-approve { background: #16a34a; color: white; } .btn-skip { background: #dc2626; color: white; } .btn-cancel { background: #e2e8f0; color: #475569; }
      form { display: inline; }
    </style></head>
    <body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

async function resolve(request: NextRequest, id: string) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token || !isValidUUID(id)) return { error: htmlPage('Invalid link', '<h1>Invalid link</h1><p>This link is malformed.</p>', 400) }
  const p = await verifyDraftToken(token)
  if (!p || p.id !== id) return { error: htmlPage('Link expired', '<h1>This link has expired</h1><p>Draft links are valid for 7 days. The admin dashboard lists every draft.</p>', 400) }
  const draft = await getDraft(id)
  if (!draft) return { error: htmlPage('Not found', '<h1>Draft not found</h1>', 404) }
  return { p, draft }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(request, id)
  if ('error' in r) return r.error
  const { p, draft } = r
  if (draft.status === 'published' || draft.status === 'skipped') {
    return htmlPage('Already decided', `<h1>Already ${esc(draft.status)}</h1><p>This ${esc(CHANNEL_LABELS[draft.channel])} for ${esc(draft.month)} was already ${esc(draft.status)}.</p><a href="/admin/dashboard" class="btn btn-cancel">Dashboard</a>`)
  }
  const label = p.action === 'approve' ? 'Approve and publish' : 'Skip this month'
  const cls = p.action === 'approve' ? 'btn-approve' : 'btn-skip'
  const currentUrl = request.nextUrl.pathname + '?' + request.nextUrl.searchParams.toString()
  return htmlPage(
    label,
    `<h1>${esc(label)}: ${esc(CHANNEL_LABELS[draft.channel])}, ${esc(draft.month)}</h1>
     <p>This is the exact text that will be published.</p>
     <pre>${esc(draft.body)}</pre>
     <div style="margin-top: 16px;">
       <form method="POST" action="${esc(currentUrl)}"><button type="submit" class="btn ${cls}">${esc(label)}</button></form>
       <a href="/admin/dashboard" class="btn btn-cancel">Cancel</a>
     </div>`
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resolve(request, id)
  if ('error' in r) return r.error
  const { p, draft } = r
  const out = await decideDraft(id, p.action)
  const label = CHANNEL_LABELS[draft.channel]
  switch (out.kind) {
    case 'published':
      return htmlPage('Published', `<h1>Published</h1><p>${esc(label)} for ${esc(draft.month)} is live.</p><p><a href="${esc(out.url)}">${esc(out.url)}</a></p><a href="/admin/dashboard" class="btn btn-cancel">Dashboard</a>`)
    case 'approved_pending':
      return htmlPage('Approved', `<h1>Approved, waiting for setup</h1><p>${esc(label)} is approved but the channel is not connected yet. Set <strong>${esc(out.missing)}</strong> in Vercel and redeploy; it publishes automatically on the next cron run. Nothing else to do.</p><a href="/admin/dashboard" class="btn btn-cancel">Dashboard</a>`)
    case 'skipped':
      return htmlPage('Skipped', `<h1>Skipped</h1><p>${esc(label)} for ${esc(draft.month)} will not be published.</p><a href="/admin/dashboard" class="btn btn-cancel">Dashboard</a>`)
    case 'failed':
      return htmlPage('Publish failed', `<h1>Publish failed</h1><p>${esc(out.error)}</p><p>The draft is marked failed; approve again from a fresh email, or fix the credentials and let the next cron retry.</p><a href="/admin/dashboard" class="btn btn-cancel">Dashboard</a>`, 502)
    case 'already':
      return htmlPage('Already decided', `<h1>Already ${esc(out.status)}</h1><a href="/admin/dashboard" class="btn btn-cancel">Dashboard</a>`)
    case 'not_found':
      return htmlPage('Not found', '<h1>Draft not found</h1>', 404)
  }
}
