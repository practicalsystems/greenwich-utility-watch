import Link from 'next/link'
import { createServerClient } from '@/lib/supabase'
import DashboardMapLoader from '@/components/DashboardMapLoader'
import { TimelineChart, TypeChart } from '@/components/DashboardCharts'
import type { MapReport } from '@/components/DashboardMap'
import type { MonthlyBucket, TypeCount } from '@/components/DashboardCharts'

export const revalidate = 60

type Submission = {
  id: string
  created_at: string
  address: string
  problem_type: string | null
  latitude: number | null
  longitude: number | null
  status: string
}

export default async function DashboardPage() {
  const supabase = createServerClient()

  // Fetch approved submissions for stats + map
  const { data: approved } = await supabase
    .from('submissions')
    .select('id, created_at, address, problem_type, latitude, longitude, status')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  // Fetch pending count separately
  const { count: pendingCount } = await supabase
    .from('submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  const submissions = (approved ?? []) as Submission[]
  const pending = pendingCount ?? 0

  // Reduce to summary objects — raw rows are NOT passed to client components
  const mapReports: MapReport[] = submissions
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      id: s.id,
      latitude: s.latitude!,
      longitude: s.longitude!,
      address: s.address,
      problem_type: s.problem_type,
      created_at: s.created_at,
    }))

  // Reports by month
  const monthMap = new Map<string, number>()
  for (const s of submissions) {
    const d = new Date(s.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
  }
  const monthlyData: MonthlyBucket[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))

  // Reports by problem type. Older reports predate the problem_type field, so
  // "Most Common" is computed over categorized reports only; uncategorized
  // reports still appear in the chart under an explicit label.
  const typeMap = new Map<string, number>()
  for (const s of submissions) {
    const t = s.problem_type ?? 'Not categorized (older reports)'
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1)
  }
  const typeData: TypeCount[] = Array.from(typeMap.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([type, count]) => ({ type, count }))
  const mostCommonType =
    typeData.find((t) => t.type !== 'Not categorized (older reports)')?.type ?? 'N/A'

  // Average days pending
  const { data: pendingRows } = await supabase
    .from('submissions')
    .select('created_at')
    .eq('status', 'pending')

  // Server Component rendered once per ISR revalidation; not a client re-render.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  let avgDaysPending = 0
  if (pendingRows && pendingRows.length > 0) {
    const totalMs = pendingRows.reduce(
      (sum, r) => sum + (now - new Date(r.created_at).getTime()),
      0
    )
    avgDaysPending = Math.round(totalMs / pendingRows.length / (1000 * 60 * 60 * 24))
  }

  const totalApproved = submissions.length
  const mappedCount = mapReports.length

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Impact Dashboard</h1>
          <p className="text-slate-300">
            Community-reported utility pole concerns in Greenwich, CT.
            Data from{' '}
            <span className="text-amber-400 font-semibold">
              {totalApproved} verified report{totalApproved !== 1 ? 's' : ''}
            </span>
            . Monthly summary:{' '}
            <Link href="/reports" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
              State of the Poles
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Reports" value={totalApproved} />
          <StatCard label="Pending Review" value={pending} accent={pending > 0} />
          <StatCard
            label="Avg. Wait (days)"
            value={pending > 0 ? avgDaysPending : 0}
            accent={avgDaysPending > 30}
          />
          <StatCard label="Most Common" value={mostCommonType} small />
        </div>

        {/* Map */}
        <div>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Report Map</h2>
          {mappedCount < totalApproved && (
            <p className="text-sm text-slate-500 mb-2">
              {mappedCount} of {totalApproved} reports mapped.
              {mappedCount < totalApproved &&
                ' Some older reports are pending geocoding.'}
            </p>
          )}
          <DashboardMapLoader reports={mapReports} />
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-8">
          {monthlyData.length > 0 && <TimelineChart data={monthlyData} />}
          {typeData.length > 0 && <TypeChart data={typeData} />}
        </div>

        {/* CTA */}
        <div className="text-center py-6 border-t border-slate-200">
          <p className="text-slate-600 mb-3">
            Data from {totalApproved} community reports. Help document the problem.
          </p>
          <Link
            href="/"
            className="inline-block bg-amber-500 text-white font-semibold px-6 py-3 rounded-lg hover:bg-amber-600 transition-colors"
          >
            Submit a Report
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  small,
}: {
  label: string
  value: string | number
  accent?: boolean
  small?: boolean
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 text-center">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`font-bold ${
          small ? 'text-sm' : 'text-2xl'
        } ${accent ? 'text-amber-600' : 'text-slate-900'}`}
      >
        {value}
      </div>
    </div>
  )
}
