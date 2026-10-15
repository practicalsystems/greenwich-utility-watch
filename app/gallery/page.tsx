import { createServerClient } from '@/lib/supabase'
import GalleryView from '@/components/GalleryView'
import type { Submission } from '@/lib/supabase'
import { sanitizePhotoUrls } from '@/lib/validate'

export const revalidate = 60

export default async function GalleryPage() {
  const supabase = createServerClient()

  const { data: submissions } = await supabase
    .from('submissions')
    .select('id, created_at, address, cross_streets, pole_id, latitude, longitude, description, problem_type, duration, status, photos')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  // Strip any photo URLs that don't originate from our Supabase storage bucket
  const safeSubmissions = (submissions ?? []).map((s) => ({
    ...s,
    photos: sanitizePhotoUrls(s.photos ?? []),
  }))

  return (
    <div>
      <div className="bg-slate-900 text-white py-10 px-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-2">Public Report Gallery</h1>
          <p className="text-slate-300">
            Community-submitted reports of utility pole concerns in Greenwich, CT.{' '}
            <span className="text-amber-400 font-semibold">
              {submissions?.length ?? 0} report{submissions?.length !== 1 ? 's' : ''}
            </span>{' '}
            on record.
          </p>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <GalleryView submissions={safeSubmissions as Submission[]} />
      </div>
    </div>
  )
}
