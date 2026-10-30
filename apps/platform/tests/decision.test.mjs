import test from 'node:test'
import assert from 'node:assert/strict'
import { createDecision, decisionBlock, decisionStillUncertain, reviewError } from '../app/features/review/decision.ts'

const actor = { accountId: 'reviewer', accountSessionId: 'session-one', capabilities: ['platform.companies.read', 'platform.companies.review'] }
const review = {
  applicantAccountId: 'applicant',
  application: { companyId: 'company', applicationId: 'application', companyVersion: 'company-v1', applicationVersion: 'app-v1', status: 'Pending' },
}

test('decision requires an independent reviewer and current Pending state', () => {
  assert.match(decisionBlock(review, { ...actor, accountId: 'applicant' }), /independent reviewer/)
  assert.match(decisionBlock(review, { ...actor, capabilities: ['platform.companies.read'] }), /cannot make/)
  assert.match(decisionBlock({ ...review, application: { ...review.application, status: 'Approved' } }, actor), /already been decided/)
  assert.equal(decisionBlock(review, actor), null)
})

test('rejection requires bounded applicant-visible reason', () => {
  assert.throws(() => createDecision(review, actor, 1, '  ', '', 'key'), /reason/)
  assert.throws(() => createDecision(review, actor, 1, 'x'.repeat(2001), '', 'key'), /2000/)
  assert.throws(() => createDecision(review, actor, 0, '', 'x'.repeat(2001), 'key'), /2000/)
  assert.deepEqual(createDecision(review, actor, 1, '  Explain eligibility  ', '  Checked documents  ', 'key').body, {
    outcome: 1, applicationVersion: 'app-v1', applicantVisibleReason: 'Explain eligibility', internalNote: 'Checked documents',
  })
})

test('retry snapshot stays bound to original actor, company and both versions', () => {
  const attempt = createDecision(review, actor, 0, '', 'checked', 'original-key')
  const changed = { ...review, application: { ...review.application, companyVersion: 'company-v2' } }
  assert.equal(attempt.companyVersion, 'company-v1')
  assert.equal(attempt.body.applicationVersion, 'app-v1')
  assert.equal(attempt.sessionId, 'session-one')
  assert.equal(attempt.companyId, 'company')
  assert.equal(attempt.applicationId, 'application')
  assert.equal(attempt.key, 'original-key')
  assert.equal(changed.application.companyVersion, 'company-v2')
})

test('errors distinguish stale review, expired session, self-review and uncertain outcome', () => {
  assert.match(reviewError(412, 'company_version_conflict'), /Reload/)
  assert.match(reviewError(401, 'invalid_session'), /session has ended/)
  assert.match(reviewError(403, 'self_review_denied'), /independent/)
  assert.match(reviewError(503, 'organization_unavailable'), /may still have completed/)
})

test('a live unchanged Pending read retains the uncertain decision and original replay key', () => {
  const attempt = createDecision(review, actor, 0, '', 'original note', 'original-key')
  assert.equal(decisionStillUncertain(attempt, review), true)
  assert.equal(attempt.key, 'original-key')
  assert.equal(attempt.body.internalNote, 'original note')
  assert.equal(decisionStillUncertain(attempt, { ...review, application: { ...review.application, status: 'Approved' } }), false)
  assert.equal(decisionStillUncertain(attempt, { ...review, application: { ...review.application, companyVersion: 'later-version', applicationId: 'later-submission' } }), false)
  assert.throws(() => decisionStillUncertain(attempt, { ...review, application: { ...review.application, companyId: 'unrelated-company' } }), /Unexpected company/)
})
