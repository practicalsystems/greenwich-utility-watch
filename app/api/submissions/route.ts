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
      }
    }

    // ── Content moderation ─────────────────────────────────────────────────────
    const contentCheck = checkContent({ description: data.description, address: data.address })
    if (contentCheck.flagged) {
      console.warn('Content flagged for review:', contentCheck.flaggedFields.join(', '))
    }

    // ── Determine approval status ──────────────────────────────────────────────
    const approvalResult = shouldAutoApprove(data, photoUrls.length)
    const pendingReasons = [
      ...approvalResult.reasons,
      ...(contentCheck.flagged ? ['Content flagged for review'] : []),
    ]
    const autoApproved = approvalResult.approved && !contentCheck.flagged
    const status = autoApproved ? 'approved' : 'pending'

    // ── Persist to database ───────────────────────────────────────────────────
    const { data: inserted, error: dbError } = await supabase.from('submissions').insert({
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
    }).select('id').single()

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
