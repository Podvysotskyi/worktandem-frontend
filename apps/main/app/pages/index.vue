<script setup lang="ts">
useHead({ title: 'Worktandem · Scaffold' })
</script>

<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
    <p class="text-sm font-medium text-muted-foreground">WORKTANDEM · APPLICATION SCAFFOLD</p>
    <h1 class="text-4xl font-semibold tracking-tight">Worktandem</h1>
    <p class="max-w-xl text-lg text-muted-foreground">A shared foundation for the Worktandem public experience.</p>
    <section class="rounded-lg border bg-card p-6" aria-labelledby="status">
      <h2 id="status" class="font-semibold">Foundation only</h2>
      <p class="mt-2 text-muted-foreground">Shared UI primitives and neutral design tokens are ready for iteration. No customer data or authenticated session is loaded.</p>
    </section>
    <div><UiButton as-child><a href="/company/">Open company scaffold</a></UiButton></div>
  </main>
</template>
