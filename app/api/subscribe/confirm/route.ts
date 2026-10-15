import { NextRequest, NextResponse } from 'next/server'
import { confirmSubscriber, verifySubscriberToken } from '@/lib/subscribers'

/**
 * POST: perform the confirmation. The landing page (/subscribe/confirm) shows
 * a button that posts here, so link scanners following the GET cannot confirm
 * on the recipient's behalf. Redirects back to the page with the result.
 */
export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const id = token ? await verifySubscriberToken(token, 'confirm') : null
  const result = id ? await confirmSubscriber(id) : 'invalid'
  const url = new URL('/subscribe/confirm', request.nextUrl.origin)
  url.searchParams.set('done', result)
  return NextResponse.redirect(url, 303)
}
