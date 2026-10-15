import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/sessions'

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value

  if (!token || !(await verifySessionToken(token))) {
    const loginUrl = new URL('/admin', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/dashboard/:path*'],
}
