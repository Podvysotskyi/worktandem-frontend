<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { BrowserClient, PendingLogin } from '@worktandem/browser'
import { aborted, focusProblem, mainClient, pendingId, problemMessage, usePrivatePageLifecycle } from '../../features/browser'
useHead({ title: 'Complete Google sign-in · Worktandem', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const pending = ref<PendingLogin | null>(null), busy = ref(true), error = ref(''), name = ref(''), complete = ref(false)
let client: BrowserClient | undefined
let id: string | null = null
let revision = 0
usePrivatePageLifecycle(() => {
  revision++; client?.dispose(); id = null; pending.value = null; name.value = ''; complete.value = false; error.value = ''; busy.value = false
}, () => {
  client = mainClient(); error.value = 'For your security, this sign-in was cleared when you left the page. Choose an existing session or start a new sign-in.'; busy.value = false
})
onMounted(async () => {
  const request = ++revision
  client = mainClient()
  const url = new URL(window.location.href)
  if (url.searchParams.get('error') === 'invalid_google_login') {
    url.searchParams.delete('error'); window.history.replaceState(null, '', url.pathname + url.search)
    error.value = 'Google sign-in was cancelled or could not be verified. No account was changed. Start a new sign-in or choose an existing session.'
    busy.value = false; focusProblem(); return
  }
  id = pendingId()
  if (!id) { error.value = 'No sign-in is available. Choose an existing session or start a new Google sign-in.'; busy.value = false; return }
  try {
    const result = await client.request<PendingLogin>('identity', '/auth/pending/' + id, { prelogin: true })
    if (request !== revision) return
    pending.value = result
    if (!pending.value.proofValidated || Date.parse(pending.value.expiresAt) <= Date.now()) { pending.value = null; error.value = 'This Google sign-in is not available. Start a new sign-in.' }
    else if (pending.value.purpose === 0) { error.value = 'This is a platform setup flow. Start setup again from the setup page.'; pending.value = null }
  } catch (failure) { if (request === revision && !aborted(failure)) error.value = problemMessage(failure) }
  finally { if (request === revision) busy.value = false }
})
onBeforeUnmount(() => { revision++; client?.dispose() })
async function finish() {
  if (!client || !id || !pending.value || busy.value) return
  const request = revision
  busy.value = true; error.value = ''
  try { await client.complete(id, name.value.trim() || undefined); if (request === revision) { complete.value = true; pending.value = null; window.location.assign('/accounts') } }
  catch (failure) { if (request === revision && !aborted(failure)) { error.value = problemMessage(failure); focusProblem() } }
  finally { if (request === revision) busy.value = false }
}
</script>
<template>
  <header class="wt-topbar"><a class="wt-brand" href="/"><UiBrandMark /> worktandem</a></header>
  <main class="wt-page auth-page"><section class="wt-card"><p class="wt-muted">Your Google account</p><h1>Complete your sign-in</h1><p v-if="busy" role="status">{{ complete ? 'Opening your accounts…' : 'Checking your sign-in…' }}</p><div v-if="error" class="wt-error" role="alert" tabindex="-1">{{ error }}</div><form v-if="pending" @submit.prevent="finish"><p>Your Google identity has been verified. Continue to create or open its Worktandem account.</p><label v-if="pending.purpose === 2 || pending.purpose === 3" class="wt-field">Display name<input v-model="name" name="displayName" autocomplete="name" required maxlength="200" :disabled="busy"><small>Required for a new account. An existing account keeps its current name.</small></label><button class="wt-button" :disabled="busy">{{ busy ? 'Completing…' : 'Continue to Worktandem' }}</button></form><p><a href="/accounts">Choose a signed-in account</a> · <a href="/">Start again</a></p></section></main>
</template>
<style scoped>.auth-page{max-width:650px;margin:70px auto}.auth-page form{display:grid;gap:22px;margin:24px 0}</style>
