<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { BrowserClient, PendingLogin } from '@worktandem/browser'
import { aborted, focusProblem, mainClient, pendingId, problemMessage, usePrivatePageLifecycle } from '../features/browser'
useHead({ title: 'Initial platform setup · Worktandem', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const ready = ref(false), busy = ref(false), error = ref(''), proof = ref<PendingLogin | null>(null), secretInput = ref<HTMLInputElement | null>(null)
let client: BrowserClient | undefined
let id: string | null = null
let revision = 0
usePrivatePageLifecycle(() => {
  revision++; client?.dispose(); if (secretInput.value) secretInput.value.value = ''; id = null; proof.value = null; error.value = ''; busy.value = false; ready.value = false
}, () => {
  client = mainClient(); ready.value = true; error.value = 'For your security, the setup proof and entered secret were cleared when you left. Verify with Google again or choose an existing session.'
})
onMounted(async () => {
  const request = ++revision
  client = mainClient(); id = pendingId(); ready.value = true
  if (!id) return
  busy.value = true
  try {
    const pending = await client.request<PendingLogin>('identity', '/auth/pending/' + id, { prelogin: true })
    if (request !== revision) return
    if (pending.purpose !== 0 || !pending.proofValidated || Date.parse(pending.expiresAt) <= Date.now()) throw new Error('unavailable')
    proof.value = pending
  } catch (failure) { if (request === revision && !aborted(failure)) { error.value = problemMessage(failure); focusProblem() } }
  finally { if (request === revision) busy.value = false }
})
onBeforeUnmount(() => { revision++; if (secretInput.value) secretInput.value.value = ''; client?.dispose() })
async function begin() {
  if (!client || busy.value) return
  const request = revision
  busy.value = true; error.value = ''
  try { const url = await client.startLogin('Bootstrap', true); if (request === revision) window.location.assign(url) }
  catch (failure) { if (request === revision) { if (!aborted(failure)) { error.value = problemMessage(failure); focusProblem() }; busy.value = false } }
}
async function finish() {
  if (!client || !id || !proof.value || busy.value || !secretInput.value) return
  const request = revision
  busy.value = true; error.value = ''
  // The entered authority secret exists only in the input and this request, never reactive state or storage.
  const secret = secretInput.value.value
  secretInput.value.value = ''
  try { await client.bootstrap(id, secret); if (request === revision) { proof.value = null; window.location.assign('/accounts') } }
  catch (failure) { if (request === revision && !aborted(failure)) { error.value = problemMessage(failure); focusProblem() } }
  finally { if (request === revision) busy.value = false }
}
</script>
<template>
  <header class="wt-topbar"><a class="wt-brand" href="/"><UiBrandMark /> worktandem</a><span>Initial setup</span></header>
  <main class="wt-page setup-page"><section class="wt-card"><p class="wt-muted">One-time platform setup</p><h1>Set up the platform owner</h1><p>This is for the first platform operator. Company membership is optional and separate.</p><p class="wt-muted">Setup requires a fresh, verified Google sign-in with the server-required assurance and the secret supplied to the operator. Completed setup cannot be reopened.</p><div v-if="error" class="wt-error" role="alert" tabindex="-1">{{ error }}</div><p v-if="busy" role="status">Verifying setup…</p><form v-if="proof" autocomplete="off" @submit.prevent="finish"><label class="wt-field">Setup secret<input ref="secretInput" type="password" name="setup-secret" autocomplete="off" required minlength="32" maxlength="4096" :disabled="busy"></label><button class="wt-button" :disabled="busy">{{ busy ? 'Completing setup…' : 'Create platform owner' }}</button></form><button v-else class="wt-button" :disabled="!ready || busy" @click="begin">Verify with Google</button><p><a href="/accounts">Choose a signed-in account</a> · <a href="/">Back to welcome</a></p></section></main>
</template>
<style scoped>.setup-page{max-width:720px;margin:60px auto}.setup-page form{display:grid;gap:24px;margin:24px 0}</style>
