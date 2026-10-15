'use client'

import SubscribeForm from '@/components/SubscribeForm'
import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { searchAddress, reverseGeocode, formatAddress, type GeocodeResult } from '@/lib/geocode'
import { extractExifGps, type ExifGps } from '@/lib/exif'
import { compressImage } from '@/lib/compressImage'

const MapPreview = dynamic(() => import('@/components/MapPreview'), { ssr: false })

type FormState = 'idle' | 'submitting' | 'success' | 'error'
type ApprovalStatus = 'approved' | 'pending'
type GpsStatus = 'idle' | 'loading' | 'done' | 'error'

const PROBLEM_TYPES = [
  { label: 'Double Poles / Sistered Pole', featured: true },
  { label: 'Leaning or Unstable Pole', featured: false },
  { label: 'Low-Hanging Wires', featured: false },
  { label: 'Pole in Sidewalk or Right-of-Way', featured: false },
  { label: 'Damaged Equipment', featured: false },
  { label: 'Other', featured: false },
]

const DURATION_OPTIONS = [
  'Less than a month',
  '1–6 months',
  '6–12 months',
  'More than a year',
  'Unknown',
]

type Props = { emailEnabled?: boolean }

export default function SubmissionForm({ emailEnabled = false }: Props) {
  const [submittedId, setSubmittedId] = useState<string | null>(null)
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [formState, setFormState] = useState<FormState>('idle')
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>('pending')
  const [errorMessage, setErrorMessage] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle')
  const [coords, setCoords] = useState({ lat: '', lng: '' })
  const [problemType, setProblemType] = useState('')
  const [address, setAddress] = useState('')
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [reverseGeocodeFailed, setReverseGeocodeFailed] = useState(false)
  const [photoGps, setPhotoGps] = useState<(ExifGps & { address?: string }) | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length + photos.length > 5) {
      alert('Maximum 5 photos allowed.')
      return
    }
    e.target.value = ''

    // 1. Extract EXIF GPS from originals BEFORE compression (canvas strips EXIF)
    if (!coords.lat && !coords.lng) {
      for (const file of files) {
        const gps = await extractExifGps(file)
        if (gps) {
          const result = await reverseGeocode(gps.lat, gps.lng)
          setPhotoGps({ ...gps, address: result ? formatAddress(result) : undefined })
          break
        }
      }
    }

    // 2. Compress all photos — standardize to JPEG, resize to max 2048px
    const compressed = await Promise.all(files.map((f) => compressImage(f)))

    // 3. Create previews from compressed files and store
    const newPreviews = compressed.map((f) => URL.createObjectURL(f))
    setPhotos((prev) => [...prev, ...compressed])
    setPreviews((prev) => [...prev, ...newPreviews])
  }

  const removePhoto = (index: number) => {
    URL.revokeObjectURL(previews[index])
    setPhotos((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  // Latest-value ref so the async geolocation callback can see the current
  // address without detectGPS depending on it (which would re-run the
  // auto-detect effect on every keystroke). Synced in an effect, not during
  // render, per react-hooks/refs.
  const addressRef = useRef(address)
  useEffect(() => {
    addressRef.current = address
  }, [address])

  const detectGPS = useCallback(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return }
    setGpsStatus('loading')
    setReverseGeocodeFailed(false)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude.toFixed(6)
        const lng = pos.coords.longitude.toFixed(6)
        setCoords({ lat, lng })
        setGpsStatus('done')
        // Fill address from reverse geocoding only if the field is still empty
        if (!addressRef.current.trim()) {
          const result = await reverseGeocode(pos.coords.latitude, pos.coords.longitude)
          if (result) {
            setAddress(formatAddress(result))
          } else {
            setReverseGeocodeFailed(true)
          }
        }
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // Auto-detect GPS if the user previously granted permission
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.permissions?.query({ name: 'geolocation' }).then((result) => {
      if (result.state === 'granted') detectGPS()
    }).catch(() => { /* permissions API unavailable, wait for button press */ })
  }, [detectGPS])

  const handleAddressChange = (value: string) => {
    setAddress(value)
    setShowSuggestions(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    // Skip autocomplete for short inputs or long descriptive text
    if (value.trim().length < 3 || value.trim().length > 60) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      const results = await searchAddress(value)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    }, 400)
  }

  const selectSuggestion = (result: GeocodeResult) => {
    setAddress(formatAddress(result))
    setCoords({
      lat: parseFloat(result.lat).toFixed(6),
      lng: parseFloat(result.lon).toFixed(6),
    })
    setSuggestions([])
    setShowSuggestions(false)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormState('submitting')
    setErrorMessage('')

    const form = e.currentTarget
    const data = new FormData(form)

    photos.forEach((photo) => data.append('photos', photo))
    if (coords.lat) data.set('latitude', coords.lat)
    if (coords.lng) data.set('longitude', coords.lng)
    if (problemType) data.set('problem_type', problemType)

    try {
      const res = await fetch('/api/submissions', { method: 'POST', body: data })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = json.error
          || (res.status === 413 ? 'Upload too large. Try smaller or fewer photos.' : null)
          || `Submission failed (${res.status}). Please try again.`
        throw new Error(detail)
      }
      setApprovalStatus(json.status === 'approved' ? 'approved' : 'pending')
      setSubmittedId(typeof json.id === 'string' ? json.id : null)
      setSubmittedEmail(((data.get('submitter_email') as string | null) ?? '').trim())
      setFormState('success')
      form.reset()
      previews.forEach((p) => URL.revokeObjectURL(p))
      setPhotos([])
      setPreviews([])
      setAddress('')
      setSuggestions([])
      setCoords({ lat: '', lng: '' })
      setGpsStatus('idle')
      setReverseGeocodeFailed(false)
      setPhotoGps(null)
      setProblemType('')
    } catch (err: unknown) {
      setFormState('error')
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setErrorMessage('Network error — check your connection and try again.')
      } else {
        setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred.')
      }
    }
  }

  if (formState === 'success') {
    return (
      <div className="space-y-4">
        {approvalStatus === 'approved' ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Report Published</h2>
            <p className="text-slate-600 mb-4 max-w-sm mx-auto">
              Your report is live in the public gallery. Thank you for helping document utility issues in Greenwich.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="/gallery"
                className="bg-green-600 text-white px-6 py-2.5 rounded-xl hover:bg-green-700 transition-colors font-medium"
              >
                View in Gallery
              </a>
              <button
                onClick={() => setFormState('idle')}
                className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-slate-700 transition-colors font-medium"
              >
                Submit Another Report
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Report Submitted</h2>
            <p className="text-slate-600 mb-2 max-w-sm mx-auto">
              Thank you for your report. It&apos;s been queued for a quick review and should appear in the public gallery within 24 hours.
            </p>
            <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
              Tip: reports with photos, GPS location, and a specific problem type are published instantly.
            </p>
            <button
              onClick={() => setFormState('idle')}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl hover:bg-slate-700 transition-colors font-medium"
            >
              Submit Another Report
            </button>
          </div>
        )}

        {emailEnabled && submittedId && (
          <SubscribeForm
            source="submission"
            submissionId={submittedId}
            defaultEmail={submittedEmail}
            heading="Tell me when this pole changes"
            description="One email if this report is published, gets an official response, or is marked resolved, plus the monthly State of the Poles. Unsubscribe any time."
          />
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3 text-sm">
          <p className="font-semibold text-slate-800">Want to also create an official record?</p>
          <p className="text-slate-700">
            Call Eversource at{' '}
            <a href="tel:18002862000" className="font-semibold text-amber-700 hover:underline">
              1-800-286-2000
            </a>{' '}
            and note the date and the name of the person you spoke with.
          </p>
          <p className="text-slate-600 border-t border-amber-200 pt-3">
            NBC Connecticut is also collecting reports at{' '}
            <a
              href="mailto:shareit@nbcconnecticut.com"
              className="font-medium text-amber-700 hover:underline"
            >
              shareit@nbcconnecticut.com
            </a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
      {/* Section 1: Photos */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <SectionHeader num={1} title="Photos" />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-amber-400 hover:bg-amber-50/50 transition-colors"
        >
          <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium text-slate-600">
            {photos.length === 0 ? 'Tap to add photos' : 'Add more photos'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Up to 5 photos · Photos are automatically compressed</p>
        </button>

        {previews.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob: preview; next/image cannot optimize object URLs */}
                <img src={src} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Location */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <SectionHeader num={2} title="Location" />

        {/* Photo location prompt — shown when EXIF GPS was found in an uploaded photo */}
        {photoGps && !coords.lat && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-800 mb-2">
              {photoGps.address
                ? `This photo was taken near ${photoGps.address}`
                : `This photo has GPS data (${photoGps.lat.toFixed(5)}, ${photoGps.lng.toFixed(5)})`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCoords({ lat: photoGps.lat.toFixed(6), lng: photoGps.lng.toFixed(6) })
                  setGpsStatus('done')
                  if (photoGps.address) setAddress(photoGps.address)
                  setPhotoGps(null)
                }}
                className="text-sm font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Use This Location
              </button>
              <button
                type="button"
                onClick={() => setPhotoGps(null)}
                className="text-sm text-blue-700 hover:text-blue-900 px-3 py-1.5"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* GPS detection — primary action */}
        {gpsStatus === 'idle' && (
          <button
            type="button"
            onClick={detectGPS}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-slate-900 font-bold py-3 px-4 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Use My Current Location
          </button>
        )}

        {gpsStatus === 'loading' && (
          <div className="w-full flex items-center justify-center gap-2 bg-amber-100 text-amber-800 font-medium py-3 px-4 rounded-lg">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Detecting location...
          </div>
        )}

        {gpsStatus === 'done' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-green-800">Location detected</span>
              </div>
              <button
                type="button"
                onClick={detectGPS}
                className="text-xs text-green-700 hover:text-green-900 underline"
              >
                Re-detect
              </button>
            </div>
            <p className="text-xs text-green-700 mt-1 ml-7">{coords.lat}, {coords.lng}</p>
          </div>
        )}

        {gpsStatus === 'error' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700 mb-2">Could not detect location. Please enable location permissions or type an address below.</p>
            <button
              type="button"
              onClick={detectGPS}
              className="text-xs text-red-700 hover:text-red-900 underline"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Map preview — appears once coordinates are available */}
        {coords.lat && coords.lng && !isNaN(parseFloat(coords.lat)) && !isNaN(parseFloat(coords.lng)) && (
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Pin location</p>
            <MapPreview lat={parseFloat(coords.lat)} lng={parseFloat(coords.lng)} />
          </div>
        )}

        {/* Hint when reverse geocoding failed */}
        {reverseGeocodeFailed && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Could not determine the street address. You can type it below or submit with just the GPS pin.
          </p>
        )}

        {/* Address field — auto-filled from GPS/photo or typed manually */}
        <Field
          label="Address"
          hint={gpsStatus === 'done' && address ? 'auto-filled' : 'or type an address / landmark'}
        >
          <div className="relative">
            <input
              type="text"
              name="address"
              value={address}
              onChange={(e) => handleAddressChange(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="e.g. 145 Greenwich Ave, or 'Dunkin' on Post Rd near Cos Cob School'"
              className={inputClass}
              autoComplete="off"
            />
            {showSuggestions && (
              <ul className="absolute top-full left-0 right-0 z-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((s) => (
                  <li key={s.place_id}>
                    <button
                      type="button"
                      onMouseDown={() => selectSuggestion(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <span className="block text-sm font-medium text-slate-900">{formatAddress(s)}</span>
                      <span className="block text-xs text-slate-400 truncate">{s.display_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Field>

        <Field label="Cross Streets" hint="optional">
          <input
            type="text"
            name="cross_streets"
            placeholder="e.g. between Elm St and Oak Ave"
            className={inputClass}
          />
        </Field>

        <Field label="Pole ID Number" hint="tag on the pole, optional">
          <input
            type="text"
            name="pole_id"
            placeholder="e.g. 47291 or CH-4521"
            className={inputClass}
          />
        </Field>
      </section>

      {/* Section 3: Problem Type */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <SectionHeader num={3} title="Problem Type" hint="choose the closest match" />

        <div className="flex flex-wrap gap-2">
          {PROBLEM_TYPES.map(({ label, featured }) => {
            const selected = problemType === label
            return (
              <button
                key={label}
                type="button"
                onClick={() => setProblemType(selected ? '' : label)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
                  selected
                    ? 'bg-amber-500 border-amber-500 text-slate-900'
                    : featured
                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {featured && !selected && <span className="mr-1">★</span>}
                {label}
              </button>
            )
          })}
        </div>
        <input type="hidden" name="problem_type" value={problemType} />
      </section>

      {/* Section 4: Description */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <SectionHeader num={4} title="Tell Us More" />

        <Field label="Describe what you observed" required>
          <textarea
            name="description"
            required
            rows={4}
            placeholder="e.g. leaning pole, damaged hardware, low-hanging wires, contact with trees, unsightly installation, etc."
            className={`${inputClass} resize-none`}
          />
        </Field>

        <Field label="How long has this been here?">
          <select name="duration" className={inputClass}>
            <option value="">— Select one —</option>
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </Field>
      </section>

      {/* Section 5: Contact */}
      <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <SectionHeader num={5} title="Your Info" hint="optional — never shown publicly" />
        <p className="text-xs text-slate-500">Your name and email are never published or shared. We use them only to follow up on this report, or to tell you when it changes if you ask us to.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name">
            <input type="text" name="submitter_name" placeholder="Your name" className={inputClass} />
          </Field>
          <Field label="Email">
            <input type="email" name="submitter_email" placeholder="your@email.com" className={inputClass} />
          </Field>
        </div>
      </section>

      {formState === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={formState === 'submitting'}
        className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-60 text-slate-900 font-bold py-3.5 px-6 rounded-xl text-base transition-colors shadow-sm"
      >
        {formState === 'submitting' ? 'Submitting…' : 'Submit Report'}
      </button>

      <p className="text-xs text-slate-400 text-center pb-2">
        All submissions are reviewed before being published to the public gallery.
      </p>
    </form>
  )
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-colors placeholder:text-slate-400'

function SectionHeader({ num, title, hint }: { num: number; title: string; hint?: string }) {
  return (
    <h2 className="font-semibold text-slate-900 flex items-center gap-2.5">
      <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
        {num}
      </span>
      {title}
      {hint && <span className="text-slate-400 font-normal text-sm">({hint})</span>}
    </h2>
  )
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {hint && <span className="text-slate-400 font-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  )
}
