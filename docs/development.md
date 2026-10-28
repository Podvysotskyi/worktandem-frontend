# Frontend development

This is a scaffold, not an implemented CRM. Existing root README is preserved.

## Workspace

- `apps/main`: public Nuxt app, server-rendered, `/`.
- `apps/company`: separate Nuxt app, client-rendered, `/company/`.
- `packages/ui`: shared Nuxt layer, neutral Tailwind 4 tokens and a shadcn-vue-style Reka UI button. Components are source-owned, not a separate hosted component service.
- Company dependencies include TanStack Query, Table and Form. Only Query is initialized; real data tables and validated forms wait for domain/API contracts. Virtual is intentionally deferred until measured need.

Use Node 24 and the pinned pnpm version from `package.json` (Corepack or install pnpm separately).

```sh
pnpm install --frozen-lockfile
pnpm prepare
pnpm dev:company # terminal 1, port 3001
pnpm dev:main    # terminal 2, port 3000
```

Open `http://localhost:3000/`; the main development server forwards `/company` to port 3001. The company app is also directly accessible at `http://localhost:3001/company/`. Cross-app links deliberately use full document navigation rather than either app's client router.

```sh
pnpm lint
pnpm test
pnpm typecheck
pnpm build
```

CI runs workspace lint/tests and separate typecheck/build jobs for each application. The small Node test guards scaffold boundaries; it is not business-feature coverage.

## Production routing contract (not deployed here)

Build both apps separately and run their `.output/server/index.mjs` entry points on distinct internal ports. Configure one origin's reverse proxy to route `/company` and `/company/**` to the company server **without stripping the prefix**, and all other public paths to main. Company assets live under `/company/_nuxt/` and main assets under `/_nuxt/`. Route the future `/api/**` and auth endpoints to the shared BFF before the main fallback.

Authentication, BFF integration, authorization, tenant resolution, and API calls are not implemented. Client rendering is not access control. Do not expose private data until server-side authentication and tenant authorization are implemented. No session is simulated and no credentials are stored. The QueryClient is created inside the company Nuxt plugin, never as a shared module-level cache. If SSR is enabled later, add request-scoped query hydration and tests proving isolation.

The theme is deliberately neutral, not a finalized brand. Add shared UI components in `packages/ui`, not app-local duplicates. `components.json` records the shadcn-vue conventions; review generated imports when adding components to the shared layer.

## Upstream references

- https://nuxt.com/docs/4.x/getting-started/installation
- https://www.shadcn-vue.com/docs/installation/nuxt
- https://tailwindcss.com/docs/installation/using-vite
- https://tanstack.com/query/latest/docs/framework/vue/guides/ssr
- https://tanstack.com/form/latest/docs/framework/vue/quick-start

Versions are resolved from the official npm registry and pinned by the lockfile. No Docker or deployment manifests are claimed as validated in this scaffold.
