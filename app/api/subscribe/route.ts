import { NextRequest, NextResponse } from 'next/server'
import { checkSubscribeRateLimit, getClientIp } from '@/lib/rateLimit'
import { isValidEmail, isValidUUID } from '@/lib/validate'
import { isEmailConfigured } from '@/lib/emailConfig'
import { subscribe, type SubscribeSource } from '@/lib/subscribers'

const SOURCES = new Set<SubscribeSource>(['site', 'submission', 'reports', 'pole'])

/**
 * POST { email, source?, submission_id? }
 * Starts a double opt-in subscription. The response never reveals whether
 * the address was already known.
 */
export async function POST(request: NextRequest) {
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: 'Email updates are not available yet. Please check back soon.' },
      { status: 503 }
    )
  }

  const ip = getClientIp(request)
  const rate = checkSubscribeRateLimit(ip)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Try again in ${rate.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  const source = SOURCES.has(body.source as SubscribeSource) ? (body.source as SubscribeSource) : 'site'
  const submissionId = typeof body.submission_id === 'string' && isValidUUID(body.submission_id) ? body.submission_id : null

  const outcome = await subscribe({ email, source, submissionId })
  if (outcome === 'error') {
    return NextResponse.json({ error: 'Could not subscribe right now. Please try again later.' }, { status: 500 })
  }
  if (outcome === 'unavailable') {
    return NextResponse.json({ error: 'Email updates are not available yet.' }, { status: 503 })
  }

  // Deliberately not logging the outcome: it would distinguish known addresses.
  console.log(JSON.stringify({ event: 'subscribe', source, watch: Boolean(submissionId), ts: new Date().toISOString() }))

  // Same message for every non-error outcome so addresses cannot be probed.
  return NextResponse.json({
    ok: true,
    message: 'Check your inbox for a confirmation email. Nothing is sent until you confirm.',
  })
}
