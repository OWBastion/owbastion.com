# OWBastion Web Platform: Agent Work Entry

This is the repository-specific agent entrypoint shared by coding agents. [OWBastion organization policy](https://github.com/OWBastion/.github/blob/main/README.md) owns shared engineering, testing, verification, entropy, and delivery policy. This file specializes platform ownership, risk routing, authorization boundaries, and validation. Keep tool-specific entry files limited to tool behavior, and keep mutable feature status out of durable agent guidance.

## Repository role

The repository is `OWBastion/owbastion.com`. The local directory may remain `owbastion.codes`; never infer GitHub ownership from the checkout name.

This repository owns platform business metadata and state, player identities, submissions/private evidence, review/grant orchestration, public/platform APIs, Portal/admin behavior, Git-backed editorial content, and platform persistence.

`OWBastion/Bastion` owns gameplay, Workshop/OverPy source, game builds/releases, and game-side behavior and UI. `OWBastion/qqbot` owns QQ channel ingress/replies. `OWBastion/ocrkit` owns screenshot-recognition evidence and OCR model lifecycle. Do not move another repository's authoritative responsibility into the platform for implementation convenience.

For cross-repository work, change the authoritative contract at its owner and integrate this repository separately as a consumer or producer.

## Platform work

Use [organization agent guidance](https://github.com/OWBastion/.github/blob/main/docs/agent-guidance.md) for shared context and authority rules. For substantive platform changes, trace business behavior through its authoritative service, persistence, API/adapters, and consumers as applicable, using the local rule indexes below.

## Delivery

Follow [organization PR delivery policy](https://github.com/OWBastion/.github/blob/main/docs/pr-delivery.md) and retain this repository's authorization boundaries below.

## Rule routing

- Repository orientation: `README.md`, then `docs/README.md`.
- Architecture/package/service boundaries: `docs/dev-rules/README.md`, then `docs/dev-rules/architecture-overview.md`.
- Bastion/QQBot/OCRKit integration, submissions, review, grants, state transitions: `docs/product-rules/README.md`, then `docs/product-rules/integrations-and-workflows.md`.
- Current capability/verification status: `docs/product-rules/feature-status.md`. Do not recreate mutable status inventories elsewhere.
- Authentication, privacy, credentials, storage, caching, public/private boundaries: `docs/dev-rules/data-and-security.md`.
- D1 schema, migrations, fixtures, imports, repair/reconciliation: `docs/dev-rules/database-migrations-and-seeds.md`.
- Tests, queues, CI, release behavior, or implementation-change policy: `docs/dev-rules/testing-and-change-policy.md`.
- Portal UI/layout/components/interaction/accessibility/copy: root `DESIGN.md`, then `docs/design-rules/README.md` and the routed topic.
- Product terminology/copy: `docs/design-rules/terminology.md` and `docs/design-rules/portal-copy-guidelines.md`.
- Nuxt Content/editorial schemas and Git-backed authoring: relevant development/design indexes; edits use the normal repository workflow.
- Deployment or production verification: applicable `docs/deployment/` runbook. Local implementation, integration evidence, deployment, and production business-path verification are distinct states.
- Public API routes/contracts: update and validate `docs/api/openapi.json` with implementation.

Root `AGENTS.md` is a router and invariant source. Module-specific rules belong in nested `AGENTS.md` when necessary; reusable detail belongs under `docs/`.

## Platform invariants

- Each business fact has one authoritative owner. Do not create parallel truth for identities, metadata, submissions, reviews, grants, or external-service state.
- Business rules belong in domain/database services rather than HTTP or Portal adapters.
- Browser clients must not access D1, R2, OCRKit, Bastion, or Git providers directly.
- Preserve idempotency, auditability, retry behavior, and state consistency for writes and external workflows.
- Preserve private/public separation. Never expose private evidence, credentials, signed URLs, QQ identifiers, internal risk signals, or production logs through public surfaces.
- Administrative approvals, rejections, revocations, and similar decisions must not require a reason/note; optional audit text may be absent.
- Applied D1 migrations are forward-only. Migrations contain schema changes and necessary repair, not routine seed/catalog snapshots or demo/user data.
- HTTP success, health checks, builds, deployments, or local integration tests do not by themselves prove a production business path works.

## Platform verification

Apply the [organization testing policy](https://github.com/OWBastion/.github/blob/main/docs/testing-policy.md) and [verification policy](https://github.com/OWBastion/.github/blob/main/docs/verification-and-acceptance.md). Platform expectations must come from accepted business/API contracts, migration invariants, representative regressions, or observable Portal behavior. Material state-machine, migration, security, privacy, public-contract, or cross-service changes need evidence at the affected platform boundary. Local tests and builds do not establish production behavior.

## High-risk stop conditions

Re-read the routed specialist rule before changing credentials, authorization/permission boundaries, private evidence handling, production data, historical/applied migrations, public API compatibility, external publishing, or production deployment.

If implementation requires changing another repository's ownership, unresolved product behavior, public-contract semantics, privacy boundary, or migration compatibility policy, stop at that decision and route it to the owner rather than self-authorizing it.

## Local validation

- `pnpm check` is the default full local code gate. If it cannot run, execute the decisive focused checks and report the exact gap; focused checks do not prove the full gate.
- Use local fakes for external services in normal automated tests. Real QQ, GitHub, OCRKit, deployment, or production checks are separate evidence and require their own authorization/configuration.
- Run `pnpm check:migrations` for migration data-write exceptions.
- Use `pnpm db:seed:local` for local fixtures. `pnpm db:import:catalog --snapshot <path>` is for explicit legacy migration/recovery, not Bastion synchronization; never target remote D1 unless `--remote` is explicitly intended.
- Before committing, inspect the task-owned staged diff and run `git diff --cached --check`. Do not stage unrelated files, runtime-generated data, credentials, or private evidence.
