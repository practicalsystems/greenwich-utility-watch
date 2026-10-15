import { createServerClient } from '@/lib/supabase'
import AdminDashboard from '@/components/AdminDashboard'
import type { Submission } from '@/lib/supabase'
import { sanitizePhotoUrls } from '@/lib/validate'
import { countActiveSubscribers } from '@/lib/subscribers'
import { listDrafts } from '@/lib/draftsQueue'

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  const supabase = createServerClient()

  const { data: submissions } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false })

  const subscriberCount = await countActiveSubscribers().catch(() => 0)
  const drafts = await listDrafts().catch(() => [])

  const safeSubmissions = (submissions ?? []).map((s) => ({
    ...s,
    photos: sanitizePhotoUrls(s.photos ?? []),
  }))

  return (
    <AdminDashboard
      initialSubmissions={safeSubmissions as Submission[]}
      subscriberCount={subscriberCount}
      drafts={drafts.map((d) => ({ id: d.id, month: d.month, channel: d.channel, status: d.status, url: (d.result?.url as string | undefined) ?? null, error: d.error }))}
    />
  )
}
