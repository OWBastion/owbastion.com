# AI Agent Guide

> Repository: OWBastion/owbastion.codes  
> Role: Bastion web platform and operational control plane

This repository contains an implemented pnpm TypeScript workspace: a Hono
Cloudflare Worker API, a Nuxt Portal, platform contracts/domain/database/auth
packages, and forward-only D1 migrations. Inspect source and tests before
claiming any behavior; documentation distinguishes implemented slices from
future milestones.

## Rule organization

- Development and engineering rules live in `docs/dev-rules/`.
- Product behavior and experience rules live in `docs/product-rules/`.
- UI visual, interaction, accessibility, and content design rules live in
  `docs/design-rules/`. The authoritative design text is `DESIGN.md` in that
  directory; root `DESIGN.md` is only the entry redirect, and the directory
  index is `docs/design-rules/README.md`.
- The root `AGENTS.md` keeps only rules that apply to all tasks, risk entry
  points, and the rule indexes. Directory indexes decide which specific
  documents an agent must read for a task.
- Architecture decisions live in `docs/adr/`, deployment and production
  verification runbooks live in `docs/deployment/`, and the machine-readable
  API contract lives in `docs/api/`.

## Rule index by task

| Task | Read first |
| --- | --- |
| General orientation or README work | README.md, `docs/README.md` |
| Architecture, ownership, or repository shape | `docs/dev-rules/` index |
| QQBot, OCRKit, Bastion, submissions, or state transitions | `docs/product-rules/` index |
| Authentication, privacy, storage, or security | `docs/dev-rules/` index |
| Portal UI, components, layout, or visual changes | `DESIGN.md`, `docs/design-rules/` index |
| Capability implementation or verification status | `docs/product-rules/` index |
| Tests, migrations, queues, release, or implementation changes | `docs/dev-rules/` index |

Read the applicable directory index first, then follow its document table to
the smallest relevant set of rules. Do not recreate a second task-specific
document list in this file.

## Implementation status

Implementation and verification status for all platform capabilities are
maintained solely in the Feature Status Matrix identified by the
`docs/product-rules/` index. Do not maintain a separate feature-status list in
`AGENTS.md` or other documentation files to prevent documentation drift.

## Ownership and working rules

- This repository owns current event, map, title, and challenge metadata, plus platform business data, API and Portal behavior, private evidence, and review/grant orchestration.
- OWBastion/Bastion owns game implementation, builds, releases, and published game artifacts; Bastion reads platform metadata through the Agents API and does not export a formal content snapshot to this repository.
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
`pnpm db:import:catalog --snapshot <path>` only for explicit legacy catalog
migration or recovery. It is not a Bastion synchronization path. Such imports
are append/update operations, record their source hash, and never run against a
remote database unless `--remote` is passed explicitly. Run
`pnpm check:migrations` for migration data-write exceptions; existing historical
data migrations must be listed there.

Assume committed files are public. Never commit secrets, tokens, signed URLs,
private screenshots, QQ identifiers, internal risk signals, personal data,
production logs, or copied private payloads.

Before handoff, run applicable tests, typechecks, and builds; update the
relevant documentation for contract, data-owner, security-boundary, or
operational changes. Use local fakes for external services in normal tests.

## Portal copy guidelines

- Before adding or modifying any Portal copy, read `docs/design-rules/terminology.md` first and reuse its canonical terms.
- For detailed rules, status terminology, and examples, follow the
  `docs/design-rules/` index; check the authoritative `DESIGN.md` there before
  modifying Portal UI or copy.
- Use concise, restrained, and specific Chinese for player-facing copy, maintaining an editorial tone consistent with `apps/portal/pages/index.vue` and `apps/portal/pages/me.vue`.
- Prefer short labels, noun phrases, and direct statuses; reuse the established copy vocabulary instead of adding explanatory sentences when a short status label is sufficient.
- Focus on describing what players can do and see rather than internal process or implementation terms like review, distribution, or publishing.
- Empty states should default to stating current status; provide guidance only when a clear, actionable next step exists.
- Clearly distinguish active, in-progress, unavailable, and future planned features; never describe future features as current capabilities.
- Let headings carry the narrative while body copy adds scope, conditions, or status, avoiding duplicate messaging between heading and body text.
- Use factual descriptions for status copy; avoid exaggerated promises, vague marketing language, or unconfirmed timeline commitments.
- Avoid generic patterns like "Here... will...", "Will be displayed here once available...", or "Record every...", and do not repeat information already clear on the page.
- When adding or modifying Portal copy, reference the existing tone of the home and player center pages to maintain consistent terminology and status boundaries.
