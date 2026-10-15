import SubmissionForm from '@/components/SubmissionForm'
import SubscribeForm from '@/components/SubscribeForm'
import { isEmailConfigured } from '@/lib/emailConfig'

export default function HomePage() {
  const emailEnabled = isEmailConfigured()
  return (
    <div>
      {/* Hero */}
      <div className="bg-slate-900 text-white py-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-400 text-xs font-semibold px-3 py-1 rounded-full mb-4 border border-amber-500/30">
            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
            Community Reports Open
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-3 leading-tight">
            Report a Utility Pole Concern
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed max-w-2xl">
            Help us document utility poles in Greenwich, CT that look unsafe, unstable, or
            unsightly. Your photos and observations help neighbors and local officials stay informed.
          </p>
          <div className="flex flex-wrap gap-4 mt-6 text-sm text-slate-400">
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Photo evidence
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              GPS location
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              Reviewed before publishing
            </span>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-8">
        <SubmissionForm emailEnabled={emailEnabled} />
        {emailEnabled && <SubscribeForm source="site" />}
      </div>
    </div>
  )
}
