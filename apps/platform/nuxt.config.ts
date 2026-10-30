export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  ssr: false,
  app: { baseURL: '/platform/' },
})
