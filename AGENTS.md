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
private/public separation, and group-scoped QQ identity semantics. Do not add
business rules to HTTP or Portal adapters, expose credentials or private
identifiers, or make browser clients access D1, R2, OCRKit, or Bastion directly.

Assume committed files are public. Never commit secrets, tokens, signed URLs,
private screenshots, QQ identifiers, internal risk signals, personal data,
production logs, or copied private payloads.

Before handoff, run applicable tests, typechecks, and builds; update the
relevant documentation for contract, data-owner, security-boundary, or
operational changes. Use local fakes for external services in normal tests.

## Portal 文案约定

- 面向玩家使用简洁、克制、具体的中文，保持与 `apps/portal/pages/index.vue` 和 `apps/portal/pages/me.vue` 一致的编辑化语气。
- 优先描述玩家能做什么、能看到什么，少使用审核、发放、发布等内部流程和实现术语。
- 明确区分已开放、处理中、未开放和未来规划，不把未来功能写成当前能力。
- 让标题承担叙事，说明文字补充范围、条件或状态，避免标题与说明重复表达同一件事。
- 状态文案使用事实描述，不使用夸张承诺、模糊营销语或未确认的时间承诺。
- 新增或修改 Portal 文案时，先参考首页和玩家中心的现有语气，再保持同一套用词和状态边界。
