/**
 * Auto-approval logic for submissions.
 *
 * Submissions that meet all quality thresholds are approved instantly
 * so users see their contribution in the gallery right away.
 * Submissions that miss any threshold go to the manual review queue.
 */

import type { SanitizedSubmission } from '@/lib/validate'

const MIN_DESCRIPTION_LENGTH = 20

const KNOWN_PROBLEM_TYPES = new Set([
  'Double Poles / Sistered Pole',
  'Leaning or Unstable Pole',
  'Low-Hanging Wires',
  'Pole in Sidewalk or Right-of-Way',
  'Damaged Equipment',
])

export interface AutoApproveResult {
  approved: boolean
  reasons: string[]
}

/**
 * Determine whether a submission qualifies for auto-approval.
 *
 * Criteria — ALL must be true:
 *   1. At least one photo uploaded
 *   2. GPS coordinates present (already bounds-checked by validation)
 *   3. A recognized problem type (not "Other" or empty)
 *   4. Description is substantive (>= 20 chars)
 *
 * Returns which criteria failed so emails can explain WHY a submission needs review.
 */
export function shouldAutoApprove(
  data: SanitizedSubmission,
  photoCount: number
): AutoApproveResult {
  const reasons: string[] = []

  if (photoCount < 1) reasons.push('No photo attached')
  if (data.latitude === null || data.longitude === null) reasons.push('No GPS location')
  if (!data.problem_type || !KNOWN_PROBLEM_TYPES.has(data.problem_type)) reasons.push('Problem type needs review')
  if (data.description.length < MIN_DESCRIPTION_LENGTH) reasons.push('Description too short')

  return { approved: reasons.length === 0, reasons }
}
