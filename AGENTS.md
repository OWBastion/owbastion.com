# OWBastion Web Platform: Agent Work Entry

This is the repository-specific agent entrypoint shared by coding agents. Workspace guidance owns shared engineering policy; this file specializes platform ownership, risk routing, authorization boundaries, and validation. Keep tool-specific entry files limited to tool behavior, and keep mutable feature status out of durable agent guidance.

## Repository role

The repository is `OWBastion/owbastion.com`. The local directory may remain `owbastion.codes`; never infer GitHub ownership from the checkout name.

This repository owns platform business metadata and state, player identities, submissions/private evidence, review/grant orchestration, public/platform APIs, Portal/admin behavior, Git-backed editorial content, and platform persistence.

`OWBastion/Bastion` owns gameplay implementation and game builds/releases. `OWBastion/qqbot` owns QQ channel ingress/replies. `OWBastion/ocrkit` owns screenshot-recognition evidence and OCR model lifecycle. Do not move another repository's authoritative responsibility into the platform for implementation convenience.

For cross-repository work, change the authoritative contract at its owner and integrate this repository separately as a consumer or producer.

## Work from intent, not repeated setup

A short request such as `implement #123`, `fix #123`, or `review #123` is sufficient. Resolve the smallest relevant repository context yourself; the user should not need to repeat rule paths or skill names.

For substantive work:

1. Inspect the worktree, linked Issue, relevant source, tests, and existing evidence before claiming current behavior.
2. Route through the indexes below and load only the smallest relevant rule set.
3. Trace affected business behavior through its authoritative owner, persistence, API/adapters, and consumers as applicable.
4. Compare the Issue contract, current authoritative contract, and implementation. Surface material mismatches instead of deciding unresolved product, architecture, compatibility, privacy, or ownership questions through implementation convenience.
5. Implement the smallest complete coherent change and verify the narrowest decisive surface first, then broader gates required by the risk.
6. Re-evaluate the requested goal after verification and continue until it is delivered or a concrete blocker remains.

For issue work, verify the actual repository remote before repository-scoped GitHub commands. Use `Fixes #<number>` only when the change completely resolves the issue; otherwise use `Refs`.

## Repository delivery constraints

Implementation/fix work normally uses a non-default branch and PR unless explicitly local-only. PR review results belong on the PR rather than only in chat, and review-fix work includes thread/re-review handoff. Never push implementation commits directly to the default branch. Merge, deployment, production data mutation, external publication, destructive operations, secrets changes, and material scope expansion remain separate authorization boundaries.

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
- Nuxt Content/editorial schemas/Studio/Git publishing: relevant development/design indexes and runbooks under `docs/deployment/`.
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

## Verification: correctness and necessity

Tests and expected results need an independent basis: accepted business/API contract, migration invariant, representative regression, observable UI behavior, or other owner-side evidence. Do not rewrite expectations merely to match a new implementation, and do not treat test counts or CI green status as proof of correctness.

Material state-machine, migration, security, public-contract, privacy, or cross-service changes should receive an independent attempt to falsify the claimed behavior. State the claim and choose a check that would fail if it were false; where practical, remove or invert the key condition and confirm the targeted regression returns. Rerunning the author's test is not independent evidence.

Separately, perform one simplification/ablation pass for substantive design or implementation work. Try removing, deferring, inlining, or merging new persistent mechanisms—state, fields, services, adapters, flags, compatibility paths, or cross-repository contracts—while preserving the accepted requirement. Keep complexity only when the simpler form breaks a current contract, constraint, or real workflow. Ablation tests necessity, not correctness.

Do not add production APIs, permanent hooks, state, or architecture layers solely to make tests convenient.

## High-risk stop conditions

Re-read the routed specialist rule before changing credentials, authorization/permission boundaries, private evidence handling, production data, historical/applied migrations, public API compatibility, external publishing, or production deployment.

If implementation requires changing another repository's ownership, unresolved product behavior, public-contract semantics, privacy boundary, or migration compatibility policy, stop at that decision and route it to the owner rather than self-authorizing it.

## Local validation

- `pnpm check` is the default full local code gate. If it cannot run, execute the decisive focused checks and report the exact gap; focused checks do not prove the full gate.
- Use local fakes for external services in normal automated tests. Real QQ, GitHub, OCRKit, deployment, or production checks are separate evidence and require their own authorization/configuration.
- Run `pnpm check:migrations` for migration data-write exceptions.
- Use `pnpm db:seed:local` for local fixtures. `pnpm db:import:catalog --snapshot <path>` is for explicit legacy migration/recovery, not Bastion synchronization; never target remote D1 unless `--remote` is explicitly intended.
- Before committing, inspect the task-owned staged diff and run `git diff --cached --check`. Do not stage unrelated files, runtime-generated data, credentials, or private evidence.
