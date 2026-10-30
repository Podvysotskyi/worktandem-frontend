<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { BrowserClient, SessionContext, CompanyContext, WorkspaceView } from '@worktandem/browser'
import { aborted, focusProblem, mainClient, problemMessage, usePrivatePageLifecycle } from '../features/browser'
useHead({ title: 'Choose an account · Worktandem' })
const context = ref<SessionContext | null>(null), companies = ref<CompanyContext | null>(null)
const busy = ref(true), error = ref(''), notice = ref('')
let client: BrowserClient | undefined
let revision = 0
onMounted(() => { client = mainClient(); void load() })
onBeforeUnmount(() => { revision++; client?.dispose() })
usePrivatePageLifecycle(() => {
  revision++; client?.dispose(); context.value = null; companies.value = null; error.value = ''; notice.value = ''; busy.value = true
}, async () => { client = mainClient(); await load() })
async function load() {
  if (!client) return
  const request = ++revision
  busy.value = true; error.value = ''; context.value = null; companies.value = null
  try {
    const current = await client.context()
    if (request !== revision) return
    context.value = current
    if (current.selected) {
      const result = await client.companies()
      if (request === revision) companies.value = result
    }
  } catch (failure) { if (request === revision && !aborted(failure)) { if (!client.sessionId) { context.value = null; companies.value = null }; error.value = problemMessage(failure); focusProblem() } }
  finally { if (request === revision) busy.value = false }
}
function choose(id: string) { if (!client || busy.value) return; client.selectSession(id); notice.value = ''; void load() }
function switchAccount() { if (!client || busy.value) return; client.selectSession(null); notice.value = ''; void load() }
function enter(workspace: WorkspaceView) {
  if (!client || busy.value || workspace.accountSessionId !== client.sessionId) return
  client.selectCompany(workspace.companyId)
  window.location.assign('/company/?company=' + encodeURIComponent(workspace.companyId))
}
async function signIn(purpose: 'Login' | 'AddAccount', fresh = false) {
  if (!client || busy.value) return
  const request = revision
  busy.value = true; error.value = ''
  try { const url = await client.startLogin(purpose, fresh); if (request === revision) window.location.assign(url) }
  catch (failure) { if (request === revision) { if (!client.sessionId) { context.value = null; companies.value = null }; if (!aborted(failure)) { error.value = problemMessage(failure); focusProblem() }; busy.value = false } }
}
async function logout(all = false) {
  if (!client || busy.value) return
  const request = revision
  busy.value = true; error.value = ''
  try {
    if (all) await client.logoutContainer(); else await client.logoutCurrent()
    if (request !== revision) return
    notice.value = all ? 'All accounts in this browser have been signed out.' : 'The selected account has been signed out.'
    await load()
  } catch (failure) { if (request === revision) { if (!client.sessionId) { context.value = null; companies.value = null }; if (!aborted(failure)) { error.value = problemMessage(failure); focusProblem() }; busy.value = false } }
}
</script>
<template>
  <header class="wt-topbar"><a class="wt-brand" href="/"><UiBrandMark /> worktandem</a><span>Accounts &amp; workspaces</span></header>
  <main class="wt-page accounts-page">
    <h1>Choose your workspace</h1><p class="wt-muted">Choose an account for this tab, then a company. Other tabs keep their own selection.</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <div v-if="error" class="wt-error" role="alert" tabindex="-1">{{ error }} <button class="wt-secondary" :disabled="busy" @click="load">Refresh</button><button class="wt-secondary" :disabled="busy" @click="switchAccount">Choose another account</button></div>
    <p v-if="busy" role="status">Loading your current access…</p>
    <section v-if="context && !context.selected" class="wt-card" aria-labelledby="accounts-title">
      <h2 id="accounts-title">Signed-in accounts</h2>
      <p v-if="!context.sessions.length" class="wt-muted">No active accounts are signed in to this browser.</p>
      <ul class="account-list"><li v-for="session in context.sessions" :key="session.accountSessionId"><button class="account-choice" :disabled="busy" @click="choose(session.accountSessionId)"><strong>{{ session.displayName }}</strong><small>{{ session.accountId }}</small><span aria-hidden="true">→</span></button></li></ul>
      <div class="wt-row"><button class="wt-button" :disabled="busy" @click="signIn('Login')">Sign in with Google</button><button class="wt-secondary" :disabled="busy" @click="signIn('AddAccount')">Add another account</button></div>
    </section>
    <template v-if="context?.selected">
      <section class="wt-card" aria-labelledby="selected-title"><div class="wt-row"><div><p class="wt-muted">Selected for this tab</p><h2 id="selected-title">{{ context.selected.displayName }}</h2><p class="account-id">Account ID: {{ context.selected.accountId }}</p></div><button class="wt-secondary" :disabled="busy" @click="switchAccount">Switch account</button></div></section>
      <section v-if="companies" class="wt-card" aria-labelledby="workspaces-title"><h2 id="workspaces-title">Company workspaces</h2><p v-if="!companies.workspaces.length" class="wt-muted">You have no approved company workspace access yet.</p><ul class="account-list"><li v-for="workspace in companies.workspaces" :key="workspace.companyId"><button class="account-choice" :disabled="busy" @click="enter(workspace)"><strong>{{ workspace.name }}</strong><span>Enter workspace →</span></button></li></ul><a href="/onboarding">{{ companies.applications.length ? 'View your company application' : 'Apply for a company workspace' }}</a></section>
      <section v-if="context.selected.capabilities.includes('platform.companies.read')" class="wt-card"><h2>Platform operations</h2><p class="wt-muted">Platform access is separate from company membership.</p><a class="wt-button" href="/platform/">Open platform review</a></section>
      <div class="wt-row"><button class="wt-secondary" :disabled="busy" @click="signIn('Login', true)">Refresh Google verification</button><button class="wt-secondary" :disabled="busy" @click="logout()">Sign out this account</button><button class="wt-secondary" :disabled="busy" @click="logout(true)">Sign out all accounts in this browser</button></div>
    </template>
    <p><a href="/">Back to welcome</a></p>
  </main>
</template>
<style scoped>
.accounts-page{max-width:1000px}.accounts-page>section{margin:24px 0}.account-list{list-style:none;padding:0;margin:16px 0}.account-choice{display:flex;align-items:center;gap:20px;width:100%;padding:20px;text-align:left;border:1px solid #d2dce9;background:white;cursor:pointer}.account-choice small{color:#526582}.account-choice span:last-child{margin-left:auto}.account-id{font-size:12px;color:#526582;overflow-wrap:anywhere}
</style>
