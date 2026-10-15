import type { Metadata } from 'next'
import Link from 'next/link'
import { unsubscribeById, verifySubscriberToken } from '@/lib/subscribers'

export const metadata: Metadata = { title: 'Unsubscribe', robots: { index: false } }
export const dynamic = 'force-dynamic'

type Props = { searchParams: Promise<{ token?: string }> }

/** One click: landing here is the unsubscribe. No confirmation step by design. */
export default async function UnsubscribePage({ searchParams }: Props) {
  const { token } = await searchParams
  const id = token ? await verifySubscriberToken(token, 'unsubscribe') : null
  const ok = id ? await unsubscribeById(id) : false

  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-3">
        {ok ? 'You are unsubscribed' : 'This link is not valid'}
      </h1>
      <p className="text-slate-600 mb-8">
        {ok
          ? 'That address will receive nothing further from Greenwich Utility Watch. You can subscribe again at any time.'
          : 'The unsubscribe link could not be verified. Reply to any email from us and we will remove you by hand.'}
      </p>
      <Link href="/" className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-slate-700 font-medium">
        Back to the site
      </Link>
    </div>
  )
}
