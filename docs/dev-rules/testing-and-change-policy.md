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
- Portal component/page tests cover observable contracts: accessible control
  names, visible values and messages, enabled/disabled state, interaction and
  navigation outcomes, permission-dependent content, and API effects. Prefer
  roles, accessible names, labels, and visible text as locators. Do not assert
  utility classes, internal component props, framework-generated slots, or
  wrapper structure unless that detail is itself an accepted public contract.
  When a component or page calls `useAdminApi` or `usePortalApi` directly,
  fake responses at the fetch boundary instead of replacing the API client.
  This keeps client-side proxy paths, methods, headers, and request options in
  the exercised path while still avoiding live services.
- Vitest + happy-dom is the code-level Portal UI layer. It verifies component
  and page behavior without a browser layout engine; it does not establish that
  CSS layout, viewport fit, clipping, scrolling, focus placement, or overlays
  work at real desktop or mobile sizes.

Normal unit tests must not depend on live external services. Run `pnpm check`
(which executes migration checks, the granular unit/UI suites, typecheck, the
workspace build, and the built Portal SSR smoke) for repository changes.

## Portal built-server integration

`pnpm test:portal-e2e:built` / `apps/portal` `test:e2e` assumes that
`apps/portal/.output` already exists and starts that production server. The
suite verifies SSR output and the browser-facing Portal API proxies against a
fake upstream, including admin/player path composition and request forwarding.
It does not launch a browser and does not depend on Playwright.
`pnpm test:portal-e2e` remains a local convenience wrapper that builds the
Portal once and then runs the built-artifact integration suite. CI keeps those
two commands in the same job so the tests validate the artifact built for that
run.

```bash
pnpm test:portal-e2e
```

## Portal browser verification

`pnpm check` runs Portal component/page tests in happy-dom and the built-server
SSR smoke above. Neither launches a browser. A green `pnpm check` therefore
does not prove responsive layout, overflow, scroll behavior, focus placement,
keyboard dismissal, or dialog/drawer fit.

For a substantive Portal UI change that affects layout or interaction on a
responsive surface, run the local environment with `pnpm dev:local`, sign in
with the seeded local admin or player account, and inspect the affected flow in
Brave at a desktop viewport (1280 × 900) and a mobile viewport (390 × 844).
Choose a route that exercises the changed surface. For example, use an admin
list and its detail/editor for an admin change, or the player map directory and
a map detail or player submission flow for a player-facing change. Inspect both
an admin and a player-facing flow when the change affects both surfaces; these
examples do not require testing an unrelated surface. Check the changed
surface for horizontal overflow, clipped content, usable nested/document
scrolling, overlay fit and dismissal, and keyboard/focus behavior such as Tab
and Escape when those interactions exist. Also exercise affected loading,
empty, error, pagination, and scroll-restoration states where applicable.

This is a risk-based rendered-browser check, not a pixel comparison. Record the
routes, viewport sizes, and behaviors inspected separately from the code-level
test and build results. A substantive layout or interaction change is verified
only after its applicable code-level and rendered-browser evidence is recorded.
Do not add Playwright or another permanent browser runner unless product
requirements change; use Brave computer-use against the local fixtures for
these checks.

## Definition of done

A platform change is complete when the affected source of truth, authorization,
public/private boundary, idempotency behavior, migrations, tests, deployment
expectations, and documentation are updated and verified.
