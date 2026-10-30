import test from 'node:test'
import assert from 'node:assert/strict'
import { BrowserClient, ApiError, createBrowserClient } from '../packages/browser/index.ts'
const sessionA = '10000000-0000-4000-8000-000000000001', sessionB = '20000000-0000-4000-8000-000000000002'
const companyA = '30000000-0000-4000-8000-000000000003'
function storage() { const values = new Map(); return { values, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) } }
function json(value, status = 200) { return globalThis.Response.json(value, { status }) }

test('CSRF tokens are service and selector scoped; credentials and tokens never persist', async () => {
  const calls = [], store = storage()
  const client = new BrowserClient(store, async (url, options) => {
    calls.push({url, ...options})
    if (url.endsWith('/session/context')) return json({ sessions: [], selected: null, csrfToken: 'identity-token' })
    if (url.endsWith('/companies/context')) return json({ applications: [], workspaces: [], csrfToken: 'org-token' })
    return json({ done: true })
  })
  client.selectSession(sessionA); client.selectCompany(companyA)
  await client.request('organization', '/companies/applications', { method: 'POST', body: { form: {} }, headers: { 'X-WT-Account-Session': sessionB, 'X-WT-CSRF': 'attacker', 'X-WT-Company': 'attacker' } })
  await client.request('identity', '/account/company-operation', { method: 'POST' })
  assert.equal(calls[1].headers['X-WT-CSRF'], 'org-token')
  assert.equal(calls[1].headers['X-WT-Account-Session'], sessionA)
  assert.equal(calls[1].headers['X-WT-Company'], companyA)
  assert.equal(calls[3].headers['X-WT-CSRF'], 'identity-token')
  assert.equal(calls[1].credentials, 'same-origin'); assert.equal(calls[1].redirect, 'error'); assert.equal(calls[1].cache, 'no-store')
  assert.deepEqual([...store.values.values()].sort(), [sessionA, companyA].sort())
})
test('prelogin CSRF does not inherit selected account authority', async () => {
  const calls = [], client = new BrowserClient(storage(), async (url, options) => { calls.push(options); return json(url.endsWith('/context') ? { csrfToken: 'prelogin' } : {}) })
  client.selectSession(sessionA)
  await client.request('identity', '/auth/complete', { method: 'POST', prelogin: true, body: { pendingLoginId: 'proof' } })
  assert.equal(calls[0].headers['X-WT-Account-Session'], undefined)
  assert.equal(calls[1].headers['X-WT-Account-Session'], undefined)
  assert.equal(calls[1].headers['X-WT-CSRF'], 'prelogin')
})
test('switch aborts outstanding requests and rejects late transport responses', async () => {
  let release, signal
  const client = new BrowserClient(storage(), async (_url, options) => { signal = options.signal; return new Promise(resolve => { release = resolve }) })
  client.selectSession(sessionA)
  const old = client.context()
  client.selectSession(sessionB); release(json({ selected: { accountSessionId: sessionA }, csrfToken: 'old' }))
  await assert.rejects(old, { name: 'AbortError' }); assert.equal(signal.aborted, true); assert.equal(client.sessionId, sessionB)
})
test('a late response body cannot restore data after switching company', async () => {
  let release
  const response = { ok: true, status: 200, json: () => new Promise(resolve => { release = resolve }) }
  const client = new BrowserClient(storage(), async () => response)
  client.selectSession(sessionA)
  const old = client.context(); await Promise.resolve(); client.selectCompany(companyA)
  release({ csrfToken: 'stale' }); await assert.rejects(old, { name: 'AbortError' })
})
test('unauthorized selected requests clear all per-tab hints', async () => {
  const store = storage(), client = new BrowserClient(store, async () => json({ code: 'invalid_session' }, 401))
  client.selectSession(sessionA); client.selectCompany(companyA)
  await assert.rejects(client.context(), error => error instanceof ApiError && error.status === 401)
  assert.equal(client.sessionId, null); assert.equal(client.companyId, null); assert.equal(store.values.size, 0)
})
test('another tab cannot affect this tab selection through shared global state', () => {
  const a = new BrowserClient(storage()), b = new BrowserClient(storage())
  a.selectSession(sessionA); a.selectCompany(companyA); b.selectSession(sessionB)
  assert.equal(a.sessionId, sessionA); assert.equal(a.companyId, companyA); assert.equal(b.companyId, null)
})
test('organization requests require explicit session and invalid storage is discarded', async () => {
  const store = storage(); store.setItem('wt.account-session', 'bad'); store.setItem('wt.company', companyA)
  const client = new BrowserClient(store, async () => { throw new Error('must not fetch') })
  assert.equal(client.companyId, null)
  await assert.rejects(client.companies(), error => error.code === 'account_selection_required')
  assert.throws(() => client.selectSession('https://evil.test'))
})
test('provider navigation accepts only the Google HTTPS origin', async () => {
  for (const url of ['https://evil.test', 'javascript:alert(1)', 'https://accounts.google.com.evil.test', 'https://user@accounts.google.com/o/oauth2']) {
    const client = new BrowserClient(storage(), async path => json(path.endsWith('/context') ? { csrfToken: 'token' } : { authorizationUrl: url }))
    await assert.rejects(client.startLogin('Login'))
  }
})
test('unsafe delivery is never automatically replayed and retains idempotency key', async () => {
  let writes = 0
  const client = new BrowserClient(storage(), async (url, options) => {
    if (url.endsWith('/context')) return json({ csrfToken: 'token' })
    writes++; assert.equal(options.headers['Idempotency-Key'], 'same-attempt'); throw new TypeError('connection lost')
  })
  client.selectSession(sessionA)
  await assert.rejects(client.request('organization', '/companies/applications', { method: 'POST', headers: { 'Idempotency-Key': 'same-attempt' } }))
  assert.equal(writes, 1)
})
test('default transport invokes native fetch with its global receiver', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = function () { assert.equal(this, globalThis); return Promise.resolve(json({ sessions: [], selected: null, csrfToken: 'token' })) }
    const client = new BrowserClient(storage())
    assert.equal((await client.context()).selected, null)
  } finally { globalThis.fetch = original }
})
test('denied browser storage still allows in-memory per-tab selection', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  try {
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, get() { throw new Error('Storage denied') } })
    const client = createBrowserClient(); client.selectSession(sessionA); client.selectCompany(companyA)
    assert.equal(client.sessionId, sessionA); assert.equal(client.companyId, companyA)
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'sessionStorage', descriptor)
    else delete globalThis.sessionStorage
  }
})
