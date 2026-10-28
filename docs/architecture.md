# Frontend architecture conventions

Use feature-based organization as business features arrive. Do not mirror backend Clean Architecture layers mechanically in Nuxt, and do not create empty feature directories just to satisfy a diagram.

## Boundaries

- `apps/main` owns public routes and public-facing composition. `apps/company` owns the company workspace. Neither imports the other app; cross-app navigation is a full document navigation.
- `packages/ui` owns source-shared UI primitives, neutral design tokens, and presentation utilities. It must not import an app, tenant/session state, API clients, or TanStack Query. It is intentionally Vue/Nuxt-aware, not a domain package.
- Future features live under the owning app (for example `app/features/contacts`). Keep feature components, query keys, adapters, and tests together. Routes compose features rather than becoming large business modules. Promote code to a shared package only when it has actual shared consumers and a clear public API.
- Pure business rules and validation utilities must not import Vue, Nuxt, DOM APIs, query libraries, or transport clients. Test these with plain inputs and outputs. Introduce a separate domain package only when real rules warrant one.
- Query adapters own remote/server state. Components own transient UI state. Do not duplicate fetched records into global UI stores; invalidate query keys after successful mutations.
- A future typed BFF transport adapter owns HTTP details and maps responses/errors to feature-facing types. Features must not depend directly on backend persistence models. No transport or authentication is implemented in this scaffold.
- Authentication, authorization, and tenant isolation are server responsibilities, not route middleware or CSR guarantees. Keep query clients app/request scoped and explicitly clear tenant/session data on future identity changes.

## Validation and evolution

Run `pnpm lint`, `pnpm test`, `pnpm typecheck`, and `pnpm build`. The boundary tests guard today's small scaffold only. When adding features, add behavior tests for rules/adapters and browser tests for navigation, errors, repeated actions, and access boundaries. Document cross-cutting decisions before introducing a global store, another package, or a new service dependency.
