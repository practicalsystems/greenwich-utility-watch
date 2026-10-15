/**
 * Content moderation for public-facing submission text.
 *
 * Uses the obscenity package as a baseline word-list filter.
 * Flagged submissions are NOT rejected — they skip auto-approval
 * and go to the manual review queue instead.
 *
 * OpenAI moderation API can be layered on top later by extending
 * the checkContent function and ContentCheckResult type.
 */

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity'

export interface ContentCheckResult {
  flagged: boolean
  /** Which fields triggered the flag (e.g. ['description']). Empty if clean. */
  flaggedFields: string[]
}

// Singleton — instantiated once on cold start, reused across requests
const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
})

/**
 * Check public-facing text fields for profanity or inappropriate content.
 * Only checks fields that appear in the public gallery.
 */
export function checkContent(fields: {
  description: string
  address?: string | null
}): ContentCheckResult {
  const flaggedFields: string[] = []

  if (matcher.hasMatch(fields.description)) {
    flaggedFields.push('description')
  }

  if (fields.address && matcher.hasMatch(fields.address)) {
    flaggedFields.push('address')
  }

  return { flagged: flaggedFields.length > 0, flaggedFields }
}
