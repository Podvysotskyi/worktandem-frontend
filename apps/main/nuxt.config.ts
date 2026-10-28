export default defineNuxtConfig({
  extends: ['../../packages/ui'],
  ssr: true,
  // Local development only; production ingress must preserve /company/.
  nitro: { devProxy: { "/company": { target: "http://localhost:3001/company", changeOrigin: true } } },
})
