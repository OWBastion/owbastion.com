# Feature Status Matrix

This is the single source of truth for the implementation status of platform
capabilities. Other documents may explain boundaries and contracts, but must
not maintain a separate feature-status list.

## Status definitions

| Status | Meaning |
| --- | --- |
| `planned` | The capability is part of the intended product scope, but the repository does not contain the implementation. |
| `coded` | The capability has source implementation and relevant local unit or contract coverage, but no complete integration evidence is recorded. |
| `integration-tested` | The capability has an end-to-end or cross-boundary test using the applicable local fakes or test services. |
| `production-verified` | The capability has traceable evidence from the deployed production path, such as a recorded health check or end-to-end verification. |

CI success, image publication, or deployment completion alone does not qualify
as `production-verified`.

## Current matrix

| Capability | Status | Owner and boundary | Evidence | Next stage |
| --- | --- | --- | --- | --- |
| QQ binding and verification | `coded` | QQBot parses and forwards channel commands; the platform owns player identity, bindings, login attempts, and sessions | `apps/api/src/app.ts`, `packages/auth`, `qqbot/src`, API and QQBot tests | Add deployed QQ binding and browser-login verification |
| Portal QQ login, sessions, and player center | `coded` | Portal renders; API owns identity and sessions | Portal/API tests and session contract code | Add deployed browser-flow verification |
| Portal-only screenshot submission and private evidence storage | `coded` | Portal/API own upload sessions, submission state, and private R2 evidence; QQBot does not create submissions or persist attachments | `apps/portal/pages/submissions`, `apps/api/src/app.ts`, upload contracts, API and Portal tests | Add R2-backed submission integration evidence |
| Map and achievement challenge catalogs | `coded` | Bastion owns released game facts; platform stores imported challenge data and challenge rules | Catalog API, `apps/portal/pages/achievements`, database and API tests | Add import/reconciliation integration evidence |
| Random-event directory and CSV import | `coded` | Bastion owns released event facts; platform owns the public directory, challenge links, CSV validation, and atomic import audit | `apps/portal/pages/events`, `apps/portal/pages/admin/events.vue`, event contracts/database code, event tests | Add catalog import/reconciliation integration evidence |
| Public Agents content API | `coded` | Public read-only projection over published events, maps, achievements, and titles; no player, draft, or administrative data | `/v1/agents/*`, Agent contracts/domain/database projections, API tests | Add deployed query and cache verification |
| Achievement title icon management | `coded` | Platform owns optional public icon URLs and private uploaded icon objects; Bastion owns the underlying title facts | `apps/api/src/app.ts`, `apps/portal/pages/admin/achievements.vue`, title icon migrations and tests | Add production asset-path verification |
| QQ group lifecycle and single active group | `coded` | Platform owns group state and command policy; QQBot reports lifecycle events and applies the platform snapshot | `migrations/0026_single_active_qq_group.sql`, group API/Portal code, `qqbot/src`, lifecycle tests | Add deployed group promotion and disconnect verification |
| QQ group policy Outbox push and retry repair | `coded` | Platform records policy changes and delivers signed Queue events; QQBot acknowledges and refreshes its local snapshot | `migrations/0030_qq_group_policy_outbox.sql`, `apps/api/src/worker.ts`, `qqbot/src`, Queue and webhook tests | Add deployed policy delivery and repair verification |
| Global QQ member identity | `coded` | The platform binds one `(provider, memberOpenId)` identity across groups; group OpenIDs remain context and policy scope | `migrations/0029_global_qq_member_open_id.sql`, database/domain code, migration and API tests | Add deployed cross-group identity verification |
| Map-challenge OCR matching | `coded` | OCRKit recognizes; platform compares structured evidence with the selected challenge and player | `packages/database/src/ocr-match.ts`, OCR match tests, workflow code | Add full submission-to-match integration evidence |
| OCR Queue delivery and retry handling | `coded` | Worker owns Queue orchestration and retry state; OCRKit owns recognition | `apps/api/src/worker.ts`, Queue consumer tests, deployment queue setup | Add Queue-to-OCRKit integration evidence |
| OCRKit service authentication and production deployment | `coded` | OCRKit authenticates recognition requests with its service token; the platform Worker is the only caller; deployment uses pinned images and Cloudflare Tunnel | `ocrkit/app/api/routes_ocr.py`, `ocrkit/docker-compose.production.yml`, `ocrkit/docs/production-deployment.md`, `docs/deployment/api-github-actions.md` | Record deployed authenticated OCR request and health evidence |
| Maintainer submission review | `coded` | Platform maintainer surface owns review decisions; OCR is evidence only | Review API, Portal admin tests, contract and database code | Add review end-to-end integration evidence |
| Historical title migration and grants | `coded` | Bastion owns historical facts; platform records maintainer-confirmed grants | Grant API, Portal admin tests, audit/idempotency code | Add production operational verification |
| Versioned content release plane | `coded` | Platform owns Draft/Change Set/Candidate/Release state; existing admin catalog pages remain the single working-content editor, while release Portal captures and diffs that catalog automatically | `migrations/0034_release_plane.sql`, release contracts/domain service, `/v1/admin/releases/drafts/from-catalog`, `/v1/admin/releases/drafts/{draftId}`, Portal release diff page, `/v1/internal/bastion/*`, Bastion candidate workflow | Add deployed platform-to-Bastion callback evidence |
| New title issuance | `planned` | Bastion remains authoritative for released title issuance | No current implementation | Define release and grant orchestration |
| Bastion/GitHub source change orchestration | `planned` | Bastion owns source and releases; this slice only dispatches deterministic Candidate builds | No source-edit or PR automation is implemented | Define workflow, authorization, and reconciliation contracts |

No capability is currently marked `production-verified`: this repository does
not contain traceable production end-to-end evidence for these user-facing
chains. Update this table only when such evidence is recorded.
