export interface SessionSummary { accountId: string; accountSessionId: string; displayName: string }
export interface SessionIdentity extends SessionSummary {
  accountVersion: string; initialRegistrationOperationId: string | null; companyCreationOperationId: string | null;
  expiresAt: string; idleExpiresAt: string; capabilities: string[]
}
export interface SessionContext { sessions: SessionSummary[]; selected: SessionIdentity | null; csrfToken: string }
export interface CompanyForm { companyName: string; countryCode: string; businessDescription: string; applicantRoleDescription: string; website?: string | null; legalRegistrationId?: string | null }
export interface ApplicationView { companyId: string; companyVersion: string; status: string; applicationId: string; applicationVersion: string; submissionNumber: number; form: CompanyForm; applicantVisibleReason: string | null; submittedAt: string }
export interface WorkspaceView { companyId: string; companyVersion: string; name: string; membershipId: string; accountId: string; accountSessionId: string; permissions: string[] }
export interface CompanyContext { applications: ApplicationView[]; workspaces: WorkspaceView[]; csrfToken: string }
export interface ReviewView { application: ApplicationView; applicantAccountId: string; internalNote: string | null }
export interface PendingLogin { id: string; purpose: number; expiresAt: string; proofValidated: boolean }
type Service = 'identity' | 'organization'
interface RequestOptions { method?: 'GET' | 'POST'; body?: unknown; prelogin?: boolean; headers?: Record<string, string> }
interface HintStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sessionKey = 'wt.account-session'; const companyKey = 'wt.company'
export class ApiError extends Error {
  status: number; code: string; correlationId?: string; retryAfter?: string | null
  constructor(status: number, code: string, correlationId?: string, retryAfter?: string | null) {
    super(code); this.status = status; this.code = code; this.correlationId = correlationId; this.retryAfter = retryAfter
  }
}

// One client per mounted application. Storage contains selector hints only, never credentials or CSRF.
export class BrowserClient {
  private session: string | null; private company: string | null; private generation = 0
  private controllers = new Set<AbortController>()
  private tokens = new Map<string, string>()
  private storage: HintStorage; private transport: typeof fetch
  constructor(storage: HintStorage, transport: typeof fetch = (...args) => globalThis.fetch(...args)) {
    this.storage = storage; this.transport = transport
    this.session = this.read(sessionKey); this.company = this.session ? this.read(companyKey) : null
  }
  private read(key: string) { try { const v = this.storage.getItem(key); return v && uuid.test(v) ? v : null } catch { return null } }
  private save(key: string, value: string | null) { try { if (value) this.storage.setItem(key, value); else this.storage.removeItem(key) } catch { /* Memory-only selection remains usable when storage is disabled. */ } }
  get sessionId() { return this.session }
  get companyId() { return this.company }
  get scope() { return [this.session, this.company, this.generation] as const }
  private reset() { this.generation++; for (const c of this.controllers) c.abort(); this.controllers.clear(); this.tokens.clear() }
  selectSession(id: string | null) {
    if (id && !uuid.test(id)) throw new Error('invalid_selector')
    this.reset(); this.session = id; this.company = null; this.save(sessionKey, id); this.save(companyKey, null)
  }
  selectCompany(id: string | null) {
    if (id && (!this.session || !uuid.test(id))) throw new Error('invalid_selector')
    this.reset(); this.company = id; this.save(companyKey, id)
  }
  dispose() { this.reset() }
  async request<T>(service: Service, path: string, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]/.test(path.split('?')[0]!)) throw new Error('invalid_api_path')
    const generation = this.generation; const session = options.prelogin ? null : this.session
    const selector = session ?? 'prelogin'; const tokenKey = `${service}:${selector}`
    const method = options.method ?? 'GET'
    if (service === 'organization' && !session) throw new ApiError(401, 'account_selection_required')
    if (method === 'POST' && !this.tokens.has(tokenKey)) {
      if (service === 'identity') await this.request<SessionContext>('identity', '/session/context', { prelogin: options.prelogin })
      else await this.companies()
    }
    if (generation !== this.generation) throw new DOMException('Context changed', 'AbortError')
    const controller = new AbortController(); this.controllers.add(controller)
    try {
      const headers: Record<string, string> = { Accept: 'application/json', ...options.headers }
      // Callers cannot replace authority selectors or CSRF with stale request headers.
      for (const k of Object.keys(headers)) if (/^(x-wt-account-session|x-wt-company|x-wt-csrf)$/i.test(k)) delete headers[k]
      if (session) headers['X-WT-Account-Session'] = session
      if (this.company && session) headers['X-WT-Company'] = this.company
      if (method === 'POST') { headers['Content-Type'] = 'application/json'; headers['X-WT-CSRF'] = this.tokens.get(tokenKey)! }
      const response = await this.transport(`/api/${service}${path}`, { method, headers, body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined, credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal })
      if (generation !== this.generation) throw new DOMException('Context changed', 'AbortError')
      if (!response.ok) {
        const problem = await response.json().catch(() => ({})) as { code?: string; correlationId?: string }
        if (generation !== this.generation) throw new DOMException('Context changed', 'AbortError')
        if (response.status === 401 && session === this.session) this.selectSession(null)
        throw new ApiError(response.status, problem.code ?? `http_${response.status}`, problem.correlationId, response.headers.get('Retry-After'))
      }
      const value = response.status === 204 ? undefined : await response.json()
      if (generation !== this.generation) throw new DOMException('Context changed', 'AbortError')
      if (value?.csrfToken) this.tokens.set(tokenKey, value.csrfToken)
      return value as T
    } finally { this.controllers.delete(controller) }
  }
  context() { return this.request<SessionContext>('identity', '/session/context') }
  companies() { return this.request<CompanyContext>('organization', '/companies/context') }
  async startLogin(purpose: 'Login' | 'Register' | 'AddAccount' | 'Bootstrap', fresh = false) {
    const result = await this.request<{ authorizationUrl: string }>('identity', '/auth/start', { method: 'POST', prelogin: true, body: { purpose, returnPath: purpose === 'Bootstrap' ? '/setup' : '/auth/continue', requireFreshMfa: fresh } })
    const url = new URL(result.authorizationUrl)
    if (url.origin !== 'https://accounts.google.com' || url.username || url.password) throw new ApiError(502, 'invalid_provider_redirect')
    return url.href
  }
  async complete(pendingLoginId: string, displayName?: string) {
    const identity = await this.request<SessionIdentity>('identity', '/auth/complete', { method: 'POST', prelogin: true, body: { pendingLoginId, displayName } })
    this.selectSession(identity.accountSessionId); return identity
  }
  async bootstrap(pendingLoginId: string, secret: string) {
    const identity = await this.request<SessionIdentity>('identity', '/setup/complete', { method: 'POST', prelogin: true, body: { pendingLoginId, secret } })
    this.selectSession(identity.accountSessionId); return identity
  }
  async logoutCurrent() { await this.request('identity', '/session/logout-current', { method: 'POST' }); this.selectSession(null) }
  async logoutContainer() { await this.request('identity', '/session/logout-container', { method: 'POST', prelogin: true }); this.selectSession(null) }
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'The request could not be completed. Check your connection and try again.'
  if (error.status === 401) return 'Your session has expired or was revoked. Choose an account or sign in again.'
  if (error.status === 403) return 'Access is unavailable for this account. Privileged actions may require a fresh verified Google sign-in.'
  if (error.status === 412) return 'This application changed. Refresh the current version before deciding or resubmitting.'
  if (error.status === 409) return 'This operation conflicts with the current state. Refresh before continuing.'
  if (error.status === 429) return 'Too many attempts. Wait before trying again.'
  if (error.status === 503) return 'The service is temporarily unavailable. Your completed account and application steps remain saved.'
  if (error.status === 404) return 'This item is no longer available. Refresh or start a new sign-in.'
  return `The request was declined (${error.code}).`
}

export function createBrowserClient() {
  // Property access itself can be denied in privacy modes. Resolve it inside guarded operations.
  return new BrowserClient({
    getItem: key => globalThis.sessionStorage.getItem(key),
    setItem: (key, value) => globalThis.sessionStorage.setItem(key, value),
    removeItem: key => globalThis.sessionStorage.removeItem(key),
  })
}
