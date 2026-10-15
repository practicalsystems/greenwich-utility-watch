import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { verifySessionToken } from '@/lib/sessions'

export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('admin_settings')
    .select('alert_email, alert_on_pending, daily_digest')
    .limit(1)
    .single()

  if (error) {
    // Table might not exist yet, return defaults
    return NextResponse.json({
      alert_email: process.env.ALERT_EMAIL || null,
      alert_on_pending: true,
      daily_digest: true,
    })
  }

  return NextResponse.json({
    alert_email: data.alert_email || process.env.ALERT_EMAIL || null,
    alert_on_pending: data.alert_on_pending,
    daily_digest: data.daily_digest,
  })
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get('admin_session')?.value
  if (!token || !(await verifySessionToken(token))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  // Validate fields
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('alert_email' in body) {
    const email = typeof body.alert_email === 'string' ? body.alert_email.trim() : null
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
    }
    updates.alert_email = email || null
  }

  if ('alert_on_pending' in body) {
    if (typeof body.alert_on_pending !== 'boolean') {
      return NextResponse.json({ error: 'alert_on_pending must be a boolean.' }, { status: 400 })
    }
    updates.alert_on_pending = body.alert_on_pending
  }

  if ('daily_digest' in body) {
    if (typeof body.daily_digest !== 'boolean') {
      return NextResponse.json({ error: 'daily_digest must be a boolean.' }, { status: 400 })
    }
    updates.daily_digest = body.daily_digest
  }

  const supabase = createServerClient()

  // Upsert: update the single row, or insert if table was just created
  const { data: existing } = await supabase
    .from('admin_settings')
    .select('id')
    .limit(1)
    .single()

  if (existing) {
    const { error } = await supabase
      .from('admin_settings')
      .update(updates)
      .eq('id', existing.id)

    if (error) {
      console.error('Settings update error:', error)
      return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 })
    }
  } else {
    const { error } = await supabase
      .from('admin_settings')
      .insert(updates)

    if (error) {
      console.error('Settings insert error:', error)
      return NextResponse.json({ error: 'Could not save settings.' }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
