import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminPassword } from '@/lib/auth'
import { createSessionToken } from '@/lib/sessions'
import { checkLoginRateLimit, getClientIp } from '@/lib/rateLimit'

export async function POST(request: NextRequest) {
  // Rate limit login attempts: 10 per IP per 15 minutes
  const ip = getClientIp(request)
  const rateCheck = checkLoginRateLimit(ip)
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${rateCheck.retryAfterSeconds} seconds.` },
      { status: 429 }
    )
  }

  let password: unknown
  try {
    const body = await request.json()
    password = body?.password
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  let valid: boolean
  try {
    valid = verifyAdminPassword(password)
  } catch (err) {
    console.error('Auth configuration error:', err)
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 })
  }

  if (!valid) {
    return NextResponse.json({ error: 'Invalid password.' }, { status: 401 })
  }

  const token = await createSessionToken()

  const response = NextResponse.json({ success: true })
  response.cookies.set('admin_session', token, {
    httpOnly: true,
    // Secure in all environments except local development
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  })

  return response
}
