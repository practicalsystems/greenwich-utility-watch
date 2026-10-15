/**
 * Read alert settings from the admin_settings table, falling back to env vars.
 * This lets the app work with just ALERT_EMAIL in the env before the
 * admin_settings table is created.
 */

import { createServerClient } from '@/lib/supabase'

export interface AlertSettings {
  alertEmail: string | null
  alertOnPending: boolean
  dailyDigest: boolean
}

export async function getAlertSettings(): Promise<AlertSettings> {
  try {
    const supabase = createServerClient()
    const { data } = await supabase
      .from('admin_settings')
      .select('alert_email, alert_on_pending, daily_digest')
      .limit(1)
      .single()

    if (data) {
      return {
        alertEmail: data.alert_email || process.env.ALERT_EMAIL || null,
        alertOnPending: data.alert_on_pending,
        dailyDigest: data.daily_digest,
      }
    }
  } catch {
    // Table doesn't exist yet, use env var defaults
  }

  return {
    alertEmail: process.env.ALERT_EMAIL || null,
    alertOnPending: true,
    dailyDigest: true,
  }
}
