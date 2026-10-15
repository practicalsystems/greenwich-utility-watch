import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeById, verifySubscriberToken } from '@/lib/subscribers'

/**
 * RFC 8058 one-click unsubscribe target (List-Unsubscribe-Post). Mail clients
 * POST here without showing a page. GET redirects to the human page.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const id = token ? await verifySubscriberToken(token, 'unsubscribe') : null
  if (!id) return NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  await unsubscribeById(id)
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const url = new URL('/subscribe/unsubscribe', request.nextUrl.origin)
  const token = request.nextUrl.searchParams.get('token')
  if (token) url.searchParams.set('token', token)
  return NextResponse.redirect(url, 302)
}
