'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { format, parseISO, eachDayOfInterval, subDays } from 'date-fns'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { displayLocation, type Submission } from '@/lib/supabase'

type DraftSummary = { id: string; month: string; channel: string; status: string; url: string | null; error: string | null }
type Props = { initialSubmissions: Submission[]; subscriberCount?: number; drafts?: DraftSummary[] }
type Tab = 'pending' | 'approved' | 'rejected' | 'all'

const ITEMS_PER_PAGE = 20

export default function AdminDashboard({ initialSubmissions, subscriberCount = 0, drafts = [] }: Props) {
  const [submissions, setSubmissions] = useState(initialSubmissions)
  const [tab, setTab] = useState<Tab>('pending')
  const [page, setPage] = useState(1)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Submission | null>(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [reportedTo, setReportedTo] = useState('')
  const [reportedAt, setReportedAt] = useState('')
  const [officialResponse, setOfficialResponse] = useState('')
  const [resolvedAt, setResolvedAt] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  // Alert settings
  const [alertEmail, setAlertEmail] = useState('')
  const [alertOnPending, setAlertOnPending] = useState(true)
  const [dailyDigest, setDailyDigest] = useState(true)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const pending = submissions.filter((s) => s.status === 'pending')
  const approved = submissions.filter((s) => s.status === 'approved')
  const rejected = submissions.filter((s) => s.status === 'rejected')

  const tabCounts: Record<Tab, number> = {
    pending: pending.length,
    approved: approved.length,
    rejected: rejected.length,
    all: submissions.length,
  }

  const filtered = tab === 'all' ? submissions : submissions.filter((s) => s.status === tab)
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  // Changing tab also resets pagination. Done in the event handler rather than
  // an effect so the page never renders tab B with tab A's page number.
  const selectTab = (next: Tab) => {
    setTab(next)
    setPage(1)
  }

  // Load alert settings on mount
  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data) {
          setAlertEmail(data.alert_email || '')
          setAlertOnPending(data.alert_on_pending)
          setDailyDigest(data.daily_digest)
          setSettingsLoaded(true)
        }
      })
      .catch(() => setSettingsLoaded(true))
  }, [])

  // Modal: focus trap + Escape key + restore focus on close
  useEffect(() => {
    if (!selected) {
      triggerRef.current?.focus()
      return
    }

    const el = modalRef.current
    if (!el) return

    const FOCUSABLE =
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
    const getFocusables = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))

    // Delay so the modal has rendered its full content
    const frame = requestAnimationFrame(() => {
      getFocusables()[0]?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelected(null)
        setUpdateError(null)
        return
      }
      if (e.key !== 'Tab') return
      const focusables = getFocusables()
      if (!focusables.length) { e.preventDefault(); return }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus() }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selected])

  const openModal = useCallback((sub: Submission, trigger: HTMLElement) => {
    triggerRef.current = trigger
    setSelected(sub)
    setAdminNotes(sub.admin_notes || '')
    setReportedTo(sub.reported_to || '')
    setReportedAt(sub.reported_at || '')
    setOfficialResponse(sub.official_response || '')
    setResolvedAt(sub.resolved_at || '')
    setUpdateError(null)
  }, [])

  const closeModal = useCallback(() => {
    setSelected(null)
    setUpdateError(null)
  }, [])

  const updateStatus = async (
    id: string,
    status: 'approved' | 'rejected' | 'pending',
    notes?: string
  ) => {
    setUpdatingId(id)
    setUpdateError(null)
    try {
      const followUp = {
        reported_to: reportedTo,
        reported_at: reportedAt,
        official_response: officialResponse,
        resolved_at: resolvedAt,
      }
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_notes: notes, ...followUp }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || 'Update failed.')
      }
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status,
                admin_notes: notes ?? null,
                reported_to: followUp.reported_to || null,
                reported_at: followUp.reported_at || null,
                official_response: followUp.official_response || null,
                resolved_at: followUp.resolved_at || null,
              }
            : s
        )
      )
      setSelected(null)
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Could not update submission.')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST' })
    window.location.href = '/admin'
  }

  // Chart: last 30 days
  const chartData = eachDayOfInterval({ start: subDays(new Date(), 29), end: new Date() }).map(
    (day) => {
      const dateStr = format(day, 'yyyy-MM-dd')
      return {
        date: format(day, 'M/d'),
        count: submissions.filter((s) => s.created_at.startsWith(dateStr)).length,
      }
    }
  )

  // Top streets
  const streetCounts: Record<string, number> = {}
  submissions.forEach((s) => { const loc = displayLocation(s); streetCounts[loc] = (streetCounts[loc] || 0) + 1 })
  const topStreets = Object.entries(streetCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4 border-b border-slate-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-lg">Admin Dashboard</h1>
            <p className="text-slate-400 text-xs">
              Greenwich Utility Watch · {subscriberCount} confirmed email subscriber{subscriberCount === 1 ? '' : 's'}
            </p>
          </div>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: submissions.length, color: 'text-slate-900' },
            { label: 'Pending Review', value: pending.length, color: 'text-amber-600' },
            { label: 'Approved', value: approved.length, color: 'text-green-600' },
            { label: 'Rejected', value: rejected.length, color: 'text-red-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide">{stat.label}</p>
              <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Monthly drafts (approval queue). Decisions are taken from the monthly email's one-tap links. */}
        {drafts.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-1 text-sm uppercase tracking-wide">Monthly drafts</h2>
            <p className="text-xs text-slate-500 mb-4">
              Generated on the 1st with the State of the Poles. Approve or skip from the email; links last 7 days.
            </p>
            <table className="w-full text-sm">
              <tbody>
                {drafts.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="py-2 text-slate-700">{d.month}</td>
                    <td className="py-2 text-slate-700 capitalize">{d.channel}</td>
                    <td className="py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        d.status === 'published' ? 'bg-green-100 text-green-800'
                        : d.status === 'approved' ? 'bg-blue-100 text-blue-800'
                        : d.status === 'failed' ? 'bg-red-100 text-red-800'
                        : d.status === 'skipped' ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-800'
                      }`}>{d.status}</span>
                    </td>
                    <td className="py-2 text-xs text-slate-500 truncate max-w-[200px]">
                      {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{d.url}</a> : d.error ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Alert Settings */}
        {settingsLoaded && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">
              Alert Settings
            </h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label htmlFor="alert-email" className="block text-sm font-medium text-slate-700 mb-1">
                  Alert email
                </label>
                <input
                  id="alert-email"
                  type="email"
                  value={alertEmail}
                  onChange={(e) => setAlertEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alertOnPending}
                  onChange={(e) => setAlertOnPending(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-700">Email me when submissions need review</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dailyDigest}
                  onChange={(e) => setDailyDigest(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                />
                <span className="text-sm text-slate-700">Send daily digest at ~8am ET</span>
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setSettingsSaving(true)
                    setSettingsMessage(null)
                    try {
                      const res = await fetch('/api/admin/settings', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          alert_email: alertEmail,
                          alert_on_pending: alertOnPending,
                          daily_digest: dailyDigest,
                        }),
                      })
                      if (!res.ok) {
                        const json = await res.json().catch(() => ({}))
                        throw new Error(json.error || 'Save failed')
                      }
                      setSettingsMessage({ type: 'success', text: 'Settings saved' })
                    } catch (err) {
                      setSettingsMessage({ type: 'error', text: err instanceof Error ? err.message : 'Could not save' })
                    } finally {
                      setSettingsSaving(false)
                    }
                  }}
                  disabled={settingsSaving}
                  className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {settingsSaving ? 'Saving...' : 'Save'}
                </button>
                {settingsMessage && (
                  <span className={`text-sm ${settingsMessage.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                    {settingsMessage.text}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">
              Submissions — Last 30 Days
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={6} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: 'none' }} />
                <Bar dataKey="count" name="Submissions" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-900 mb-4 text-sm uppercase tracking-wide">
              Addresses with Most Reports
            </h2>
            {topStreets.length === 0 ? (
              <p className="text-slate-400 text-sm">No data yet.</p>
            ) : (
              <div className="space-y-3">
                {topStreets.map(([street, count]) => (
                  <div key={street} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 truncate">{street}</div>
                      <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition-all"
                          style={{ width: `${(count / topStreets[0][1]) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-sm font-bold text-slate-900 shrink-0 w-5 text-right">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Submissions list */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
            <h2 className="font-semibold text-slate-900">Submissions</h2>
            <div className="flex flex-wrap gap-2">
              {(['pending', 'approved', 'rejected', 'all'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => selectTab(t)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    tab === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({tabCounts[t]})
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {paginated.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-12">No submissions in this category.</p>
            ) : (
              paginated.map((sub) => (
                <div key={sub.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex gap-4">
                    {sub.photos.length > 0 && (
                      <div className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-slate-100">
                        <Image
                          src={sub.photos[0]}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="56px"
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{displayLocation(sub)}</p>
                          {sub.pole_id && (
                            <p className="text-xs text-slate-400 font-mono">Pole #{sub.pole_id}</p>
                          )}
                        </div>
                        <StatusBadge status={sub.status} />
                      </div>
                      {sub.problem_type && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block mt-1">
                          {sub.problem_type}
                        </p>
                      )}
                      <p className="text-xs text-slate-600 mt-1 line-clamp-2">{sub.description}</p>
                      <div className="flex items-center justify-between mt-2.5 gap-2 flex-wrap">
                        <p className="text-xs text-slate-400">
                          {format(parseISO(sub.created_at), 'MMM d, yyyy h:mm a')}
                          {sub.submitter_name && ` · ${sub.submitter_name}`}
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          <button
                            onClick={(e) => openModal(sub, e.currentTarget)}
                            className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
                          >
                            Review
                          </button>
                          {sub.status !== 'approved' && (
                            <ActionButton color="green" disabled={updatingId === sub.id} onClick={() => updateStatus(sub.id, 'approved')}>
                              Approve
                            </ActionButton>
                          )}
                          {sub.status !== 'rejected' && (
                            <ActionButton color="red" disabled={updatingId === sub.id} onClick={() => updateStatus(sub.id, 'rejected')}>
                              Reject
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Review modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeModal}
          aria-hidden="true"
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
            className="bg-white w-full sm:rounded-2xl sm:max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 id="admin-modal-title" className="font-bold text-slate-900">
                    {displayLocation(selected)}
                  </h2>
                  <StatusBadge status={selected.status} />
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close review modal"
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 text-slate-500"
                >
                  ×
                </button>
              </div>

              {selected.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {selected.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer" className="relative block aspect-square rounded-lg overflow-hidden">
                      <Image
                        src={url}
                        alt={`Photo ${i + 1} of ${selected.photos.length}`}
                        fill
                        className="object-cover hover:opacity-90 transition-opacity"
                        sizes="(max-width: 640px) 33vw, 180px"
                      />
                    </a>
                  ))}
                </div>
              )}

              <dl className="space-y-2 text-sm mb-4">
                {selected.problem_type && (
                  <div className="flex gap-2">
                    <dt className="text-slate-400 w-24 shrink-0">Problem</dt>
                    <dd>{selected.problem_type}</dd>
                  </div>
                )}
                {selected.duration && (
                  <div className="flex gap-2">
                    <dt className="text-slate-400 w-24 shrink-0">Duration</dt>
                    <dd>{selected.duration}</dd>
                  </div>
                )}
                {selected.pole_id && (
                  <div className="flex gap-2">
                    <dt className="text-slate-400 w-24 shrink-0">Pole ID</dt>
                    <dd className="font-mono">#{selected.pole_id}</dd>
                  </div>
                )}
                {selected.cross_streets && (
                  <div className="flex gap-2">
                    <dt className="text-slate-400 w-24 shrink-0">Cross St.</dt>
                    <dd>{selected.cross_streets}</dd>
                  </div>
                )}
                {selected.latitude != null && (
                  <div className="flex gap-2">
                    <dt className="text-slate-400 w-24 shrink-0">GPS</dt>
                    <dd className="font-mono text-xs">
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}&zoom=18`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {selected.latitude}, {selected.longitude} ↗
                      </a>
                    </dd>
                  </div>
                )}
                {selected.submitter_name && (
                  <div className="flex gap-2">
                    <dt className="text-slate-400 w-24 shrink-0">Reporter</dt>
                    <dd>
                      {selected.submitter_name}
                      {selected.submitter_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(selected.submitter_email) && (
                        <a
                          href={`mailto:${encodeURIComponent(selected.submitter_email)}`}
                          className="text-blue-600 ml-1 hover:underline"
                        >
                          {selected.submitter_email}
                        </a>
                      )}
                    </dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-slate-400 w-24 shrink-0">Submitted</dt>
                  <dd>{format(parseISO(selected.created_at), 'MMM d, yyyy h:mm a')}</dd>
                </div>
              </dl>

              <div className="mb-1">
                <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Description</p>
                <p className="text-sm text-slate-800 leading-relaxed">{selected.description}</p>
              </div>

              <div className="mt-4 mb-5">
                <label htmlFor="admin-notes" className="block text-xs text-slate-400 uppercase tracking-wide mb-1.5">
                  Admin Notes (internal only)
                </label>
                <textarea
                  id="admin-notes"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <fieldset className="mb-5 border border-slate-200 rounded-lg p-3">
                <legend className="text-xs text-slate-400 uppercase tracking-wide px-1">
                  Official follow-up (shown publicly)
                </legend>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label className="block">
                    <span className="block text-xs text-slate-500 mb-1">Reported to</span>
                    <select
                      value={reportedTo}
                      onChange={(e) => setReportedTo(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">—</option>
                      {['Eversource', 'Frontier', 'Town of Greenwich', 'PURA', 'Other'].map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-500 mb-1">Reported on</span>
                    <input
                      type="date"
                      value={reportedAt}
                      onChange={(e) => setReportedAt(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block col-span-2">
                    <span className="block text-xs text-slate-500 mb-1">Official response (quote or summary)</span>
                    <textarea
                      value={officialResponse}
                      onChange={(e) => setOfficialResponse(e.target.value)}
                      rows={2}
                      placeholder="e.g. Eversource ticket #… opened; removal scheduled Q1"
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-xs text-slate-500 mb-1">Resolved on</span>
                    <input
                      type="date"
                      value={resolvedAt}
                      onChange={(e) => setResolvedAt(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </label>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => updateStatus(selected.id, selected.status, adminNotes)}
                      disabled={updatingId === selected.id}
                      className="w-full bg-slate-100 text-slate-700 font-medium py-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-50 text-sm"
                    >
                      Save without changing status
                    </button>
                  </div>
                </div>
              </fieldset>

              {updateError && (
                <div role="alert" className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  {updateError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => updateStatus(selected.id, 'approved', adminNotes)}
                  disabled={updatingId === selected.id}
                  className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {updatingId === selected.id ? 'Saving…' : 'Approve'}
                </button>
                <button
                  onClick={() => updateStatus(selected.id, 'rejected', adminNotes)}
                  disabled={updatingId === selected.id}
                  className="flex-1 bg-red-600 text-white font-semibold py-2.5 rounded-xl hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {updatingId === selected.id ? 'Saving…' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  )
}

function ActionButton({
  children, color, disabled, onClick,
}: {
  children: React.ReactNode
  color: 'green' | 'red'
  disabled: boolean
  onClick: () => void
}) {
  const base = 'text-xs px-2.5 py-1 rounded-lg font-medium disabled:opacity-50 transition-colors'
  const colors = color === 'green'
    ? 'bg-green-100 text-green-700 hover:bg-green-200'
    : 'bg-red-100 text-red-700 hover:bg-red-200'
  return (
    <button className={`${base} ${colors}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )
}
