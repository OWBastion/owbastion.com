# Testing and Change Policy

## Authoritative sources

- Capability and verification status: [feature status matrix](../product-rules/feature-status.md).
- Local setup and workspace commands: [repository README](../../README.md).
- Migration rules and operational steps: [database migrations and seeds](database-migrations-and-seeds.md).
- Deployment configuration and administrator bootstrap: [API deployment guide](../deployment/api-github-actions.md).
- Public API request and response contracts: [OpenAPI document](../api/openapi.json).

Resolve mutable status and detailed operational instructions from these owners;
do not duplicate capability inventories here.

## Before implementation

For a non-trivial change, identify:

- product area and owner of each fact;
- affected API, database, storage, queue, and external contracts;
- authorization and data classification;
- idempotency, retry, and state-transition behavior;
- rollback or reconciliation behavior.

Keep domain logic independent from HTTP and storage adapters. Add migrations,
tests, and runbooks with operational changes. Avoid broad framework rewrites
without an architecture decision record.

## Testing layers

- Unit and contract tests for observable API, Portal, and package behavior.
- D1 migration and repository tests when persistence changes.
- Title-grant tests for account isolation, map and global title scope, manual
  grant validation and idempotency, manual batch Cartesian expansion and cell
  cap, duplicate normalization, mixed created/already-owned outcomes, empty
  results, duplicate historical-holder associations, explicit invitation
  authorization, automatic clean-binding migration, conflict/retry handling,
  revocation, administrator authorization, idempotency, and audit records.
- Achievement-management tests for maintainer authorization, three-state
  validation, idempotency replay and conflicts, audit records, immediate
  title-rule updates, planned retirement versions, reopening, and the
  preservation of in-flight submissions after retirement. Scheduled title
  challenges must also be tested before, during, and after their time window.
- Integration tests with fake R2, OCR, GitHub, and QQ clients as those
  integrations are introduced.
- Queue redelivery, review, grant, and end-to-end tests for submission approval,
  including rollback and idempotent replay.
- Review integration tests must cover both event and map targets through the
  D1-backed player, public, and maintainer projections, including update,
  withdrawal, comment moderation, whole-review invalidation/restore, aggregate
  changes, privacy-negative responses, and idempotent replay without duplicate
  rows or audit effects.
- Security tests for authorization, SSRF, file validation, and private-data
  exposure.
- Local authentication fixtures do not represent QQ authentication. Tests that
  exercise real invitation confirmation, QQ webhooks, or QQ gateway behavior
  require a test QQ application and its credentials.
- Portal built-server SSR smoke (`pnpm test:portal-e2e:built` after
  `pnpm build:portal`): home HTML from the existing Nuxt production artifact
  via `@nuxt/test-utils/e2e` with `browser: false`.
- Portal UI interaction and responsive behavior: prefer Vitest + happy-dom
  component/page tests. Real browser checks (viewport overflow, Tab/Escape/focus,
  Modal/Drawer, reduced preferences) are manual or agent computer-use against
  local fixtures — not a code-level Playwright suite.

Normal unit tests must not depend on live external services. Run `pnpm check`
(which executes migration checks, the granular unit/UI suites, typecheck, the
workspace build, and the built Portal SSR smoke) for repository changes.

## Portal SSR smoke

`pnpm test:portal-e2e:built` / `apps/portal` `test:e2e` assumes that
`apps/portal/.output` already exists, starts that production server, and asserts
the home page SSR HTML. It does not launch a browser and does not depend on
Playwright. `pnpm test:portal-e2e` remains a local convenience wrapper that
builds the Portal once and then runs the built-artifact smoke. CI keeps those
two commands in the same job so the smoke validates the artifact that was
built for that run.

```bash
pnpm test:portal-e2e
```

Do not reintroduce Playwright or a full browser regression runner in-repo
unless product requirements change; use component tests and computer-use for
viewport/focus/dialog checks.

## Definition of done

A platform change is complete when the affected source of truth, authorization,
public/private boundary, idempotency behavior, migrations, tests, deployment
expectations, and documentation are updated and verified.
