import { createClient } from '@supabase/supabase-js'

export type Submission = {
  id: string
  created_at: string
  address: string | null
  cross_streets: string | null
  pole_id: string | null
  latitude: number | null
  longitude: number | null
  description: string
  problem_type: string | null
  duration: string | null
  submitter_name: string | null
  submitter_email: string | null
  status: 'pending' | 'approved' | 'rejected'
  admin_notes: string | null
  photos: string[]
  // Official follow-up (public), added by migration 20261015000000; absent until applied.
  reported_to?: string | null
  reported_at?: string | null
  official_response?: string | null
  resolved_at?: string | null
}

/** Format a display-friendly location string for submissions that may lack an address. */
export function displayLocation(s: Pick<Submission, 'address' | 'latitude' | 'longitude'>): string {
  if (s.address) return s.address
  if (s.latitude != null && s.longitude != null)
    return `GPS: ${s.latitude.toFixed(5)}, ${s.longitude.toFixed(5)}`
  return 'Unknown location'
}

export function createBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
