'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { format } from 'date-fns'
import { displayLocation, type Submission } from '@/lib/supabase'

type Props = { submissions: Submission[] }

const ITEMS_PER_PAGE = 12

export default function GalleryView({ submissions }: Props) {
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('')
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever a filter changes
  const updateSearch = (value: string) => { setSearch(value); setPage(1) }
  const updateDateFilter = (value: string) => { setDateFilter(value); setPage(1) }
  const [selected, setSelected] = useState<Submission | null>(null)
  const [selectedPhotoIdx, setSelectedPhotoIdx] = useState(0)
  const modalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const filtered = submissions.filter((s) => {
    const q = search.toLowerCase()
    const matchSearch =
      !search ||
      (s.address ?? '').toLowerCase().includes(q) ||
      (s.cross_streets ?? '').toLowerCase().includes(q) ||
      (s.pole_id ?? '').toLowerCase().includes(q)
    const matchDate = !dateFilter || s.created_at.startsWith(dateFilter)
    return matchSearch && matchDate
  })

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE)
  const paginated = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

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

    const frame = requestAnimationFrame(() => {
      getFocusables()[0]?.focus()
    })

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { setSelected(null); return }
      if (e.key === 'ArrowLeft') { setSelectedPhotoIdx((i) => Math.max(0, i - 1)); return }
      if (e.key === 'ArrowRight' && selected) {
        setSelectedPhotoIdx((i) => Math.min(selected.photos.length - 1, i + 1)); return
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

  const openModal = useCallback((s: Submission, trigger: HTMLElement) => {
    triggerRef.current = trigger
    setSelected(s)
    setSelectedPhotoIdx(0)
  }, [])

  const closeModal = useCallback(() => setSelected(null), [])

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search by street, address, or pole ID…"
            aria-label="Search reports"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="date-filter" className="sr-only">Filter by month</label>
          <input
            id="date-filter"
            type="month"
            value={dateFilter}
            onChange={(e) => updateDateFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {dateFilter && (
            <button onClick={() => updateDateFilter('')} className="text-slate-400 hover:text-slate-600 text-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <svg className="w-12 h-12 mx-auto text-slate-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {submissions.length === 0
            ? 'No approved reports yet. Be the first to submit one.'
            : 'No reports match your search.'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map((s) => (
              <button
                key={s.id}
                onClick={(e) => openModal(s, e.currentTarget)}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden text-left hover:shadow-md hover:border-amber-300 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {s.photos.length > 0 ? (
                  <div className="aspect-video bg-slate-100 relative">
                    <Image
                      src={s.photos[0]}
                      alt={displayLocation(s)}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    {s.photos.length > 1 && (
                      <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                        +{s.photos.length - 1} photo{s.photos.length > 2 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="aspect-video bg-slate-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-slate-900 text-sm leading-snug">{displayLocation(s)}</p>
                    {s.pole_id && (
                      <span className="shrink-0 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                        #{s.pole_id}
                      </span>
                    )}
                  </div>
                  {s.cross_streets && <p className="text-xs text-slate-500 mb-2">{s.cross_streets}</p>}
                  {s.problem_type && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block mb-2">
                      {s.problem_type}
                    </p>
                  )}
                  <p className="text-xs text-slate-600 line-clamp-2">{s.description}</p>
                  <p className="text-xs text-slate-400 mt-2.5">{format(new Date(s.created_at), 'MMM d, yyyy')}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} · {filtered.length} report{filtered.length !== 1 ? 's' : ''}
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
        </>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={closeModal}
          aria-hidden="true"
        >
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-modal-title"
            className="bg-white w-full sm:rounded-2xl sm:max-w-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Photo carousel */}
            {selected.photos.length > 0 && (
              <div className="relative bg-slate-900 sm:rounded-t-2xl overflow-hidden h-72 sm:h-80">
                <Image
                  src={selected.photos[selectedPhotoIdx]}
                  alt={`Photo ${selectedPhotoIdx + 1} of ${selected.photos.length}`}
                  fill
                  className="object-contain"
                  sizes="(max-width: 640px) 100vw, 672px"
                />
                {selected.photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setSelectedPhotoIdx((i) => Math.max(0, i - 1))}
                      disabled={selectedPhotoIdx === 0}
                      aria-label="Previous photo"
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setSelectedPhotoIdx((i) => Math.min(selected.photos.length - 1, i + 1))}
                      disabled={selectedPhotoIdx === selected.photos.length - 1}
                      aria-label="Next photo"
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 text-white rounded-full flex items-center justify-center hover:bg-black/70 disabled:opacity-30"
                    >
                      ›
                    </button>
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5" aria-hidden="true">
                      {selected.photos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setSelectedPhotoIdx(i)}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${i === selectedPhotoIdx ? 'bg-white' : 'bg-white/40'}`}
                          tabIndex={-1}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 id="gallery-modal-title" className="text-xl font-bold text-slate-900 leading-tight">
                    {displayLocation(selected)}
                  </h2>
                  {selected.cross_streets && (
                    <p className="text-slate-500 text-sm mt-0.5">{selected.cross_streets}</p>
                  )}
                </div>
                <button
                  onClick={closeModal}
                  aria-label="Close report details"
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 shrink-0 ml-4 text-slate-500"
                >
                  ×
                </button>
              </div>

              <dl className="grid grid-cols-2 gap-4 mb-4 text-sm">
                {selected.problem_type && (
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Problem Type</dt>
                    <dd className="text-slate-900">{selected.problem_type}</dd>
                  </div>
                )}
                {selected.pole_id && (
                  <div>
                    <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Pole ID</dt>
                    <dd className="font-mono font-medium text-slate-900">#{selected.pole_id}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Reported</dt>
                  <dd className="text-slate-900">{format(new Date(selected.created_at), 'MMMM d, yyyy')}</dd>
                </div>
                {selected.duration && (
                  <div>
                    <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Duration</dt>
                    <dd className="text-slate-900">{selected.duration}</dd>
                  </div>
                )}
                {selected.latitude != null && selected.longitude != null && (
                  <div className="col-span-2">
                    <dt className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">GPS</dt>
                    <dd className="font-mono text-xs text-slate-700 flex items-center gap-2">
                      {selected.latitude}, {selected.longitude}
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${selected.latitude}&mlon=${selected.longitude}&zoom=18`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline font-sans not-italic"
                      >
                        View on map ↗
                      </a>
                    </dd>
                  </div>
                )}
              </dl>

              <p className="mb-4 text-xs">
                <a href={`/poles/${selected.id}`} className="text-amber-700 hover:underline font-medium">
                  Permanent link to this report →
                </a>
              </p>

              <div>
                <dt className="text-xs text-slate-400 uppercase tracking-wide mb-1">Description</dt>
                <p className="text-slate-800 text-sm leading-relaxed">{selected.description}</p>
              </div>

              {selected.photos.length > 1 && (
                <div className="mt-4 grid grid-cols-5 gap-1.5">
                  {selected.photos.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedPhotoIdx(i)}
                      aria-label={`View photo ${i + 1}`}
                      aria-pressed={i === selectedPhotoIdx}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        i === selectedPhotoIdx ? 'border-amber-400' : 'border-transparent'
                      }`}
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
