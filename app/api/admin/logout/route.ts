import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  // Delete with the same path/sameSite attributes the cookie was set with
  response.cookies.set('admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV !== 'development',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
