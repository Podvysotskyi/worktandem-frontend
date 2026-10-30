<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ApiError, createBrowserClient, errorMessage, type BrowserClient, type ReviewView, type SessionIdentity } from '@worktandem/browser'
import { createDecision, decisionBlock, decisionStillUncertain, reviewError, type DecisionAttempt } from '../features/review/decision'

useHead({ title: 'Company review · Worktandem' })
const actor = ref<SessionIdentity | null>(null)
const queue = ref<ReviewView[]>([])
const detail = ref<ReviewView | null>(null)
const loading = ref(true)
const detailLoading = ref(false)
const saving = ref(false)
const resolving = ref(false)
const uncertain = ref(false)
const freshening = ref(false)
const error = ref('')
const detailError = ref('')
const notice = ref('')
const offset = ref(0)
const filter = ref('')
const outcome = ref<0 | 1 | null>(null)
const reason = ref('')
const note = ref('')
const attempt = ref<DecisionAttempt | null>(null)
const detailHeading = ref<HTMLElement | null>(null)
const reasonInput = ref<HTMLTextAreaElement | null>(null)
const confirmationHeading = ref<HTMLElement | null>(null)
const errorPanel = ref<HTMLElement | null>(null)
const queueElement = ref<HTMLElement | null>(null)
const approveButton = ref<HTMLButtonElement | null>(null)
let client: BrowserClient | null = null
let generation = 0
let detailGeneration = 0
const pageSize = 25
const canRead = computed(() => actor.value?.capabilities.includes('platform.companies.read') ?? false)
const filtered = computed(() => queue.value.filter(item => `${item.application.form.companyName} ${item.applicantAccountId} ${item.application.form.countryCode}`.toLowerCase().includes(filter.value.toLowerCase())))
const blocked = computed(() => detail.value && actor.value ? decisionBlock(detail.value, actor.value) : null)
const selectedApplication = computed(() => detail.value?.application)

function aborted(cause: unknown) { return cause instanceof DOMException && cause.name === 'AbortError' }
function resetReview() {
  detailGeneration++
  detail.value = null; detailError.value = ''; outcome.value = null
  reason.value = ''; note.value = ''; attempt.value = null; uncertain.value = false; detailLoading.value = false
}

function clearDeniedAuthority(cause: unknown) {
  if (!(cause instanceof ApiError) || ![401, 403].includes(cause.status)) return
  queue.value = []; detail.value = null; outcome.value = null; reason.value = ''; note.value = ''
  if (cause.status === 401) {
    actor.value = null
    error.value = `${errorMessage(cause)}${uncertain.value ? ' The earlier decision outcome is still unknown. Check its current status after signing in before making another decision.' : ''}`
  }
}

async function load(page = offset.value) {
  if (!client || saving.value || resolving.value || freshening.value || attempt.value) return
  const request = ++generation
  resetReview(); queue.value = []; error.value = ''; loading.value = true; notice.value = ''; filter.value = ''
  try {
    const context = await client.context()
    if (request !== generation) return
    actor.value = context.selected
    if (!actor.value || !canRead.value) return
    const result = await client.request<ReviewView[]>('organization', `/platform/company-applications?offset=${page}&limit=${pageSize}`)
    if (request !== generation) return
    queue.value = result; offset.value = page
  } catch (cause) {
    if (request !== generation || aborted(cause)) return
    if (cause instanceof ApiError && cause.status === 401) actor.value = null
    error.value = errorMessage(cause)
  } finally { if (request === generation) loading.value = false }
}

async function openReview(companyId: string) {
  if (!client || saving.value || resolving.value || freshening.value || attempt.value) return
  resetReview()
  const request = ++detailGeneration
  detailLoading.value = true; notice.value = ''
  try {
    const result = await client.request<ReviewView>('organization', `/platform/companies/${companyId}/application`)
    if (request !== detailGeneration) return
    detail.value = result
    await nextTick(); detailHeading.value?.focus()
  } catch (cause) {
    if (request !== detailGeneration || aborted(cause)) return
    if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
      queue.value = []
      if (cause.status === 401) actor.value = null
    }
    detailError.value = errorMessage(cause)
  } finally { if (request === detailGeneration) detailLoading.value = false }
}

async function closeReview() {
  if (saving.value || resolving.value || freshening.value || attempt.value) return
  const companyId = detail.value?.application.companyId
  resetReview()
  await nextTick()
  if (companyId) queueElement.value?.querySelector<HTMLButtonElement>(`[data-company="${companyId}"]`)?.focus()
}

async function chooseDecision(value: 0 | 1) {
  if (blocked.value || saving.value || resolving.value || freshening.value || attempt.value) return
  outcome.value = value; detailError.value = ''
  await nextTick()
  if (value === 1) reasonInput.value?.focus()
  else confirmationHeading.value?.focus()
}

async function cancelDecision() {
  if (saving.value || attempt.value) return
  outcome.value = null; reason.value = ''; note.value = ''; detailError.value = ''
  await nextTick(); approveButton.value?.focus()
}

async function decide() {
  if (!client || !detail.value || !actor.value || outcome.value === null || saving.value || resolving.value || freshening.value || attempt.value || blocked.value) return
  try {
    attempt.value = createDecision(detail.value, actor.value, outcome.value, reason.value, note.value, crypto.randomUUID())
  } catch (cause) {
    detailError.value = cause instanceof Error ? cause.message : 'Check the decision details.'
    await nextTick(); errorPanel.value?.focus(); return
  }
  await sendDecision()
}

async function sendDecision() {
  const pending = attempt.value
  if (!client || !pending || saving.value || resolving.value || freshening.value || client.sessionId !== pending.sessionId) return
  saving.value = true; detailError.value = ''
  const request = detailGeneration
  try {
    const result = await client.request('organization', `/platform/companies/${pending.companyId}/applications/${pending.applicationId}/decision`, {
      method: 'POST', body: pending.body,
      headers: { 'If-Match': `"${pending.companyVersion}"`, 'Idempotency-Key': pending.key },
    })
    if (request !== detailGeneration) return
    // The response confirms the operation; its payload is not reused as current authority.
    void result
    attempt.value = null; uncertain.value = false
    saving.value = false
    await load(offset.value)
    notice.value = pending.body.outcome === 0 ? 'Application approved. The applicant can now enter the company workspace.' : 'Application rejected. Your reason is visible to the applicant.'
  } catch (cause) {
    if (request !== detailGeneration || aborted(cause)) return
    detailError.value = cause instanceof ApiError ? reviewError(cause.status, cause.code) : 'The connection was interrupted. The decision may have completed. Retry this same decision to resolve its outcome.'
    if (!(cause instanceof ApiError) || cause.status >= 500) uncertain.value = true
    if (cause instanceof ApiError && cause.status < 500 && !uncertain.value) {
      attempt.value = null
      if ([401, 403, 404, 409, 412].includes(cause.status)) {
        detail.value = null; queue.value = []; outcome.value = null
        reason.value = ''; note.value = ''
        if (cause.status === 401) actor.value = null
      }
    }
    clearDeniedAuthority(cause)
    await nextTick(); errorPanel.value?.focus()
  } finally { saving.value = false }
}

async function resolveDecision() {
  const pending = attempt.value
  if (!client || !pending || saving.value || resolving.value || client.sessionId !== pending.sessionId) return
  resolving.value = true; detailError.value = ''; notice.value = ''
  const request = detailGeneration
  try {
    const current = await client.request<ReviewView>('organization', `/platform/companies/${pending.companyId}/application`)
    if (request !== detailGeneration) return
    const stillUncertain = decisionStillUncertain(pending, current)
    detail.value = current
    if (stillUncertain) {
      detailError.value = 'No completed decision is visible yet. Keep this decision and retry it with the same key. Queue navigation and new decisions remain paused until its outcome is resolved.'
    } else {
      attempt.value = null; uncertain.value = false; outcome.value = null; reason.value = ''; note.value = ''
      queue.value = queue.value.filter(item => item.application.companyId !== pending.companyId)
      notice.value = `The live application status is ${current.application.status}. The previous review snapshot is closed; reload the queue before another decision.`
    }
  } catch (cause) {
    if (request !== detailGeneration || aborted(cause)) return
    detailError.value = `${errorMessage(cause)} The original decision is still retained; its delivery outcome has not been resolved.`
    clearDeniedAuthority(cause)
  } finally { resolving.value = false }
}

async function freshSignIn() {
  if (!client || saving.value || resolving.value || freshening.value || attempt.value) return
  freshening.value = true; error.value = ''
  try { window.location.assign(await client.startLogin('Login', true)) }
  catch (cause) { if (!aborted(cause)) error.value = errorMessage(cause); freshening.value = false }
}

function submitted(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function initialize() {
  client = createBrowserClient()
  client.selectCompany(null)
  void load(0)
}

function pageHide() {
  generation++; resetReview()
  actor.value = null; queue.value = []; error.value = ''; notice.value = ''; filter.value = ''
  loading.value = true; saving.value = false; resolving.value = false; freshening.value = false
  client?.dispose(); client = null
  // Hide synchronously as well as clearing Vue refs before the page can be frozen.
  document.documentElement.style.visibility = 'hidden'
}

async function pageShow(event: PageTransitionEvent) {
  if (!event.persisted) return
  initialize()
  await nextTick()
  document.documentElement.style.removeProperty('visibility')
}

onMounted(() => {
  window.addEventListener('pagehide', pageHide)
  window.addEventListener('pageshow', pageShow)
  initialize()
})
onUnmounted(() => {
  window.removeEventListener('pagehide', pageHide)
  window.removeEventListener('pageshow', pageShow)
  generation++; detailGeneration++; client?.dispose()
})
</script>

<template>
  <div class="platform-shell">
    <a class="skip-link" href="#platform-main">Skip to company review</a>
    <header class="wt-topbar platform-topbar">
      <a class="wt-brand" href="/"><UiBrandMark /> <span>worktandem</span></a>
      <span class="topbar-location">Platform / Operations</span>
      <a class="account-link" href="/accounts">{{ actor?.displayName || 'Choose account' }} <span>Account and sign out ↗</span></a>
    </header>

    <div class="platform-body">
      <nav class="icon-rail" aria-label="Application areas">
        <a href="/accounts" aria-label="Accounts and workspaces" title="Accounts and workspaces">▦</a>
        <a href="/platform/" class="active" aria-label="Company review" aria-current="page" title="Company review">▤</a>
      </nav>
      <aside class="secondary-nav">
        <p class="eyebrow">Operations</p>
        <h2>Companies</h2>
        <a href="/platform/" aria-current="page" class="selected-nav">Review queue</a>
        <p class="nav-explanation">Review submitted companies and activate approved applicants.</p>
        <div class="scope-note"><strong>Platform scope</strong><p>No company selected</p></div>
      </aside>

      <main id="platform-main" class="review-main">
        <div class="review-title"><div><h1>Company review</h1><p class="wt-muted">Pending applications · Oldest first</p></div><button class="wt-secondary" :disabled="loading || saving || resolving || freshening || !!attempt" @click="load()">Refresh queue</button></div>
        <div v-if="notice" class="notice" role="status">{{ notice }}</div>
        <div v-if="error" class="wt-error" role="alert">{{ error }}</div>
        <p v-if="loading" role="status" class="wt-card state-card">Loading current account and applications…</p>
        <section v-else-if="!actor" class="wt-card state-card">
          <h2>Choose your account</h2><p>Company review uses the account selected in this tab.</p><a class="wt-button" href="/accounts">Choose account or sign in</a>
        </section>
        <section v-else-if="!canRead" class="wt-card state-card">
          <h2>Review access is unavailable</h2><p>This account does not have company review access. An authorized platform owner can assign reviewer access.</p><a class="wt-secondary" href="/accounts">Choose another account</a>
        </section>
        <div v-else class="review-columns">
          <section ref="queueElement" class="queue-section" aria-label="Pending application queue">
            <div class="queue-tools"><label class="wt-field"><span>Filter this page</span><input v-model="filter" type="search" placeholder="Company, applicant ID or country" :disabled="saving"></label><span class="pending-filter">Status: Pending</span></div>
            <div class="table-heading"><span class="eyebrow">Applications</span><span>{{ filtered.length }} on this page</span></div>
            <div class="queue-table wt-card">
              <table>
                <caption class="sr-only">Pending company applications, ordered oldest first</caption>
                <thead><tr><th scope="col">Company</th><th scope="col">Applicant ID</th><th scope="col">Country</th><th scope="col">Ver.</th><th scope="col">Submitted</th><th scope="col">State</th></tr></thead>
                <tbody>
                  <tr v-for="item in filtered" :key="item.application.applicationId" :class="{ 'selected-row': detail?.application.companyId === item.application.companyId }">
                    <td><button class="company-button" :data-company="item.application.companyId" :aria-pressed="detail?.application.companyId === item.application.companyId" :disabled="saving || !!attempt" @click="openReview(item.application.companyId)">{{ item.application.form.companyName }}<span>{{ item.application.submissionNumber > 1 ? 'Updated submission' : 'Company application' }}</span></button></td>
                    <td class="account-id" :title="item.applicantAccountId">{{ item.applicantAccountId.slice(0, 8) }}…</td>
                    <td>{{ item.application.form.countryCode }}</td><td>v{{ item.application.submissionNumber }}</td><td>{{ submitted(item.application.submittedAt) }}</td><td><span class="pending-state">● Pending</span></td>
                  </tr>
                  <tr v-if="!filtered.length"><td colspan="6" class="empty-cell">{{ queue.length ? 'No applications match this page filter.' : 'No pending applications on this page.' }}</td></tr>
                </tbody>
              </table>
              <div class="pagination"><span>Page {{ Math.floor(offset / pageSize) + 1 }}</span><div><button :disabled="offset === 0 || saving || resolving || !!attempt" @click="load(Math.max(0, offset - pageSize))">Previous</button><button :disabled="queue.length < pageSize || offset + pageSize > 100000 || saving || resolving || !!attempt" @click="load(offset + pageSize)">Next</button></div></div>
            </div>
            <p class="queue-footnote">A fresh Google sign-in with verified MFA is required for review access.</p>
            <button class="wt-secondary" :disabled="freshening || saving || resolving || !!attempt" @click="freshSignIn">{{ freshening ? 'Opening Google…' : 'Refresh Google verification' }}</button>
          </section>

          <section class="review-detail wt-card" aria-label="Company application detail" :aria-busy="detailLoading || saving || resolving">
            <p v-if="detailLoading" role="status">Loading current application…</p>
            <div v-if="detailError" ref="errorPanel" tabindex="-1" class="wt-error" role="alert">
              {{ detailError }}
              <template v-if="attempt">
                <p>Resolve this decision before leaving the review or starting another one. The original submission and replay key remain in this tab.</p>
                <button class="wt-secondary" :disabled="saving || resolving" @click="sendDecision">Retry same decision</button>
                <button class="wt-secondary" :disabled="saving || resolving" @click="resolveDecision">{{ resolving ? 'Checking status…' : 'Check current status' }}</button>
              </template>
            </div>
            <template v-if="detail && selectedApplication">
              <p class="eyebrow">Reviewing company</p><h2 ref="detailHeading" tabindex="-1">{{ selectedApplication.form.companyName }}</h2><p class="pending-state">● {{ selectedApplication.status }}</p>
              <p class="description">{{ selectedApplication.form.businessDescription }}</p>
              <div class="detail-block"><p class="eyebrow">Applicant account</p><p class="full-account-id">{{ detail.applicantAccountId }}</p><p class="wt-muted">{{ selectedApplication.form.applicantRoleDescription }}</p></div>
              <dl class="detail-facts"><div><dt>Country</dt><dd>{{ selectedApplication.form.countryCode }}</dd></div><div><dt>Website</dt><dd>{{ selectedApplication.form.website || 'Not supplied' }}</dd></div><div><dt>Legal registration ID</dt><dd>{{ selectedApplication.form.legalRegistrationId || 'Not supplied' }}</dd></div></dl>
              <div class="detail-block"><h3>Current review snapshot</h3><dl class="snapshot"><div><dt>Submission</dt><dd>v{{ selectedApplication.submissionNumber }}</dd></div><div><dt>Submitted</dt><dd>{{ submitted(selectedApplication.submittedAt) }}</dd></div><div><dt>Company status</dt><dd>{{ selectedApplication.status }}</dd></div></dl></div>
              <p v-if="detail.internalNote" class="internal-note"><strong>Previous internal note</strong>{{ detail.internalNote }}</p>
              <p v-if="blocked" class="access-message">{{ blocked }}</p>
              <template v-else>
                <p class="wt-muted review-guidance">Decide against this submitted version. A change requires a fresh review.</p>
                <div v-if="outcome === null" class="decision-actions"><button ref="approveButton" class="wt-button" :disabled="saving || freshening" @click="chooseDecision(0)">Approve application…</button><button class="wt-secondary" :disabled="saving || freshening" @click="chooseDecision(1)">Reject…</button></div>
                <form v-else class="decision-form" @submit.prevent="decide">
                  <h3 ref="confirmationHeading" tabindex="-1">{{ outcome === 0 ? 'Approve this application?' : 'Reject this application?' }}</h3>
                  <p class="wt-muted">{{ outcome === 0 ? 'Approval activates the applicant as company owner with workspace access.' : 'The applicant can update and resubmit after reading your reason.' }}</p>
                  <label v-if="outcome === 1" class="wt-field"><span>Reason for the applicant <span aria-hidden="true">*</span></span><textarea ref="reasonInput" v-model="reason" rows="4" maxlength="2000" required :disabled="saving || !!attempt"></textarea></label>
                  <label class="wt-field"><span>Internal note (optional)</span><textarea v-model="note" rows="3" maxlength="2000" :disabled="saving || !!attempt"></textarea><small>Visible to authorized platform reviewers.</small></label>
                  <div class="decision-actions"><button class="wt-button" :disabled="saving || freshening || !!attempt" type="submit">{{ saving ? 'Submitting…' : outcome === 0 ? 'Confirm approval' : 'Confirm rejection' }}</button><button class="wt-secondary" :disabled="saving || !!attempt" type="button" @click="cancelDecision">Cancel</button></div>
                </form>
              </template>
              <button class="close-review" :disabled="saving || !!attempt" @click="closeReview">Close review</button>
            </template>
            <template v-else-if="!detailLoading && !detailError"><p class="eyebrow">Application detail</p><h2>Select a company</h2><p class="wt-muted">Open a pending application to read its submitted details and make a review decision.</p></template>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.platform-shell{min-height:100vh;background:#f0f3f8;color:#19273f;font-family:Inter,Arial,sans-serif;font-size:14px}.platform-topbar{height:64px;display:flex;align-items:center;padding:0 24px;background:#101f36;color:white;gap:44px}.wt-brand{font-size:19px;text-decoration:none;color:white;font-weight:650;display:flex;gap:13px;align-items:center}.topbar-location{color:#b4c1d5;font-size:13px}.account-link{margin-left:auto;color:white;text-align:right;text-decoration:none;font-weight:600}.account-link span{display:block;margin-top:4px;font-weight:400;font-size:11px;color:#b4c1d5}.platform-body{display:grid;grid-template-columns:64px 192px minmax(0,1fr);min-height:calc(100vh - 72px)}.icon-rail{background:#14253e;padding-top:32px;display:flex;align-items:center;flex-direction:column;gap:16px}.icon-rail a{width:46px;height:44px;display:grid;place-items:center;color:#c2cde0;text-decoration:none;font-size:24px;border-radius:3px}.icon-rail .active{background:#263f62;color:white}.secondary-nav{background:#e6edf6;padding:34px 14px 24px 20px;display:flex;flex-direction:column}.eyebrow{text-transform:uppercase;font-size:10px;font-weight:650;color:#506584;letter-spacing:.02em}.secondary-nav h2{font-size:20px;margin:28px 0 20px}.selected-nav{padding:12px;border-left:3px solid #2457d6;background:#eaf0ff;color:#194cd0;text-decoration:none;font-weight:600}.nav-explanation{font-size:12px;line-height:1.65;color:#506584;padding:12px}.scope-note{margin-top:auto;color:#506584;font-size:11px}.scope-note p{margin-top:14px}.review-main{padding:32px 28px;min-width:0}.review-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:30px;gap:20px}.review-title h1{font-size:32px;font-weight:650;line-height:1.2;margin:3px 0 9px}.review-title p{font-size:13px}.review-columns{display:grid;grid-template-columns:minmax(500px,1fr) minmax(350px,456px);gap:24px;align-items:start}.queue-tools{display:flex;gap:12px;align-items:end;margin-bottom:24px}.queue-tools label{flex:1}.pending-filter{border:1px solid #d0dbee;background:white;min-height:38px;padding:10px 16px;font-size:12px;white-space:nowrap}.table-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;color:#506584;font-size:11px}.queue-table{padding:0;overflow:auto;border:1px solid #d0dbee;border-radius:3px;background:white}table{border-collapse:collapse;width:100%;text-align:left;font-size:12px}th{background:#e7edf5;color:#506584;padding:15px 12px;font-size:10px;font-weight:600}td{padding:10px 12px;border-bottom:1px solid #d0dbee;vertical-align:middle;line-height:1.7}.selected-row{background:#e9efff}.company-button{border:0;background:transparent;color:#19273f;padding:2px 0;text-align:left;font-size:14px;font-weight:600;cursor:pointer;min-width:125px}.company-button span{display:block;font-size:11px;color:#506584;font-weight:400;margin-top:3px}.selected-row .company-button span{color:#134bd5}.account-id{font-family:ui-monospace,monospace}.pending-state{color:#875200;font-size:12px;white-space:nowrap}.pagination{display:flex;align-items:center;justify-content:space-between;padding:17px 18px;color:#506584;font-size:11px}.pagination div{display:flex;gap:14px}.pagination button{background:transparent;border:0;color:#304c75;cursor:pointer;padding:4px}.pagination button:disabled{color:#8994a7;cursor:default}.empty-cell{text-align:center;padding:42px 20px;color:#506584}.queue-footnote{font-size:11px;color:#506584;line-height:1.6;margin:22px 0 12px}.review-detail{background:white;border:1px solid #d0dbee;border-top:3px solid #2457d6;border-radius:2px;padding:22px 24px;min-height:520px}.review-detail h2{font-size:28px;line-height:1.25;margin:24px 0 12px;font-weight:650}.description{font-size:16px;line-height:1.5;margin:24px 0}.detail-block{border-top:1px solid #d0dbee;padding-top:24px;margin-top:26px}.full-account-id{overflow-wrap:anywhere;font-family:ui-monospace,monospace;font-size:12px;margin-top:12px}.detail-facts{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}.detail-facts div:last-child{grid-column:1/-1}dt{font-size:11px;color:#506584}dd{margin:8px 0 0;font-size:13px;overflow-wrap:anywhere}.detail-facts dt{text-transform:uppercase;font-size:10px}.detail-block h3,.decision-form h3{font-size:15px;font-weight:600;margin:0 0 24px}.snapshot{display:flex;flex-direction:column;gap:19px}.snapshot div{display:flex;justify-content:space-between;align-items:center;gap:20px}.snapshot dd{margin:0;font-weight:600}.review-guidance{border-top:1px solid #d0dbee;padding-top:26px;margin-top:28px;font-size:12px;line-height:1.5}.decision-actions{display:flex;gap:12px;margin-top:20px}.decision-actions>:first-child{flex:1}.decision-form{margin-top:24px;border-top:1px solid #d0dbee;padding-top:24px}.decision-form .wt-field{margin:18px 0}.decision-form h3{margin-bottom:12px}.access-message{border:1px solid #d0dbee;background:#f0f3f8;padding:16px;font-size:12px;line-height:1.5;margin-top:24px}.internal-note{font-size:12px;line-height:1.6;white-space:pre-wrap}.internal-note strong{display:block}.close-review{display:block;border:0;background:none;color:#1d52ce;padding:0;margin-top:22px;font-size:12px;cursor:pointer}.state-card{padding:28px;line-height:1.7;max-width:800px}.state-card h2{font-size:22px;margin-bottom:12px}.state-card .wt-button,.state-card .wt-secondary{margin-top:20px}.notice{padding:16px 20px;border:1px solid #a7cdbb;background:#f0fbf5;color:#22533c;margin-bottom:20px;line-height:1.5}.wt-error{margin-bottom:18px;line-height:1.6}.wt-error button{display:block;margin-top:12px}.skip-link{position:absolute;left:16px;top:-70px;background:white;padding:12px;z-index:10}.skip-link:focus{top:10px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}button:disabled{opacity:.55;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,[tabindex="-1"]:focus-visible{outline:3px solid #648aff;outline-offset:3px}.wt-muted{color:#506584;line-height:1.6}.wt-field{display:flex;flex-direction:column;gap:8px;font-size:12px}.wt-field input,.wt-field textarea{border:1px solid #8190a4;border-radius:2px;background:white;padding:10px 11px;font:inherit;color:#19273f;min-height:38px}.wt-field textarea{resize:vertical}.wt-field small{color:#506584}@media(max-width:1250px){.platform-body{grid-template-columns:56px 162px minmax(0,1fr)}.review-main{padding:28px 20px}.review-columns{grid-template-columns:minmax(420px,1fr) minmax(310px,370px);gap:18px}.review-detail{padding:20px}.review-detail h2{font-size:25px}.topbar-location{display:none}}@media(max-width:1000px){.review-columns{grid-template-columns:1fr}.review-detail{min-height:300px}.platform-body{grid-template-columns:56px minmax(0,1fr)}.secondary-nav{display:none}}
</style>
