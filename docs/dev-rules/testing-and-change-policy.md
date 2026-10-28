# Testing and Change Policy

Setup and commands: [README](../../README.md). Migrations:
[database-migrations-and-seeds.md](database-migrations-and-seeds.md). Deployment
and admin bootstrap: [api-github-actions.md](../deployment/api-github-actions.md).
API contracts: [openapi.json](../api/openapi.json). Status lives in Issues, PRs,
and CI.

## Before implementing

Identify: the owner of each fact; affected API, database, storage, queue, and
external contracts; authorization and data classification; idempotency, retry,
and state-transition behavior; rollback or reconciliation. Keep domain logic
independent of HTTP and storage adapters. Ship migrations, tests, and runbooks
with operational changes. No broad framework rewrite without an ADR.

## Tests

Follow the [organization testing policy](https://github.com/OWBastion/.github/blob/main/docs/testing-policy.md).
A durable test protects a business/API/UI contract, state transition,
idempotency/retry invariant, privacy/security boundary, migration invariant, or a
real regression, not the current internal shape. Assert at public/domain
boundaries with representative inputs.

- Unit and contract tests for API, Portal, and package behavior; D1 and
  repository tests when persistence changes.
- High-risk workflows (submission/review, grants, title administration) cover:
  authorization and scope isolation, state transitions, idempotent replay and
  queue redelivery, conflict/rollback, privacy-negative projections, and
  time-window edges.
- Integration tests use fake R2, OCR, GitHub, and QQ clients; unit tests never
  depend on live services. Real QQ flows need a test QQ app and credentials.
- Portal component/page tests assert accessible names, visible text, state,
  navigation, permissions, and API effects; locate by role/name/label/text. Never
  assert utility classes, internal props, slots, or wrapper structure.
- Vitest + happy-dom has no layout engine: it does not prove CSS layout, overflow,
  scroll, focus, or overlays.
- `pnpm test:portal-e2e:built` starts the existing `.output` production server and
  asserts home-page SSR HTML (no browser, no Playwright). Run after
  `pnpm build:portal`; `pnpm test:portal-e2e` builds first.
- `pnpm check` is the full gate (migrations, style lint, unit/UI suites,
  typecheck, build, SSR smoke).

## Rendered-browser check

For a Portal change to layout or interaction, run `pnpm dev:local`, sign in with
the seeded admin or player, and inspect the changed flow in Brave at 1280x900 and
390x844 (both admin and player flows if both change). Check overflow, clipping,
scrolling, overlay fit/dismissal, Tab/Escape focus, and affected loading, empty,
error, pagination, and scroll-restoration states. Record routes, viewports, and
behaviors separately from test results. Do not add a permanent browser runner.

## Done

Source of truth, authorization, public/private boundary, idempotency, migrations,
tests, deployment expectations, and docs are updated and verified.
