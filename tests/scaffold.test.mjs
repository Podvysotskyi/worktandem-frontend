import { URL } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('two independent apps share the UI layer and route company under its prefix', async () => {
  const main = await readFile(new URL('../apps/main/nuxt.config.ts', import.meta.url), 'utf8')
  const company = await readFile(new URL('../apps/company/nuxt.config.ts', import.meta.url), 'utf8')
  assert.match(main, /ssr: true/)
  assert.match(company, /ssr: false/)
  assert.match(company, /baseURL: '\/company\/'/)
  for (const config of [main, company]) assert.match(config, /packages\/ui/)
})
