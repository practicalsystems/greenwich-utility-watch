'use client'

import { useState } from 'react'

type Props = {
  source: 'site' | 'submission' | 'reports' | 'pole'
  submissionId?: string | null
  /** Prefill (e.g. the submitter's own address on the confirmation screen). */
  defaultEmail?: string
  heading?: string
  description?: string
  compact?: boolean
}

type State = 'idle' | 'sending' | 'done' | 'error'

/**
 * Minimal email opt-in. Server pages only render it when email is configured
 * (isEmailConfigured), so a 503 here is unexpected and shown plainly.
 */
export default function SubscribeForm({
  source,
  submissionId,
  defaultEmail = '',
  heading = 'Get the monthly State of the Poles',
  description = 'One email on the 1st of each month: how many problem poles are on record, where, and what changed. Unsubscribe any time.',
  compact,
}: Props) {
  const [email, setEmail] = useState(defaultEmail)
  const [state, setState] = useState<State>('idle')
  const [message, setMessage] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('sending')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, submission_id: submissionId ?? undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not subscribe.')
      setMessage(json.message || 'Check your inbox to confirm.')
      setState('done')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not subscribe.')
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-xl ${compact ? 'p-4' : 'p-5'} text-sm text-green-800`}>
        {message}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className={`bg-white border border-slate-200 rounded-xl ${compact ? 'p-4' : 'p-5'} text-sm`}>
      <p className="font-semibold text-slate-800">{heading}</p>
      {!compact && <p className="text-slate-600 mt-1 mb-3">{description}</p>}
      <div className={`flex flex-col sm:flex-row gap-2 ${compact ? 'mt-2' : ''}`}>
        <label className="sr-only" htmlFor={`subscribe-${source}`}>Email address</label>
        <input
          id={`subscribe-${source}`}
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="submit"
          disabled={state === 'sending'}
          className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 font-medium"
        >
          {state === 'sending' ? 'Sending…' : 'Subscribe'}
        </button>
      </div>
      {state === 'error' && (
        <p role="alert" className="text-red-700 mt-2">{message}</p>
      )}
      <p className="text-xs text-slate-400 mt-2">Double opt-in. Your address is never shown publicly or shared.</p>
    </form>
  )
}
