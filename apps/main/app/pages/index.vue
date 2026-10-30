<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { BrowserClient } from '@worktandem/browser'
import { aborted, focusProblem, mainClient, problemMessage, usePrivatePageLifecycle } from '../features/browser'
useHead({ title: 'Worktandem · A clearer way to work together' })
const ready = ref(false), busy = ref(false), error = ref('')
let client: BrowserClient | undefined
let revision = 0
onMounted(() => { client = mainClient(); ready.value = true })
onBeforeUnmount(() => { revision++; client?.dispose() })
usePrivatePageLifecycle(() => { revision++; client?.dispose(); busy.value = false; error.value = ''; ready.value = false }, () => { client = mainClient(); ready.value = true })
async function start(purpose: 'Login' | 'Register') {
  if (!client || busy.value) return
  const request = revision
  busy.value = true; error.value = ''
  try { const url = await client.startLogin(purpose); if (request === revision) window.location.assign(url) }
  catch (failure) { if (request === revision) { if (!aborted(failure)) { error.value = problemMessage(failure); focusProblem() }; busy.value = false } }
}
</script>
<template>
  <div class="welcome">
    <header class="wt-topbar"><a class="wt-brand" href="/"><span class="brand-bars" aria-hidden="true"><UiBrandMark /></span> worktandem</a><span class="tagline">A clearer way to work together</span><button class="top-login" :disabled="!ready || busy" @click="start('Login')">Continue with Google →</button></header>
    <main class="welcome-main">
      <div v-if="error" role="alert" tabindex="-1" class="wt-error">{{ error }} <a href="/accounts">Choose a signed-in account</a></div>
      <div class="hero">
        <section><p class="eyebrow">WORK, IN GOOD COMPANY</p><h1>One place to move<br>your company forward.</h1><p class="hero-copy">Build relationships. Keep projects moving. Bring your team<br class="desktop-break"> together — with a clear space for every company you join.</p><div class="hero-actions"><button class="wt-button" :disabled="!ready || busy" @click="start('Register')">{{ busy ? 'Connecting…' : 'Get started with Google' }} →</button><a href="/accounts">Already a member? Choose your workspace</a></div><p class="wt-muted welcome-note">Start with Google. Create your company. We’ll review your application.</p></section>
        <aside class="wt-card steps" aria-label="Getting started"><div><span class="step-number">01</span><h2>Your Google account</h2><p>A single, secure identity.</p></div><div><span class="step-number">02</span><h2>Your company</h2><p>Tell us what you’re building.</p></div><div><span class="step-number">03</span><h2>A human review</h2><p>Access starts after approval.</p></div></aside>
      </div>
      <section class="welcome-benefits" aria-label="Work together"><div><h2>Customers</h2><p>Build stronger relationships.</p></div><div><h2>Projects</h2><p>Keep your next move visible.</p></div><div><h2>People</h2><p>Work better in tandem.</p></div></section>
    </main>
    <footer>Worktandem · A clearer way to work together <a href="/setup">Platform setup</a></footer>
  </div>
</template>
<style scoped>
.welcome{min-height:100vh;background:#f1f4f8;color:#19263e}.brand-bars{color:#91b1fc;font-size:29px}.tagline{margin-left:110px;color:#b9c5d7;font-size:13px}.top-login{margin-left:auto;border:0;color:white;background:transparent;cursor:pointer}.welcome-main{padding:84px 4.5% 0;max-width:1760px;margin:auto}.hero{display:grid;grid-template-columns:minmax(0,1fr) 440px;gap:70px}.eyebrow,.step-number{background:#e8efff;color:#0648ca;border-radius:2px;padding:7px 12px;font-size:11px}.eyebrow{display:inline-block;min-width:208px;margin:0 0 40px}h1{font-size:58px;line-height:1.28;letter-spacing:-1.2px;font-weight:650;margin:0 0 28px}.hero-copy{font-size:19px;line-height:1.35;color:#526582;margin:30px 0 60px}.hero-actions{display:flex;align-items:center;gap:32px;font-size:14px}.hero-actions .wt-button{min-width:338px;min-height:45px}.welcome-note{margin-top:34px;font-size:13px}.steps{padding:32px 30px!important;min-height:510px}.steps>div+div{border-top:1px solid #d2dce9;padding-top:20px;margin-top:36px}.steps h2{font-size:20px;margin:28px 0 8px}.steps p{font-size:13px;color:#526582;margin:0}.step-number{display:inline-block;min-width:52px}.welcome-benefits{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;border-top:1px solid #d2dce9;margin-top:74px;padding:42px 4px}.welcome-benefits h2{font-size:20px;margin:0 0 14px}.welcome-benefits p{font-size:14px;color:#526582}.welcome footer{display:flex;justify-content:space-between;color:#526582;font-size:11px;padding:110px 4% 30px}@media(max-width:1200px){h1{font-size:44px}.hero{grid-template-columns:minmax(0,1fr) 340px;gap:35px}.hero-actions{flex-wrap:wrap}.tagline{margin-left:50px}}@media(max-width:800px){.hero{grid-template-columns:1fr}.tagline{display:none}.welcome-main{padding-top:40px}.welcome-benefits{grid-template-columns:1fr}.desktop-break{display:none}h1{font-size:38px}}
</style>
