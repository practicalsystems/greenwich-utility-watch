import { loadApprovedReports } from '@/lib/publicData'
import { toCsv } from '@/lib/csv'

export const revalidate = 300

const COLUMNS = [
  'id',
  'created_at',
  'age_days',
  'problem_type',
  'duration',
  'address',
  'cross_streets',
  'pole_id',
  'neighborhood',
  'latitude',
  'longitude',
  'description',
  'photo_count',
  'photos',
  'url',
]

export async function GET() {
  const reports = await loadApprovedReports()
  const rows = reports.map((r) => [
    r.id,
    r.created_at,
    r.age_days,
    r.problem_type,
    r.duration,
    r.address,
    r.cross_streets,
    r.pole_id,
    r.neighborhood,
    r.latitude,
    r.longitude,
    r.description,
    r.photos.length,
    r.photos.join(' | '),
    r.url,
  ])
  return new Response(toCsv(COLUMNS, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'inline; filename="greenwich-utility-watch-reports.csv"',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
