# OWBastion Web Platform: Agent Work Entry

This is the repository-specific agent entrypoint shared by Codex, Claude Code, and Gemini. Workspace guidance owns shared engineering policy; this file specializes platform ownership, risk routing, local invariants, and validation. Keep `CLAUDE.md` and `GEMINI.md` limited to tool-specific entry behavior.

## Repository role

The repository is `OWBastion/owbastion.com`. The local directory may remain `owbastion.codes`; never infer GitHub ownership from the checkout name.

This repository owns platform business metadata and state, player identities, submissions and private evidence, review/grant orchestration, public/platform APIs, Portal/admin behavior, Git-backed editorial content, and platform persistence.

`OWBastion/Bastion` owns gameplay implementation, game builds/releases, and game-side behavior. `OWBastion/qqbot` owns QQ channel ingress and reply behavior. `OWBastion/ocrkit` owns screenshot-recognition evidence and OCR model lifecycle. Do not move another repository's authoritative responsibility into the platform for implementation convenience.

For cross-repository work, change the authoritative contract at its owner and integrate this repository as a consumer or producer separately.

## Start here

For substantive work:

1. Inspect the worktree, linked Issue, relevant source, and existing tests/evidence before claiming current behavior.
2. Route the task through the indexes below and read only the smallest relevant rule set.
3. Trace business behavior through producer, domain/service ownership, persistence, API/adapters, and consumers as applicable.
4. Compare the Issue contract, current authoritative contract, and current implementation. Report material mismatches rather than resolving product or architecture questions through implementation convenience.
5. Verify at the narrowest decisive surface, then run the broader gates required by the affected risk.

For issue work, verify the actual repository remote before using repository-scoped GitHub commands. Use `Fixes #<number>` only when the change completely resolves the issue; otherwise use `Refs`.

## Rule routing

- Repository orientation: `README.md`, then `docs/README.md`.
- Architecture, package responsibility, or service boundaries: `docs/dev-rules/README.md`, then `docs/dev-rules/architecture-overview.md`.
- Bastion/QQBot/OCRKit integration, submissions, review, grants, or state transitions: `docs/product-rules/README.md`, then `docs/product-rules/integrations-and-workflows.md`.
- Current capability/verification status: `docs/product-rules/README.md`, then `docs/product-rules/feature-status.md`. Do not recreate mutable status inventories in this file.
- Authentication, privacy, credentials, storage, caching, or public/private boundaries: `docs/dev-rules/README.md`, then `docs/dev-rules/data-and-security.md`.
- D1 schema, migrations, fixtures, imports, repair, or reconciliation: `docs/dev-rules/README.md`, then `docs/dev-rules/database-migrations-and-seeds.md`.
- Tests, queues, CI, release behavior, or implementation-change policy: `docs/dev-rules/README.md`, then `docs/dev-rules/testing-and-change-policy.md`.
- Portal UI, components, layout, interaction, motion, accessibility, or copy: root `DESIGN.md`, then `docs/design-rules/README.md` and the routed topic document.
- Product terminology/copy: also read `docs/design-rules/terminology.md` and `docs/design-rules/portal-copy-guidelines.md`.
- Nuxt Content, editorial schemas, Studio/Git publishing, or editorial deployment: applicable development/design indexes plus the relevant runbook under `docs/deployment/`.
- Deployment or production verification: applicable runbook under `docs/deployment/`. Local implementation, integration evidence, deployment, and production business-path verification are distinct states.
- Public API routes/contracts: update and validate `docs/api/openapi.json` with the implementation.

Root `AGENTS.md` is a router and repository-wide invariant source. Module-specific rules belong in nested `AGENTS.md` files when needed; reusable detailed guidance belongs under `docs/`.

## Platform invariants

- Each business fact has one authoritative owner. Do not create parallel sources of truth for identities, metadata, submissions, reviews, grants, or external-service state.
- Business rules belong in domain/database services rather than HTTP or Portal adapters.
- Browser clients must not access D1, R2, OCRKit, Bastion, or Git providers directly.
- Preserve idempotency, auditability, retry behavior, and state consistency for writes and external workflows.
- Preserve private/public separation. Never expose private evidence, credentials, signed URLs, QQ identifiers, internal risk signals, or production logs through public surfaces.
- Administrative approvals, rejections, revocations, and similar decisions must not require a reason or note. Optional audit text may be absent without blocking the decision.
- Applied D1 migrations are forward-only. Migrations contain schema changes and necessary data repair, not routine seed/catalog snapshots or demo/user data.
- An HTTP success, health check, build, deployment, or local integration test does not by itself prove a production business path is working.

## High-risk stop conditions

Re-read the routed specialist rule before changing credentials, authorization/permission boundaries, private evidence handling, production data, historical/applied migrations, public API compatibility, external publishing, or production deployment.

If the requested implementation requires changing another repository's ownership, an unresolved product behavior, public contract semantics, privacy boundary, or migration compatibility policy, report that decision rather than self-authorizing it in code.

Material state-machine, migration, security, public-contract, or cross-service behavior changes should receive independent falsification appropriate to the risk; rerunning the author's tests alone is not sufficient evidence.

## Local validation and delivery

- For code changes, `pnpm check` is the default full local repository gate. If it cannot run, execute the most relevant focused checks and report the exact gap; focused checks do not prove the full gate.
- Use local fakes for external services in normal automated tests. Real QQ, GitHub, OCRKit, deployment, or production checks are separate evidence and may require explicit authorization/configuration.
- Run `pnpm check:migrations` for migration data-write exceptions.
- Use `pnpm db:seed:local` for local fixtures. `pnpm db:import:catalog --snapshot <path>` is for explicit legacy catalog migration/recovery, not Bastion synchronization; never target a remote database unless `--remote` is explicitly intended.
- Before committing, review the task-owned staged diff and run `git diff --cached --check`. Do not stage unrelated files, runtime-generated data, credentials, or private evidence.
- Do not push, publish, deploy, merge, modify remote issues, or perform other external writes unless the user explicitly requested that action.
