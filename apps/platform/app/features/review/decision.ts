import type { ReviewView, SessionIdentity } from '@worktandem/browser'

export interface DecisionAttempt {
  companyId: string
  applicationId: string
  companyVersion: string
  sessionId: string
  key: string
  body: {
    outcome: 0 | 1
    applicationVersion: string
    applicantVisibleReason: string | null
    internalNote: string | null
  }
}

export function decisionBlock(review: ReviewView, actor: SessionIdentity): string | null {
  if (!actor.capabilities.includes('platform.companies.review')) return 'This account can read applications, but cannot make review decisions.'
  if (review.applicantAccountId === actor.accountId) return 'An independent reviewer must decide this application. You cannot review your own company.'
  if (review.application.status !== 'Pending') return 'This application has already been decided. Reload the queue for current applications.'
  return null
}

export function createDecision(review: ReviewView, actor: SessionIdentity, outcome: 0 | 1, reason: string, note: string, key: string): DecisionAttempt {
  const blocked = decisionBlock(review, actor)
  if (blocked) throw new Error(blocked)
  const applicantVisibleReason = reason.trim() || null
  const internalNote = note.trim() || null
  if (outcome === 1 && !applicantVisibleReason) throw new Error('Enter a reason the applicant can act on.')
  if ((applicantVisibleReason?.length ?? 0) > 2000 || (internalNote?.length ?? 0) > 2000) throw new Error('Reasons and notes must be 2000 characters or fewer.')
  return {
    companyId: review.application.companyId,
    applicationId: review.application.applicationId,
    companyVersion: review.application.companyVersion,
    sessionId: actor.accountSessionId,
    key,
    body: { outcome, applicationVersion: review.application.applicationVersion, applicantVisibleReason, internalNote },
  }
}

// A fresh Pending read is not proof that a timed-out write failed: keep its replay key.
export function decisionStillUncertain(attempt: DecisionAttempt, current: ReviewView): boolean {
  if (current.application.companyId !== attempt.companyId) throw new Error('Unexpected company in status response.')
  return current.application.status === 'Pending' &&
    current.application.applicationId === attempt.applicationId &&
    current.application.companyVersion === attempt.companyVersion &&
    current.application.applicationVersion === attempt.body.applicationVersion
}

export function reviewError(status: number, code: string): string {
  if (status === 401) return 'Your session has ended or been revoked. Choose an account or sign in again.'
  if (status === 403) return code === 'self_review_denied'
    ? 'An independent reviewer must decide this application.'
    : 'Review access is unavailable. Your permission may have changed, or fresh Google MFA is required.'
  if (status === 409 || status === 412) return 'The application changed or another reviewer decided it. Reload the queue and review the current version.'
  if (status === 404) return 'This application is no longer available. Reload the queue.'
  if (status === 429) return 'Too many requests. Wait before trying again.'
  if (status === 503 || status === 502 || status === 504) return 'The review service is unavailable. A submitted decision may still have completed; retry the same decision to resolve its outcome.'
  return 'The request could not be completed. Reload the current application before starting a new decision.'
}
