import { ApiError, createBrowserClient } from '@worktandem/browser'
import { nextTick, onBeforeUnmount, onMounted } from 'vue'

export function mainClient() { return createBrowserClient() }
// Clear private state before the browser can freeze a history entry, and reveal it
// only after a restored page has revalidated against the server. Hiding the main
// element synchronously also prevents an old DOM snapshot flashing before Vue flushes.
export function usePrivatePageLifecycle(clear: () => void, restore: () => void | Promise<void>) {
  const hide = () => { clear(); document.querySelector('main')?.setAttribute('hidden', '') }
  const show = async (event: PageTransitionEvent) => {
    if (!event.persisted) return
    try { await restore() }
    finally { await nextTick(); document.querySelector('main')?.removeAttribute('hidden') }
  }
  onMounted(() => { window.addEventListener('pagehide', hide); window.addEventListener('pageshow', show) })
  onBeforeUnmount(() => { window.removeEventListener('pagehide', hide); window.removeEventListener('pageshow', show) })
}
export function aborted(error: unknown) { return error instanceof DOMException && error.name === 'AbortError' }
export function problemMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'The connection was interrupted. Retry the same action, or refresh to recover its result.'
  const messages: Record<string, string> = {
    setup_required: 'Platform setup must be completed before registration is available.',
    setup_unavailable: 'Platform setup is unavailable. The operator must verify server configuration and Google assurance prerequisites.',
    invalid_setup: 'Setup could not be completed. Check the secret, fresh Google verification and whether setup has already completed.',
    invalid_login_proof: 'This sign-in has expired or was already completed. Choose an existing session or sign in again.',
    registration_required: 'This Google identity has no Worktandem account. Start a new registration to continue.',
    invalid_display_name: 'Enter a display name between 1 and 200 characters.',
    account_unavailable: 'This account is unavailable. Choose another account or contact the platform operator.',
  }
  return messages[error.code] ?? (error.status === 401 ? 'Your session has expired or been revoked. Choose an account or sign in again.'
    : error.status === 403 ? 'You do not have access to this action. Choose another account or refresh your verification.'
      : error.status === 404 ? 'This record is unavailable, expired or belongs to another account.'
        : error.status === 409 || error.status === 412 ? 'The record changed or this action conflicts with its current state. Refresh before continuing.'
          : error.status === 422 ? 'Check the form fields and try again.'
            : error.status === 429 ? 'Too many attempts. Wait before trying again.'
              : error.status >= 500 ? 'The service is temporarily unavailable. Your account and applications are preserved. Try again later.'
                : 'The action could not be completed. Refresh and try again.')
}
export function focusProblem() { window.setTimeout(() => document.querySelector<HTMLElement>('[role="alert"]')?.focus(), 0) }
export function pendingId(): string | null {
  const url = new URL(window.location.href)
  const value = url.searchParams.get('pendingLogin')
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return null
  url.searchParams.delete('pendingLogin')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  return value
}
