# ADR 0001: Platform Technology Stack

- Status: Proposed
- Date: 2026-07-14
- Decision owners: OWBastion maintainers
- Scope: `OWBastion/owbastion.codes`

## Context

`owbastion.codes` is the Bastion web platform and operational control plane. It must support three product surfaces:

1. a public and player-facing portal;
2. a reviewer and administrator application;
3. developer-oriented analysis, draft, validation, and change-orchestration workflows.

The platform also owns durable business state and orchestrates integrations with QQBot, OCRKit, Bastion snapshots, Cloudflare storage, asynchronous work, and GitHub pull requests.

The repository is currently at the architecture and foundation stage. A technology decision is required before creating the monorepo, API contracts, database schema, workers, and web applications.

## Decision

Use a TypeScript-first modular monorepo deployed primarily on Cloudflare.

### Frontend

Use:

- Vue 3;
- Nuxt;
- TypeScript;
- Tailwind CSS;
- Nuxt UI or repository-owned UI primitives;
- Pinia only for durable client-side application state that cannot be represented by route, server, or query state;
- TanStack Query for remote-data fetching, caching, invalidation, and mutation state;
- Playwright for browser-level integration and end-to-end tests.

The target applications are:

```text
apps/
  portal/   public and player-facing Nuxt application
  admin/    reviewer, administrator, and developer Nuxt application
```

The public portal should use server rendering, prerendering, and edge caching where appropriate. The admin application may use more client-side interaction, but must enforce authorization at the API boundary rather than relying on UI visibility.

Vue and Nuxt are selected partly because the existing Bastion title-query interface is already implemented with Vue and Vite. Migration should preserve useful components, data presentation, and interaction patterns rather than rebuilding them in another frontend ecosystem without a measured reason.

### Backend

Use:

- TypeScript;
- Hono for HTTP APIs and Cloudflare Worker entrypoints;
- Cloudflare Workers as the primary application runtime;
- Zod for runtime schemas and validation;
- OpenAPI generated from platform-owned contracts;
- Drizzle ORM and Drizzle Kit for D1 schema access and migrations;
- Vitest for unit, contract, repository, and worker tests.

The target backend structure is:

```text
apps/
  api/                 authenticated Hono API
workers/
  evidence/            attachment retrieval and R2 persistence
  ocr/                 OCRKit orchestration
  grant/               Bastion grant and pull-request orchestration
  snapshot-sync/       released Bastion snapshot import and reconciliation
  notification/        QQ and future channel delivery jobs
```

HTTP routes and queue handlers are adapters. Domain rules, state transitions, authorization policy, and idempotency logic must remain independent from Hono handlers and Cloudflare bindings.

### Platform services

Use Cloudflare services according to the existing ownership contract:

| Capability | Technology | Responsibility |
| --- | --- | --- |
| Business state | Cloudflare D1 | identities, submissions, OCR metadata, corrections, decisions, grants, drafts, and delivery state |
| Private evidence and large artifacts | Cloudflare R2 | screenshots, OCR artifacts, approved training candidates, reports, and selected generated artifacts |
| Asynchronous work | Cloudflare Queues | evidence persistence, OCR, grants, snapshot synchronization, and notifications |
| Cache and short-lived coordination | Cloudflare KV | caches, rate limits, revocable sessions backed by durable truth, and short-lived derived results |
| Access control for privileged web surfaces | Cloudflare Access or equivalent | reviewer, administrator, developer, and maintainer authentication boundary |

KV and process memory must never become the sole source of truth for identities, submissions, review state, grants, player assets, or release state.

### Repository organization

Use a pnpm workspace. Turborepo may be adopted for task orchestration and caching when the initial workspace contains enough packages and applications to justify it; it is not required for the first foundation commit.

Target structure:

```text
apps/
  portal/
  admin/
  api/
workers/
  evidence/
  ocr/
  grant/
  snapshot-sync/
  notification/
packages/
  contracts/
  domain/
  database/
  storage/
  auth/
  bastion-data/
  challenge-rules/
  api-client/
  ui/
docs/
  architecture/
  adr/
  development/
  runbooks/
migrations/
```

Do not create all directories speculatively. Add each application, worker, or package when its first implemented capability requires it.

### Contract ownership

`packages/contracts` is authoritative only for platform-owned contracts, including:

- platform HTTP APIs;
- platform domain events;
- platform queue payloads;
- QQBot-to-platform channel operations.

For external producer contracts, the package contains pinned consumer schemas, generated validators, and compatibility adapters:

- OCRKit remains authoritative for OCR response schemas;
- Bastion remains authoritative for released snapshot schemas;
- QQ remains authoritative for raw platform event formats.

The platform should generate OpenAPI and a TypeScript client for QQBot. QQBot must not maintain an incompatible hand-written copy of the platform API.

### OCR boundary

OCRKit remains a separate Python service using FastAPI, RapidOCR, ONNX Runtime, and OpenCV. The platform does not reimplement OCR in TypeScript.

```text
owbastion.codes worker
→ private, versioned OCRKit API
→ raw OCR evidence stored by the platform
→ deterministic rule evaluation
→ human review or explicitly approved automation policy
```

OCR output is evidence, not an approval decision.

## Consequences

### Positive

- The public portal can reuse and migrate existing Vue-based work.
- Frontend, API, workers, contracts, and QQBot clients share TypeScript tooling.
- Hono and Cloudflare Workers provide a small runtime surface suitable for D1, R2, Queues, and KV.
- Zod and OpenAPI provide runtime validation and generated cross-repository clients.
- The modular monolith avoids premature operational complexity while preserving clear domain boundaries.
- OCR remains isolated in the language and ecosystem best suited to its model and image-processing dependencies.

### Costs and risks

- D1 has different operational and SQL characteristics from a conventional PostgreSQL deployment; migrations and query design require explicit testing.
- Cloudflare bindings can leak into domain code unless adapters are enforced.
- Nuxt server functionality must not become a second, implicit business API beside the Hono application.
- Sharing TypeScript packages does not replace versioned network contracts between independently deployed repositories.
- A single monorepo can still become tightly coupled if package boundaries are not reviewed.

## Guardrails

1. Do not place core business rules directly in Nuxt server routes, Hono route handlers, or Queue consumer functions.
2. Do not use client-side authorization as the security boundary.
3. Do not execute arbitrary user-provided OverPy or shell code in the primary API runtime.
4. Do not access OCRKit directly from QQBot or browser clients.
5. Do not expose D1, R2, KV, Queue, GitHub, or OCR credentials to frontend bundles.
6. Do not use KV or memory as durable business truth.
7. Do not create independently deployed services without a demonstrated scaling, isolation, failure-domain, or security requirement.
8. Do not allow draft platform data to override released Bastion snapshot data in public views.
9. Version API, event, Queue, OCR compatibility, and Bastion snapshot contracts.
10. Keep side effects idempotent, auditable, retry-safe, and reconcilable.

## Alternatives considered

### React and Next.js

Not selected as the default because the existing public query interface uses Vue, and adopting React would create an avoidable migration and maintenance split. This decision may be revisited only with a measured product or staffing reason.

### NestJS on a long-lived Node.js service

Not selected as the default because it adds framework and runtime weight that is not currently justified. It may be reconsidered if future workflows require capabilities that cannot be implemented safely or efficiently on Workers.

### Nuxt server routes as the complete backend

Not selected because it would couple public web rendering to durable business workflows, service authentication, Queue processing, and cross-repository orchestration. Nuxt may use thin server-side rendering helpers, but the Hono API remains the canonical business API.

### Python as the main platform backend

Not selected because the platform benefits from shared TypeScript contracts and clients with the frontend and QQBot. Python remains the correct boundary for OCRKit.

### Early microservices

Not selected. The platform should remain a modular monolith until scaling, isolation, failure-domain, ownership, or security evidence requires another deployable.

### PostgreSQL or Supabase instead of D1

Not selected for the initial platform because the architecture is already centered on Cloudflare and expected load does not currently justify a separate database platform. Migration remains possible if D1 limitations become measured blockers.

## Initial implementation sequence

This ADR authorizes the following foundation work:

1. initialize a pnpm TypeScript workspace;
2. create `packages/contracts`, `packages/domain`, and `packages/database`;
3. create the minimal Hono API application;
4. define versioned QQ binding and submission contracts;
5. create D1 migrations for identities, bindings, submissions, attachments, idempotency, and audit events;
6. add the evidence persistence worker and R2 adapter;
7. generate and integrate the QQBot HTTP client;
8. add Nuxt applications only when the first public or administrative vertical slice is ready.

OCR orchestration, review UI, grants, snapshot import, public portal migration, and balance tooling should follow as separate validated milestones.

## Revisit conditions

Revisit this decision when one or more of the following becomes true:

- D1 limits are demonstrated to block required consistency, query, migration, or reporting behavior;
- Workers runtime limits prevent a required workload after asynchronous decomposition is attempted;
- the portal or admin application requires a frontend capability that Nuxt cannot reasonably provide;
- the modular monolith creates a measured release, security, or ownership bottleneck;
- a separate service is required to isolate untrusted compilation or another high-risk workload;
- maintenance evidence shows that the chosen generated-contract workflow is unreliable.

Any replacement must include a migration plan, compatibility strategy, operational cost analysis, and rollback path.
