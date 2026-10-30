<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { ApplicationView, BrowserClient, CompanyForm, SessionIdentity } from '@worktandem/browser'
import { aborted, focusProblem, mainClient, problemMessage, usePrivatePageLifecycle } from '../features/browser'
useHead({ title: 'Your company application · Worktandem' })
const selected = ref<SessionIdentity | null>(null), application = ref<ApplicationView | null>(null)
const busy = ref(true), error = ref(''), notice = ref(''), operationId = ref<string | null>(null), editing = ref(false)
const form = reactive<CompanyForm>({ companyName: '', countryCode: '', businessDescription: '', applicantRoleDescription: '', website: '', legalRegistrationId: '' })
const canSubmit = computed(() => !!selected.value && (!application.value || application.value.status === 'Rejected'))
let client: BrowserClient | undefined
let revision = 0
let attempt: { payload: string; key: string } | null = null
onMounted(() => { client = mainClient(); void load() })
onBeforeUnmount(() => { revision++; client?.dispose() })
usePrivatePageLifecycle(() => {
  revision++; client?.dispose(); selected.value = null; application.value = null; operationId.value = null; editing.value = false; attempt = null; notice.value = ''; error.value = ''; busy.value = true
  Object.assign(form, { companyName: '', countryCode: '', businessDescription: '', applicantRoleDescription: '', website: '', legalRegistrationId: '' })
}, async () => { client = mainClient(); await load() })
function populate(value: CompanyForm) { Object.assign(form, value); editing.value = false; attempt = null }
async function load() {
  if (!client) return
  const request = ++revision
  busy.value = true; error.value = ''; selected.value = null; application.value = null; operationId.value = null; editing.value = false; attempt = null
  try {
    const context = await client.context()
    if (request !== revision) return
    selected.value = context.selected
    if (!context.selected) return
    const result = await client.companies()
    if (request !== revision) return
    application.value = result.applications[0] ?? null
    if (application.value) populate(application.value.form)
    else operationId.value = context.selected.initialRegistrationOperationId ?? context.selected.companyCreationOperationId
  } catch (failure) { if (request === revision && !aborted(failure)) { if (!client.sessionId) { selected.value = null; application.value = null }; error.value = problemMessage(failure); focusProblem() } }
  finally { if (request === revision) busy.value = false }
}
function editRejected() { if (application.value?.status === 'Rejected' && !busy.value) editing.value = true }
function cancelEdit() { if (application.value && !busy.value) populate(application.value.form) }
async function beginApplication() {
  if (!client || busy.value || !selected.value || application.value) return
  const request = revision
  busy.value = true; error.value = ''
  try {
    const operation = await client.request<{ operationId: string }>('identity', '/account/company-operation', { method: 'POST' })
    if (request === revision) operationId.value = operation.operationId
  } catch (failure) { if (request === revision && !aborted(failure)) { if (!client.sessionId) { selected.value = null; application.value = null }; error.value = problemMessage(failure); focusProblem() } }
  finally { if (request === revision) busy.value = false }
}
async function submit() {
  if (!client || busy.value || !canSubmit.value || (!application.value && !operationId.value)) return
  const request = revision
  const scope = client.sessionId
  const normalized: CompanyForm = {
    companyName: form.companyName.trim(), countryCode: form.countryCode.trim().toUpperCase(),
    businessDescription: form.businessDescription.trim(), applicantRoleDescription: form.applicantRoleDescription.trim(),
    website: form.website?.trim() || null, legalRegistrationId: form.legalRegistrationId?.trim() || null,
  }
  const body = application.value ? normalized : { operationId: operationId.value, form: normalized }
  const payload = JSON.stringify(body)
  if (!attempt || attempt.payload !== payload) attempt = { payload, key: crypto.randomUUID() }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const current = application.value
    const result = await client.request<ApplicationView>('organization', current ? `/companies/${current.companyId}/applications` : '/companies/applications', {
      method: 'POST', body, headers: { 'Idempotency-Key': attempt.key, ...(current ? { 'If-Match': `"${current.companyVersion}"` } : {}) },
    })
    if (request !== revision || scope !== client.sessionId) return
    application.value = result; populate(result.form)
    notice.value = 'Your company application was submitted. You can return here to check its status.'
  } catch (failure) {
    if (request === revision && scope === client.sessionId && !aborted(failure)) { error.value = problemMessage(failure); focusProblem() }
    else if (!aborted(failure)) { selected.value = null; application.value = null; error.value = problemMessage(failure); focusProblem() }
  } finally { if (request === revision) busy.value = false }
}
function openWorkspace() {
  if (!client || busy.value || application.value?.status !== 'Approved') return
  client.selectCompany(application.value.companyId)
  window.location.assign('/company/?company=' + encodeURIComponent(application.value.companyId))
}
</script>
<template>
  <header class="wt-topbar"><a class="wt-brand" href="/"><UiBrandMark /> worktandem</a><span>Company application</span><a href="/accounts">Accounts &amp; workspaces</a></header>
  <main class="wt-page onboarding-page">
    <p class="wt-muted">YOUR COMPANY</p><h1>{{ application ? 'Your company application' : 'Tell us what you’re building' }}</h1>
    <p class="wt-muted">Company access starts after an independent review. Your other approved workspaces remain available.</p>
    <div v-if="error" class="wt-error" role="alert" tabindex="-1">{{ error }} <button class="wt-secondary" :disabled="busy" @click="load">Refresh current status</button> <a href="/accounts">Choose an account</a></div>
    <p v-if="notice" role="status">{{ notice }}</p><p v-if="busy" role="status">{{ selected ? 'Saving or refreshing your application…' : 'Checking your account…' }}</p>
    <section v-if="!busy && !selected && !error" class="wt-card"><h2>Choose an account first</h2><p>Your application belongs to the account selected for this tab.</p><a class="wt-button" href="/accounts">Choose an account</a></section>
    <template v-if="selected">
      <p class="wt-muted">Applying as {{ selected.displayName }}</p>
      <section v-if="application && !editing" class="wt-card application-summary" aria-labelledby="status-title">
        <div class="wt-row"><h2 id="status-title">{{ application.form.companyName }}</h2><span class="wt-badge">{{ application.status === 'Pending' ? 'Pending review' : application.status }}</span></div>
        <p v-if="application.status === 'Pending'">We’ve received your application. Company access becomes available after approval. You can refresh this page to check for an update.</p>
        <p v-if="application.status === 'Rejected'">Your application needs changes before it can be reviewed again.</p>
        <div v-if="application.applicantVisibleReason" class="review-reason"><h3>Review feedback</h3><p>{{ application.applicantVisibleReason }}</p></div>
        <dl><div><dt>Country</dt><dd>{{ application.form.countryCode }}</dd></div><div><dt>Business description</dt><dd>{{ application.form.businessDescription }}</dd></div><div><dt>Your role</dt><dd>{{ application.form.applicantRoleDescription }}</dd></div><div v-if="application.form.website"><dt>Website</dt><dd>{{ application.form.website }}</dd></div><div v-if="application.form.legalRegistrationId"><dt>Legal registration ID</dt><dd>{{ application.form.legalRegistrationId }}</dd></div><div><dt>Submission</dt><dd>{{ application.submissionNumber }} · {{ new Date(application.submittedAt).toLocaleString() }}</dd></div></dl>
        <div class="wt-row"><button v-if="application.status === 'Rejected'" class="wt-button" :disabled="busy" @click="editRejected">Update and resubmit</button><button v-if="application.status === 'Approved'" class="wt-button" :disabled="busy" @click="openWorkspace">Enter company workspace</button><button class="wt-secondary" :disabled="busy" @click="load">Refresh status</button><a href="/accounts">Other workspaces</a></div>
      </section>
      <section v-if="!application && !operationId" class="wt-card"><h2>Company membership is optional</h2><p>You can use your platform permissions without a company. Start an application if you also need a company workspace.</p><button class="wt-button" :disabled="busy" @click="beginApplication">Start a company application</button></section>
      <form v-if="canSubmit && ((!application && operationId) || editing)" class="wt-card application-form" @submit.prevent="submit">
        <h2>{{ application ? 'Update your application' : 'Company details' }}</h2>
        <p class="wt-muted">All fields are required unless marked optional. Review the details before submitting.</p>
        <label class="wt-field">Company name<input v-model="form.companyName" name="companyName" autocomplete="organization" required maxlength="200" :disabled="busy"></label>
        <div class="wt-grid"><label class="wt-field">Country code<input v-model="form.countryCode" name="countryCode" required minlength="2" maxlength="2" pattern="[A-Za-z]{2}" placeholder="e.g. GB" :disabled="busy"><small>Two-letter ISO country code</small></label><label class="wt-field">Website (optional)<input v-model="form.website" name="website" type="url" maxlength="2048" placeholder="https://example.com" :disabled="busy"></label></div>
        <label class="wt-field">What does your company do?<textarea v-model="form.businessDescription" name="businessDescription" required minlength="20" maxlength="2000" rows="4" :disabled="busy"></textarea><small>20–2000 characters</small></label>
        <label class="wt-field">Your role in the company<input v-model="form.applicantRoleDescription" name="applicantRoleDescription" required minlength="2" maxlength="200" placeholder="e.g. Founder and managing director" :disabled="busy"></label>
        <label class="wt-field">Legal registration ID (optional)<input v-model="form.legalRegistrationId" name="legalRegistrationId" maxlength="200" :disabled="busy"></label>
        <p class="wt-muted">Submitting sends these details to platform reviewers. It does not verify legal existence, website ownership or give immediate workspace access.</p>
        <div class="wt-row"><button class="wt-button" :disabled="busy || (!application && !operationId)">{{ busy ? 'Submitting…' : application ? 'Submit updated application' : 'Submit for review' }}</button><button v-if="application" class="wt-secondary" type="button" :disabled="busy" @click="cancelEdit">Cancel</button><a v-else href="/accounts">Back to accounts</a></div>
      </form>
    </template>
  </main>
</template>
<style scoped>
.onboarding-page{max-width:900px}.application-form{display:grid;gap:22px;margin:28px 0}.application-form h2,.application-form p{margin:0}.application-summary{margin:28px 0}.application-summary dl{margin:28px 0}.application-summary dl>div{display:grid;grid-template-columns:180px 1fr;gap:20px;padding:12px 0;border-top:1px solid #d2dce9}.application-summary dt{color:#526582;font-size:13px}.application-summary dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.review-reason{background:#fff7e7;border-left:3px solid #906200;padding:16px 22px;margin-top:24px}.review-reason h3{margin:0}.review-reason p{white-space:pre-wrap}
</style>
