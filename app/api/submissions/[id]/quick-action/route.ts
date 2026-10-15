import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { validateQuickActionToken } from '@/lib/quickActionToken'
import { isValidUUID } from '@/lib/validate'
import { loadApprovedReport } from '@/lib/publicData'
import { notifyPoleWatchers } from '@/lib/subscribers'

/**
 * GET: Render a confirmation page. Email link scanners hit GET URLs,
 * so this step prevents automated approve/reject from security bots.
 *
 * POST: Actually perform the approve/reject after the admin confirms.
 */

function htmlPage(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${title} — Greenwich Utility Watch</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
        .card { background: white; border-radius: 16px; padding: 32px; max-width: 420px; width: 100%; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
        h1 { font-size: 20px; color: #1e293b; margin: 0 0 8px; }
        p { color: #64748b; font-size: 14px; margin: 8px 0; }
        .btn { display: inline-block; padding: 10px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none; border: none; cursor: pointer; margin: 4px; }
        .btn-approve { background: #16a34a; color: white; }
        .btn-reject { background: #dc2626; color: white; }
        .btn-cancel { background: #e2e8f0; color: #475569; }
        .btn:hover { opacity: 0.9; }
        form { display: inline; }
      </style>
    </head>
    <body><div class="card">${body}</div></body>
    </html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('token')

  if (!token || !isValidUUID(id)) {
    return htmlPage('Invalid Link', '<h1>Invalid link</h1><p>This link is malformed or has been tampered with.</p>')
  }

  const payload = await validateQuickActionToken(token)
  if (!payload) {
    return htmlPage('Link Expired', '<h1>This link has expired</h1><p>Quick-action links are valid for 72 hours. Use the admin dashboard to review this submission.</p>')
  }

  if (payload.id !== id) {
    return htmlPage('Invalid Link', '<h1>Invalid link</h1><p>Token does not match this submission.</p>')
  }

  // Check if already acted on
  const supabase = createServerClient()
  const { data: submission } = await supabase
    .from('submissions')
    .select('status, address')
    .eq('id', id)
    .single()

  if (!submission) {
    return htmlPage('Not Found', '<h1>Submission not found</h1><p>This submission may have been deleted.</p>')
  }

  if (submission.status !== 'pending') {
    return htmlPage(
      'Already Reviewed',
      `<h1>Already ${submission.status}</h1>
       <p>This submission has already been ${submission.status}.</p>
       <a href="/admin/dashboard" class="btn btn-cancel">Go to Dashboard</a>`
    )
  }

  const location = submission.address || 'GPS location'
  const actionLabel = payload.action === 'approve' ? 'Approve' : 'Reject'
  const actionClass = payload.action === 'approve' ? 'btn-approve' : 'btn-reject'
  const currentUrl = request.nextUrl.pathname + '?' + request.nextUrl.searchParams.toString()

  return htmlPage(
    `Confirm ${actionLabel}`,
    `<h1>${actionLabel} this submission?</h1>
     <p>${location}</p>
     <div style="margin-top: 20px;">
       <form method="POST" action="${currentUrl}">
         <button type="submit" class="btn ${actionClass}">${actionLabel}</button>
       </form>
       <a href="/admin/dashboard" class="btn btn-cancel">Cancel</a>
     </div>`
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get('token')

  if (!token || !isValidUUID(id)) {
    return htmlPage('Error', '<h1>Invalid request</h1>')
  }

  const payload = await validateQuickActionToken(token)
  if (!payload || payload.id !== id) {
    return htmlPage('Error', '<h1>Invalid or expired token</h1><p>Use the admin dashboard instead.</p>')
  }

  const supabase = createServerClient()

  // Idempotent: check current status before updating
  const { data: submission } = await supabase
    .from('submissions')
    .select('status')
    .eq('id', id)
    .single()

  if (!submission) {
    return htmlPage('Not Found', '<h1>Submission not found</h1>')
  }

  if (submission.status !== 'pending') {
    return htmlPage(
      'Already Reviewed',
      `<h1>Already ${submission.status}</h1>
       <p>This submission was already ${submission.status} before your action.</p>
       <a href="/admin/dashboard" class="btn btn-cancel">Go to Dashboard</a>`
    )
  }

  const newStatus = payload.action === 'approve' ? 'approved' : 'rejected'
  const { error } = await supabase
    .from('submissions')
    .update({ status: newStatus })
    .eq('id', id)

  if (error) {
    console.error('Quick action update error:', error)
    return htmlPage('Error', '<h1>Something went wrong</h1><p>Please use the admin dashboard instead.</p>')
  }

  if (newStatus === 'approved') {
    loadApprovedReport(id)
      .then((r) => (r ? notifyPoleWatchers(r, { kind: 'approved' }) : 0))
      .catch((err) => console.error('[quick-action] watcher notify failed:', err))
  }

  console.log(JSON.stringify({
    event: 'quick_action',
    submission_id: id,
    action: payload.action,
    timestamp: new Date().toISOString(),
  }))

  const successColor = payload.action === 'approve' ? '#16a34a' : '#dc2626'
  return htmlPage(
    `Submission ${newStatus}`,
    `<div style="width: 56px; height: 56px; background: ${successColor}15; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
       <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="${successColor}" stroke-width="2">
         <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
       </svg>
     </div>
     <h1>Submission ${newStatus}</h1>
     <a href="/admin/dashboard" class="btn btn-cancel" style="margin-top: 16px;">Go to Dashboard</a>`
  )
}
