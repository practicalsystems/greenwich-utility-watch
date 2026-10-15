import type { Metadata } from 'next'
import Link from 'next/link'
import { verifySubscriberToken } from '@/lib/subscribers'

export const metadata: Metadata = { title: 'Confirm subscription', robots: { index: false } }
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ token?: string; done?: string }> }

const RESULTS: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: 'You are subscribed',
    body: 'You will receive the State of the Poles report on the 1st of each month. Every email has an unsubscribe link.',
  },
  already: { title: 'Already confirmed', body: 'This subscription was already active. Nothing else to do.' },
  not_found: { title: 'Subscription not found', body: 'This link does not match a subscription. It may have been removed.' },
  invalid: {
    title: 'This link is invalid or has expired',
    body: 'Confirmation links are valid for 7 days. Enter your address again to get a new one.',
  },
}

/**
 * GET never changes state. With a valid token it shows a Confirm button that
 * POSTs to /api/subscribe/confirm; with ?done= it shows the result.
 */
export default async function ConfirmPage({ searchParams }: Props) {
  const { token, done } = await searchParams

  if (done) {
    const c = RESULTS[done] ?? RESULTS.invalid
    return <Shell title={c.title} body={c.body} />
  }

  const id = token ? await verifySubscriberToken(token, 'confirm') : null
  if (!id) return <Shell title={RESULTS.invalid.title} body={RESULTS.invalid.body} />

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-3">Confirm your subscription</h1>
      <p className="text-slate-600 mb-8">
        One click and you will receive the monthly State of the Poles report (and any pole updates you asked
        for). Nothing is sent until you confirm.
      </p>
      <form method="POST" action={`/api/subscribe/confirm?token=${encodeURIComponent(token!)}`}>
        <button
          type="submit"
          className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-slate-700 font-medium"
        >
          Confirm subscription
        </button>
      </form>
    </div>
  )
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-3">{title}</h1>
      <p className="text-slate-600 mb-8">{body}</p>
      <Link href="/reports" className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-slate-700 font-medium">
        See the monthly reports
      </Link>
    </div>
  )
}
