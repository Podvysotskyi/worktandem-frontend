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

test('shared UI remains independent of apps and transport/state clients', async () => {
  const { readdir } = await import('node:fs/promises')
  const root = new URL('../packages/ui/', import.meta.url)
  const files = await readdir(root, { recursive: true, withFileTypes: true })
  for (const file of files) {
    if (!file.isFile() || !/\.(vue|ts|json)$/.test(file.name) || file.parentPath.includes('node_modules')) continue
    const source = await readFile(`${file.parentPath}/${file.name}`, 'utf8')
    assert.doesNotMatch(source, /@worktandem\/(main|company)|@tanstack\/vue-query|\b(?:fetch|\$fetch)\s*\(/, file.name)
  }
})
