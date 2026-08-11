# OWBastion Web Platform: Agent Work Entry

> This file is the canonical project-instruction source shared by Codex,
> Claude Code, and Gemini. Keep `CLAUDE.md` and `GEMINI.md` limited to their
> tool-specific entrypoints and behavior; do not duplicate project rules there.

## Repository boundaries

- The repository is `OWBastion/owbastion.com`. The local directory intentionally
  remains `owbastion.codes` to preserve Codex conversation history. Never infer
  GitHub ownership from the checkout name.
- This repository is the Bastion web platform and operational control plane. It
  contains a Hono Cloudflare Worker API, a Nuxt Portal with Git-backed editorial
  content and an admin-gated Studio, shared contracts/domain/database/auth
  packages, and forward-only D1 migrations.
- This repository owns current event, map, title, and challenge metadata,
  Git-backed Portal editorial content, platform business data, API and Portal
  behavior, private evidence, and review/grant orchestration.
- `OWBastion/Bastion` owns game implementation, builds, releases, and published
  game artifacts. Bastion reads platform metadata through the Agents API and
  does not export a formal content snapshot to this repository.
- `OWBastion/qqbot` owns QQ ingress, deterministic command UX, and channel
  notifications. `OWBastion/ocrkit` owns stateless screenshot recognition and
  model lifecycle. Do not modify sibling repositories unless the user explicitly
  asks for cross-repository work.
- Start every task by inspecting the worktree and relevant source. Preserve
  existing or concurrent changes, and inspect code and tests before claiming
  current behavior.

For issue work, verify `git remote get-url origin` and use
`rtk gh issue view <number> --repo OWBastion/owbastion.com`. When an
implementation completely resolves an issue in this repository, use
`Fixes #<number>`; use `Refs` for related or partial work.

## Rule organization

- Development and engineering rules live in `docs/dev-rules/`.
- Product behavior and cross-service workflows live in `docs/product-rules/`.
- Portal visual, layout, component, interaction, accessibility, motion, and
  content rules live in `docs/design-rules/`. The authoritative topic router is
  `docs/design-rules/DESIGN.md`; root `DESIGN.md` is only the repository entry
  point, and `docs/design-rules/README.md` is the directory governance index.
- Architecture decisions live in `docs/adr/`, deployment and production
  verification runbooks in `docs/deployment/`, and the machine-readable API
  contract in `docs/api/`.
- Root `AGENTS.md` contains only repository-wide rules, risk entrypoints, and
  document routing. Module-specific rules belong in a nested `AGENTS.md` when
  one is needed; reusable specialist guidance belongs under `docs/`.

Read the applicable directory index first, then the smallest relevant set of
documents. Do not recreate feature-status lists or detailed rule copies here.

## Current rule index

- For initial orientation, README work, or a repository overview, read
  `README.md` and `docs/README.md`.
- Before changing architecture, ownership, package responsibilities, or service
  boundaries, read `docs/dev-rules/README.md`, then
  `docs/dev-rules/architecture-overview.md`.
- Before changing QQBot, OCRKit, Bastion, submissions, reviews, grants, or state
  transitions, read `docs/product-rules/README.md`, then
  `docs/product-rules/integrations-and-workflows.md`.
- Before making or verifying a capability-status claim, read
  `docs/product-rules/README.md`, then
  `docs/product-rules/feature-status.md`. The Feature Status Matrix is the only
  implementation and verification status source.
- Before changing authentication, privacy, credentials, storage, caching, or a
  public/private data boundary, read `docs/dev-rules/README.md`, then
  `docs/dev-rules/data-and-security.md`.
- Before changing D1 schema, migrations, fixtures, catalog imports, or data
  repair/reconciliation, read `docs/dev-rules/README.md`, then
  `docs/dev-rules/database-migrations-and-seeds.md`.
- Before changing tests, queues, release behavior, CI, or implementation code,
  read `docs/dev-rules/README.md`, then
  `docs/dev-rules/testing-and-change-policy.md`.
- Before changing any Portal UI, component, layout, style, interaction, motion,
  accessibility behavior, or copy, read root `DESIGN.md`, then
  `docs/design-rules/README.md` and the routed topic documents.
- Before adding or changing Portal copy or product terminology, also read
  `docs/design-rules/terminology.md` and
  `docs/design-rules/portal-copy-guidelines.md`; reuse canonical terms instead
  of inventing variants.
- Before changing Nuxt Content collections, editorial schemas, Blog/Changelog
  surfaces, Studio authentication, Git publishing, or editorial deployment,
  read the applicable development and design indexes plus
  `docs/deployment/portal-studio.md` or
  `docs/deployment/portal-editorial-pilot.md`.
- Before deployment or production verification, read the applicable runbook in
  `docs/deployment/`. Treat local tests, integration evidence, deployment
  success, and production business-path verification as distinct statuses.
- When changing API routes or public contracts, update and validate
  `docs/api/openapi.json` together with the implementation.

## Cross-cutting invariants

- Keep one authoritative owner for each fact. Preserve idempotency, audit
  records, private/public separation, and QQ member-identity semantics.
- Business rules belong in domain/database services, not HTTP or Portal
  adapters. Browser clients must not access D1, R2, OCRKit, Bastion, or Git
  providers directly.
- Administrative approvals, rejections, revocations, and similar decisions must
  not require a reason, note, or other additional input. Audit fields may be
  optional and should record missing input as null/empty without blocking the
  decision.
- Update the relevant authoritative documentation when a change alters a
  contract, data owner, security boundary, operational procedure, or verified
  capability status.

## General workflow

1. Confirm the requested outcome, repository boundary, branch, worktree, and
   current changes.
2. Route the task through the indexes above and read only the relevant rules.
3. Trace the current behavior through producer, consumer, and persisted state;
   read the implementation and tests before deciding what to change.
4. Make the smallest coherent change while preserving user-owned work.
5. Run checks proportional to the affected risk and review the complete diff.
6. Keep local implementation, local integration evidence, deployment, and
   production verification separate in documentation and reporting.
7. Report what changed, what passed, what remains unverified, and any decision
   still required from the user.

## Git and delivery

- For code changes, `pnpm check` is the default full local repository gate. If
  it cannot run, execute the most relevant focused tests/typechecks/builds and
  report the exact gap; focused checks do not prove the full gate.
- Use local fakes for external services in normal tests. Real QQ, GitHub,
  OCRKit, deployment, or production checks are separate evidence and may require
  explicit authorization or configured environments.
- Before committing, review the task-owned staged diff and run
  `git diff --cached --check`. Do not stage unrelated files, generated runtime
  data, credentials, or private evidence.
- Do not push, publish, deploy, merge, modify remote issues, or otherwise perform
  external writes unless the user explicitly requests it.

## Safety gates

- Assume every committed file is public. Never commit secrets, tokens, signed
  URLs, private screenshots, QQ identifiers, internal risk signals, personal
  data, production logs, or copied private payloads.
- Migrations contain schema changes and necessary data repairs only. Do not add
  bulk seed data, catalog snapshots, historical holder records, local accounts,
  or demo submissions to new migrations.
- Use `pnpm db:seed:local` for local fixtures. Use
  `pnpm db:import:catalog --snapshot <path>` only for explicit legacy catalog
  migration or recovery; it is not a Bastion synchronization path. Imports are
  append/update operations, record their source hash, and must never target a
  remote database unless `--remote` is explicitly passed.
- Run `pnpm check:migrations` for migration data-write exceptions. Existing
  historical data migrations must remain listed there, and applied migrations
  are forward-only.
- Stop and re-check the specialist rule before touching credentials, permission
  boundaries, private evidence, production data, historical migrations, or
  external publishing. Do not treat an HTTP 200, health check, build, or deploy
  as proof that the business path succeeded.
