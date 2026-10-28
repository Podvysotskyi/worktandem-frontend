import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

export default defineNuxtPlugin((nuxtApp) => {
  // One client per Nuxt application instance, never a module-level shared cache.
  const queryClient = new QueryClient()
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
})
