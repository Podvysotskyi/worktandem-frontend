# Frontend development

The frontend binds the implemented authentication, company onboarding/review and workspace-access APIs. CRM modules and production deployment remain outside this increment. Existing root README is preserved.

## Workspace

- `apps/main`: public Nuxt app, server-rendered shell, `/`; account/setup/application data are fetched only after browser mount.
- `apps/company`: separate Nuxt app, client-rendered, `/company/`.
- `apps/platform`: separate client-rendered operator app, `/platform/`; independent company review. Restricted reviewer provisioning is a backend API, not an implemented frontend management screen.
- `packages/ui`: shared Nuxt presentation layer with Tailwind 4 tokens, Reka UI button and the approved enterprise navy/blue desktop styling. Components are source-owned.
- `packages/browser`: same-origin typed API transport, per-tab selector hints, separate service CSRF handling and stale-response cancellation.
- Company dependencies include TanStack Query, Table and Form. Workspace reads use Query; forms and the small review queue use native accessible controls. Virtualization is deferred until measured need.

Use Node.js 26 LTS (26.13.0, pinned in `.node-version`) and the pinned pnpm 11.25.0 from `package.json`. Install pnpm separately with `npm install --global pnpm@11.25.0`, or use an existing Corepack installation; Node.js 26 does not bundle Corepack.

```sh
pnpm install --frozen-lockfile
pnpm prepare
pnpm dev:company # terminal 1, port 3001
pnpm dev:platform # terminal 2, port 3002
pnpm dev:main    # terminal 3, port 3000
```

Open `http://localhost:3000/` for the public shell; the main development server forwards `/company` to port 3001 and `/platform` to port 3002. These HTTP development commands do not enable authentication. Protected browser flows need one configured HTTPS origin routing all three Nuxt apps and Gateway as described below. Cross-app links use full document navigation; direct internal app ports are not an authentication/deployment substitute.

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

CI runs workspace lint/tests and separate typecheck/build jobs for each application. Node tests include browser-transport and review rules as well as app-boundary checks. Rendered browser simulator checks and actual backend/isolated-provider checks must be reported separately; neither is live Google verification.

## Production routing contract (not deployed here)

Build all three apps separately and run their `.output/server/index.mjs` entry points on distinct internal ports. Configure one HTTPS origin's reverse proxy in this order:

- `/api/identity/**`, `/api/organization/**` and `/signin-google` to the ASP.NET Gateway. Gateway strips only the explicit API service prefix and exposes an allowlist of public endpoint/method pairs. Internal authority endpoints are not browser routes.
- `/company` and `/company/**` to the company server **without stripping the prefix**; assets are under `/company/_nuxt/`.
- `/platform` and `/platform/**` to the platform server **without stripping the prefix**; assets are under `/platform/_nuxt/`.
- All other public paths to main, including `/setup`, `/auth/continue`, `/accounts` and `/onboarding`. Main assets are under `/_nuxt/`.

Use the backend's documented HTTPS origins, trusted service PKI, protected Data Protection storage, separate migrated databases and actual Google client configuration. Forward cookies without weakening `Secure`, `HttpOnly`, `SameSite` or `__Host-` properties. Incoming identity/forwarded headers are not authority. No Nuxt public configuration contains setup secrets, provider secrets or service credentials. Do not disable internal mutual TLS or server certificate validation to make development sign-in succeed. Backend migration/provisioning and live provider configuration are controlled setup prerequisites, not automatic frontend startup actions.

The browser client stores selector hints only, not bearer credentials, CSRF tokens or entered setup secrets. It clears requests/tokens on selection changes; company Query state is app-scoped and cleared on switches/logout. Server enforcement remains authoritative for account status, review permission and company access. Client rendering does not replace that enforcement. If sensitive SSR is added later, require request-scoped hydration and isolation tests first.

The approved desktop layout uses public welcome composition and separate operator/company shells. Add shared primitives in `packages/ui`, keeping API/account/company state outside that package. `components.json` records the shadcn-vue conventions; review generated imports when adding components.

## Upstream references

- https://nuxt.com/docs/4.x/getting-started/installation
- https://www.shadcn-vue.com/docs/installation/nuxt
- https://tailwindcss.com/docs/installation/using-vite
- https://tanstack.com/query/latest/docs/framework/vue/guides/ssr
- https://tanstack.com/form/latest/docs/framework/vue/quick-start

Versions remain pinned by the lockfile. No production deployment, live Google assurance verification, persistent credential provisioning or operational readiness is claimed by frontend checks.
