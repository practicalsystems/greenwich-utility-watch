/**
 * Signed tokens for one-tap approve/reject from email links.
 *
 * Thin wrapper over lib/signedToken.ts (HMAC-SHA256 with ADMIN_SECRET).
 * Tokens encode a submission ID, an action (approve/reject), and an expiry.
 */

import { signToken, verifyToken, type SignedPayload } from '@/lib/signedToken'

const TOKEN_MAX_AGE_MS = 72 * 60 * 60 * 1000 // 72 hours

type QuickAction = 'approve' | 'reject'

interface TokenPayload extends SignedPayload {
  id: string
  action: QuickAction
  exp: number
}

function isQuickActionPayload(p: unknown): p is TokenPayload {
  if (!p || typeof p !== 'object') return false
  const o = p as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    (o.action === 'approve' || o.action === 'reject') &&
    typeof o.exp === 'number' &&
    // Reject payloads from other token families that happen to carry id/action.
    !('kind' in o)
  )
}

/**
 * Create a signed quick-action URL for a submission.
 * Returns the full URL path (append to site URL).
 */
export async function createQuickActionUrl(
  submissionId: string,
  action: QuickAction
): Promise<string> {
  const token = await signToken<TokenPayload>({
    id: submissionId,
    action,
    exp: Date.now() + TOKEN_MAX_AGE_MS,
  })
  return `/api/submissions/${submissionId}/quick-action?token=${encodeURIComponent(token)}`
}

/**
 * Validate a quick-action token. Returns the payload if valid, null otherwise.
 */
export async function validateQuickActionToken(token: string): Promise<TokenPayload | null> {
  return verifyToken<TokenPayload>(token, isQuickActionPayload)
}
