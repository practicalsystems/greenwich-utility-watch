import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { validateSubmission } from '@/lib/validate'
import { validateFilesBatch } from '@/lib/fileQuarantine'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { notifyNewSubmission, notifyServerError } from '@/lib/notify'
import { shouldAutoApprove } from '@/lib/autoApprove'
import { checkContent } from '@/lib/contentCheck'
import { sendPendingAlert } from '@/lib/email'
import { getAlertSettings } from '@/lib/alertSettings'
import { getImageModerationProvider, moderateImages, type ModerationImage } from '@/lib/imageModeration'

/** PostgREST / Postgres "column does not exist": migration 20261015140000 not applied yet. */
const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703'])

export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting ────────────────────────────────────────────────────────
    const ip = getClientIp(request)
    const rateCheck = checkRateLimit(ip)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many submissions. Please try again in ${rateCheck.retryAfterSeconds} seconds.` },
        { status: 429 }
      )
    }

    // ── Parse & validate text fields ─────────────────────────────────────────
    const formData = await request.formData()
    const validation = validateSubmission(formData)
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { data } = validation

    // ── Validate photos (magic-byte quarantine) ───────────────────────────────
    const photoFiles = formData.getAll('photos') as File[]
    const fileCheck = await validateFilesBatch(photoFiles)
    if (!fileCheck.ok) {
      return NextResponse.json({ error: fileCheck.error }, { status: 400 })
    }

    // ── Upload validated photos to storage ────────────────────────────────────
    const supabase = createServerClient()
    const photoUrls: string[] = []
    const storedPhotos: ModerationImage[] = []

    for (const { buffer, mimeType, ext } of fileCheck.validated) {
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('submission-photos')
        .upload(fileName, buffer, {
          contentType: mimeType, // use validated MIME, not the user-supplied one
          upsert: false,
        })

      if (!uploadError && uploadData) {
        const {
          data: { publicUrl },
        } = supabase.storage.from('submission-photos').getPublicUrl(uploadData.path)
        photoUrls.push(publicUrl)
        storedPhotos.push({ buffer, mimeType })
      }
    }

    // ── Content moderation ─────────────────────────────────────────────────────
    const contentCheck = checkContent({ description: data.description, address: data.address })
    if (contentCheck.flagged) {
      console.warn('Content flagged for review:', contentCheck.flaggedFields.join(', '))
    }

    // ── Image moderation ───────────────────────────────────────────────────────
    // Every stored photo must pass before the submission can auto-publish.
    // No provider, a provider error, a timeout or a flagged photo all queue
    // the submission for human review; nothing is auto-rejected.
    const moderation = await moderateImages(storedPhotos, getImageModerationProvider())
    if (!moderation.passed) {
      console.warn('[moderation] queued for review:', moderation.reasons.join('; '))
    }

    // ── Determine approval status ──────────────────────────────────────────────
    const approvalResult = shouldAutoApprove(data, photoUrls.length)
    const pendingReasons = [
      ...approvalResult.reasons,
      ...(contentCheck.flagged ? ['Content flagged for review'] : []),
      ...moderation.reasons,
    ]
    const autoApproved = approvalResult.approved && !contentCheck.flagged && moderation.passed
    const status = autoApproved ? 'approved' : 'pending'

    // ── Persist to database ───────────────────────────────────────────────────
    const row = {
      address: data.address,
      description: data.description,
      cross_streets: data.cross_streets,
      pole_id: data.pole_id,
      latitude: data.latitude,
      longitude: data.longitude,
      problem_type: data.problem_type,
      duration: data.duration,
      submitter_name: data.submitter_name,
      submitter_email: data.submitter_email,
      photos: photoUrls,
      status,
    }
    let insertResult = await supabase
      .from('submissions')
      .insert({ ...row, review_reasons: status === 'pending' ? pendingReasons : null })
      .select('id')
      .single()
    if (insertResult.error && MISSING_COLUMN_CODES.has(insertResult.error.code)) {
      // Deploy-order safety: the code can land before migration 20261015140000.
      console.warn('[submissions] review_reasons column missing; apply migration 20261015140000. Inserting without it.')
      insertResult = await supabase.from('submissions').insert(row).select('id').single()
    }
    const { data: inserted, error: dbError } = insertResult

    if (dbError) {
      console.error('DB insert error:', dbError)
      notifyServerError('POST /api/submissions (db insert)', dbError)
      return NextResponse.json({ error: 'Could not save submission. Please try again.' }, { status: 500 })
    }

    // Fire-and-forget — don't let a slow webhook or email delay the response
    notifyNewSubmission({
      address: data.address,
      description: data.description,
      problemType: data.problem_type,
      photoCount: photoUrls.length,
    })

    // ── Email alert for pending submissions ───────────────────────────────────
    if (status === 'pending') {
      getAlertSettings().then((settings) => {
        if (settings.alertEmail && settings.alertOnPending) {
          sendPendingAlert(settings.alertEmail, {
            id: inserted.id,
            address: data.address,
            description: data.description,
            problemType: data.problem_type,
            photoCount: photoUrls.length,
            reasons: pendingReasons,
          })
        }
      })
    }

    return NextResponse.json({ success: true, status, id: inserted.id })
  } catch (err) {
    console.error('Submission error:', err)
    notifyServerError('POST /api/submissions', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
