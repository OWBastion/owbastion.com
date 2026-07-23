# AI Agent Guide

> Repository: OWBastion/owbastion.codes  
> Role: Bastion web platform and operational control plane

This repository contains an implemented pnpm TypeScript workspace: a Hono
Cloudflare Worker API, a Nuxt Portal, platform contracts/domain/database/auth
packages, and forward-only D1 migrations. Inspect source and tests before
claiming any behavior; documentation distinguishes implemented slices from
future milestones.

## Required reading by task

| Task | Read first |
| --- | --- |
| General orientation or README work | README.md, docs/README.md |
| Architecture, ownership, or repository shape | docs/architecture/overview.md |
| QQBot, OCRKit, Bastion, submissions, or state transitions | docs/architecture/integrations-and-workflows.md |
| Authentication, privacy, storage, or security | docs/architecture/data-and-security.md |
| Portal UI, components, layout, or visual changes | docs/development/portal-ui-guidelines.md, docs/development/portal-copy-guidelines.md |
| Tests, migrations, queues, release, or implementation changes | docs/development/testing-and-change-policy.md |

## Implemented boundary

The API provides health, QQ binding and submission creation, public submission
status, QQ browser-login attempts and verification, portal session lookup and
logout, plus a group-access route. D1 stores business state and idempotency
records. When EVIDENCE_BUCKET is bound, submission creation retrieves
validated image sources and stores private evidence in R2.

The current runtime authenticator only accepts the QQBot service token and
grants channel:write. The maintainer-protected group-access route exists, but
no maintainer authentication flow is implemented yet. Do not describe that
route as currently operable by maintainers.

OCR orchestration, review decisions, grants, released-snapshot import, admin
applications, queues, and Bastion/GitHub change orchestration remain future
milestones.

## Ownership and working rules

- OWBastion/Bastion owns released game source, content definitions, builds, releases, and public snapshots.
- This repository owns platform business data, API and Portal behavior, private evidence, and future review/grant orchestration.
- OWBastion/qqbot owns QQ ingress, deterministic command UX, and channel notifications.
- OWBastion/ocrkit owns stateless screenshot recognition and model lifecycle.

Keep one authoritative owner for each fact. Preserve idempotency, audit records,
private/public separation, and QQ member-identity semantics. Do not add
business rules to HTTP or Portal adapters, expose credentials or private
identifiers, or make browser clients access D1, R2, OCRKit, or Bastion directly.

## Admin decision constraints

- Authorized administrative decisions (approvals, rejections, revocations, etc.) must not require entering reasons, notes, or any other additional input as a prerequisite.
- Audit fields such as reasons may be provided, but must remain optional; missing inputs should be recorded as null/empty values and must not block administrators from completing decisions.

Database change boundaries are strict: migrations contain schema changes and
necessary data repairs only. Do not add bulk seed data, catalog snapshots,
historical holder records, local accounts, or demo submissions to new
migrations. Use `pnpm db:seed:local` for local-only fixtures and
`pnpm db:import:catalog --snapshot <path>` for an explicit versioned Bastion
catalog import. Catalog imports are append/update operations, record their
snapshot hash, and never run against a remote database unless `--remote` is
passed explicitly. Run `pnpm check:migrations` for migration data-write
exceptions; existing historical data migrations must be listed there.

Assume committed files are public. Never commit secrets, tokens, signed URLs,
private screenshots, QQ identifiers, internal risk signals, personal data,
production logs, or copied private payloads.

Before handoff, run applicable tests, typechecks, and builds; update the
relevant documentation for contract, data-owner, security-boundary, or
operational changes. Use local fakes for external services in normal tests.

## Portal copy guidelines

- For detailed rules, status terminology, and examples, see [`docs/development/portal-copy-guidelines.md`](docs/development/portal-copy-guidelines.md); check this document before modifying Portal copy.
- Use concise, restrained, and specific Chinese for player-facing copy, maintaining an editorial tone consistent with `apps/portal/pages/index.vue` and `apps/portal/pages/me.vue`.
- Prefer short labels, noun phrases, and direct statuses; avoid full explanatory sentences when phrases like "暂无记录" (No records) or "未开放" (Not available) suffice.
- Focus on describing what players can do and see rather than internal process or implementation terms like review, distribution, or publishing.
- Empty states should default to stating current status; provide guidance only when a clear, actionable next step exists.
- Clearly distinguish active, in-progress, unavailable, and future planned features—never describe future features as current capabilities.
- Let headings carry the narrative while body copy adds scope, conditions, or status, avoiding duplicate messaging between heading and body text.
- Use factual descriptions for status copy; avoid exaggerated promises, vague marketing language, or unconfirmed timeline commitments.
- Avoid generic patterns like "Here... will...", "Will be displayed here once available...", or "Record every...", and do not repeat information already clear on the page.
- When adding or modifying Portal copy, reference the existing tone of the home and player center pages to maintain consistent terminology and status boundaries.
