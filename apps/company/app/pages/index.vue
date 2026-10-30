<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { createBrowserClient, errorMessage, type SessionIdentity, type WorkspaceView } from '@worktandem/browser'
useHead({ title: 'Company workspace · Worktandem' })
let client = createBrowserClient()
const cache = useQueryClient()
const identity = ref<SessionIdentity | null>(null)
const selection = ref<string | null>(null)
const booting = ref(true)
const failure = ref('')
const loggingOut = ref(false)
const workspaces = ref<WorkspaceView[]>([])
let revision = 0
const queryKey = computed(() => ['workspace', identity.value?.accountId, identity.value?.accountSessionId, selection.value])
const workspace = useQuery({ queryKey, enabled: computed(() => !!identity.value && !!selection.value),
  queryFn: () => client.request<WorkspaceView>('organization', `/companies/${selection.value}/workspace`), retry: false, staleTime: 0 })
watch(() => workspace.error.value, async error => {
  if (error && !client.sessionId) { await clearContext(); failure.value = errorMessage(error) }
})
async function clearContext() {
  identity.value = null; selection.value = null; workspaces.value = []
  await cache.cancelQueries(); cache.clear()
}
async function load() {
  const request = ++revision
  booting.value = true; failure.value = ''; await clearContext()
  try {
    const context = await client.context()
    if (request !== revision) return
    if (!context.selected) return
    identity.value = context.selected
    const companies = await client.companies()
    if (request !== revision) return
    workspaces.value = companies.workspaces
    const target = new URLSearchParams(location.search).get('company') ?? client.companyId
    if (target) {
      if (!companies.workspaces.some(w => w.companyId === target)) { client.selectCompany(null); failure.value = 'This company is unavailable for the selected account.' }
      else { client.selectCompany(target); selection.value = target }
    }
  } catch (error) { if (request === revision && !(error instanceof DOMException && error.name === 'AbortError')) { await clearContext(); failure.value = errorMessage(error) } }
  finally { if (request === revision) booting.value = false }
}
async function choose(event: Event) {
  revision++
  const id = (event.target as HTMLSelectElement).value || null
  selection.value = null; await cache.cancelQueries(); cache.clear()
  client.selectCompany(id); selection.value = id
  const url = new URL(location.href); url.searchParams.delete('company'); history.replaceState(null, '', url)
}
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true; failure.value = ''
  try { await client.logoutCurrent(); await clearContext(); location.assign('/accounts') }
  catch (error) { if (!client.sessionId) await clearContext(); failure.value = errorMessage(error) }
  finally { loggingOut.value = false }
}
function visibility() { if (document.visibilityState === 'visible') void load() }
function pageHide() { revision++; document.documentElement.style.visibility = 'hidden'; client.dispose(); void clearContext() }
async function pageShow(event: PageTransitionEvent) { if (event.persisted) { client = createBrowserClient(); void load(); await nextTick(); document.documentElement.style.visibility = '' } }
onMounted(() => { void load(); document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pageHide); window.addEventListener('pageshow', pageShow) })
onUnmounted(() => { client.dispose(); cache.clear(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pageHide); window.removeEventListener('pageshow', pageShow) })
</script>

<template>
  <div>
    <header class="wt-topbar">
      <a href="/" class="wt-brand"><span aria-hidden="true" class="wt-logo"><UiBrandMark /></span> worktandem</a>
      <span class="wt-topbar-context">Company workspace</span>
      <nav class="wt-row" aria-label="Account">
        <span v-if="identity">{{ identity.displayName }}</span><a href="/accounts">Switch account</a>
        <button v-if="identity" class="wt-topbar-action" :disabled="loggingOut" @click="logout">{{ loggingOut ? 'Signing out…' : 'Sign out' }}</button>
      </nav>
    </header>
    <main class="wt-page">
      <p class="wt-eyebrow">YOUR COMPANY</p><h1>Workspace</h1>
      <p v-if="booting" role="status">Checking your account and company access…</p>
      <div v-if="failure" class="wt-error" role="alert">{{ failure }} <button class="wt-secondary" @click="load">Try again</button></div>
      <section v-if="!booting && !identity" class="wt-card">
        <h2>Choose your account</h2><p>Company access is checked for the account selected in this tab.</p>
        <a class="wt-button" href="/accounts">Choose an account</a>
      </section>
      <template v-if="!booting && identity">
        <div class="wt-field workspace-picker">
          <label for="workspace-company">Company</label>
          <select id="workspace-company" :value="selection ?? ''" @change="choose">
            <option value="">Choose a company</option>
            <option v-for="item in workspaces" :key="item.companyId" :value="item.companyId">{{ item.name }}</option>
          </select>
        </div>
        <section v-if="!workspaces.length" class="wt-card">
          <h2>No active workspace yet</h2><p>Company access begins after approval. Your applications are available from your account.</p>
          <a class="wt-button" href="/onboarding">View your application</a>
        </section>
        <p v-else-if="!selection" class="wt-muted">Choose a company to open its authorized workspace.</p>
        <p v-if="selection && workspace.isPending.value" role="status">Checking current company membership…</p>
        <div v-if="workspace.error.value" role="alert" class="wt-error">
          {{ errorMessage(workspace.error.value) }}<button class="wt-secondary" @click="load">Refresh access</button>
        </div>
        <section v-if="workspace.data.value && !workspace.error.value && selection" class="wt-card workspace-summary">
          <div class="wt-row"><span class="wt-badge">Active workspace</span><span class="wt-muted">Company scope</span></div>
          <h2>{{ workspace.data.value.name }}</h2><p>Welcome, {{ identity.displayName }}. Your current account has access to this company.</p>
          <div class="wt-grid module-preview">
            <section><h3>Customers</h3><p>Customer management is coming later.</p></section>
            <section><h3>Projects</h3><p>Project tools are coming later.</p></section>
            <section><h3>People</h3><p>Invitations and member administration are coming later.</p></section>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<style scoped>
.workspace-picker { max-width: 440px; margin: 28px 0; }
.workspace-summary { margin-top: 28px; }
.workspace-summary h2 { font-size: 30px; margin-top: 24px; }
.module-preview { grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--border); padding-top: 28px; margin-top: 36px; }
.module-preview h3 { font-size: 17px; font-weight: 600; }
</style>
