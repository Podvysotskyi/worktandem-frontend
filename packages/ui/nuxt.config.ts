import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-10-28',
  devtools: { enabled: false },
  css: [fileURLToPath(new URL('./app/assets/css/main.css', import.meta.url))],
  vite: { plugins: [tailwindcss()] },
})
