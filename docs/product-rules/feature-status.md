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
| QQ binding and verification | `coded` | Administrator invitations resolve the target BattleTag; clean first bindings auto-activate after one QQ confirmation, while conflicts remain reviewable; the platform owns player identity, bindings, login attempts, and sessions | `apps/api/src/app.ts`, `packages/auth`, invitation/claim/session tests, `qqbot/src` | Add deployed invitation-to-session verification |
| Portal QQ login, sessions, and player center | `coded` | Portal renders; API owns identity and sessions | Portal/API tests and session contract code | Add deployed browser-flow verification |
| Portal-only screenshot submission and R2 evidence delivery | `coded` | Portal/API own upload sessions and submission state; player reads remain private while maintainer review reads use the configured R2 CDN origin; QQBot does not create submissions or persist attachments | `apps/portal/pages/submissions`, `apps/api/src/app.ts`, upload contracts, API and Portal tests | Add R2-backed submission integration evidence |
| Map and achievement challenge catalogs | `coded` | Platform owns current map, title, and challenge metadata; maintainers can create global or map-scoped title challenges; Bastion reads it through the Agents API for builds | Catalog API, admin create/edit Portal, challenge-map migration, database and API tests | Add deployed catalog query verification |
| Map title rule model | `coded` | Platform owns a reusable `map_title_rules` entity (one row per kind) with explicit map-variant constraints, per-map exceptions, and map-aware compatibility IDs; `0049` migrates standard rules, `0050` restores the source CLASSIC challenge, `0052` persists its OCR variant, and `0054` materialises variant challenges into the rule projection without changing public IDs or grants | `migrations/0048_map_title_rules.sql`, `migrations/0049_migrate_standard_map_title_rules.sql`, `migrations/0050_migrate_classic_map_title.sql`, `migrations/0052_add_title_challenge_map_variant.sql`, `migrations/0054_materialise_variant_map_title_rules.sql`, `tools/map-title-rule-reconciliation.sql`, `packages/database/src/schema.ts` (mapTitleRules/mapTitleRuleExceptions/mapTitleRuleCompat), `packages/database/src/index.ts` (map-aware resolution, immutable variant snapshots, review/grant audit), `packages/database/src/map-title-rule.test.ts` | Archive pre/post production reconciliation and validate Bastion build-token projections before legacy cleanup |
| Random-event directory and CSV import | `coded` | Platform owns current event metadata, challenge links, CSV validation, and atomic import audit; Bastion reads it through the Agents API for builds | `apps/portal/pages/events`, `apps/portal/pages/admin/events.vue`, event contracts/database code, event tests | Add deployed directory query verification |
| Public Agents content API | `coded` | Public read-only projection over published events, maps, achievements, titles, and public title-holding facts; ordinary requests omit numeric player IDs, while requests carrying the Bastion build token may receive current player display names, stable game player IDs, active title keys, and required map scope; no QQ, submission, review-source, time, or audit data | `/v1/agents/*`, `apps/api/src/public-cache.ts`, Agent contracts/domain/database projections, API tests | Add deployed query and Cache API MISS → HIT verification |
| Achievement title icon management | `coded` | Platform owns title metadata, optional public icon URLs, and private uploaded icon objects; Bastion reads the public metadata projection | `apps/api/src/app.ts`, `apps/portal/pages/admin/achievements.vue`, title icon migrations and tests | Add production asset-path verification |
| QQ group lifecycle and single active group | `coded` | Platform owns group state and command policy; QQBot reports lifecycle events and applies the platform snapshot | `migrations/0026_single_active_qq_group.sql`, group API/Portal code, `qqbot/src`, lifecycle tests | Add deployed group promotion and disconnect verification |
| QQ group policy Outbox push and retry repair | `coded` | Platform records policy changes and delivers signed Queue events; QQBot acknowledges and refreshes its local snapshot | `migrations/0030_qq_group_policy_outbox.sql`, `apps/api/src/worker.ts`, `qqbot/src`, Queue and webhook tests | Add deployed policy delivery and repair verification |
| Global QQ member identity | `coded` | The platform binds one `(provider, memberOpenId)` identity across groups; group OpenIDs remain context and policy scope | `migrations/0029_global_qq_member_open_id.sql`, database/domain code, migration and API tests | Add deployed cross-group identity verification |
| Map-challenge OCR matching | `coded` | OCRKit recognizes; platform compares structured evidence with the selected map, explicit variant constraint, completion, and player; missing or weak classic-variant evidence is rejected | `packages/database/src/ocr-match.ts`, `packages/database/src/ocr-response.ts`, OCR match/quality tests, upload confirmation and Queue workflow code | Add full submission-to-match integration evidence |
| OCR Queue delivery and retry handling | `coded` | Worker owns Queue orchestration and retry state; OCRKit owns recognition | `apps/api/src/worker.ts`, Queue consumer tests, deployment queue setup | Add Queue-to-OCRKit integration evidence |
| OCRKit service authentication and production deployment | `coded` | OCRKit authenticates recognition requests with its service token; the platform Worker is the only caller; deployment uses pinned images and Cloudflare Tunnel | `ocrkit/app/api/routes_ocr.py`, `ocrkit/docker-compose.production.yml`, `ocrkit/docs/production-deployment.md`, `docs/deployment/api-github-actions.md` | Record deployed authenticated OCR request and health evidence |
| Maintainer submission review | `coded` | Platform maintainer surface owns review decisions; OCR is evidence only | Review API, Portal admin tests, contract and database code | Add review end-to-end integration evidence |
| Historical title migration and grants | `coded` | Platform owns historical title records; administrators can explicitly authorize selected unclaimed historical records on a binding invitation, and approved bindings create or reuse map-aware historical Grants idempotently while preserving manual repair paths | Generic Grant API, binding invitation authorization, automatic post-binding migration, `/admin/titles`, `/admin/grants`, audit/idempotency code, binding-flow tests | Add production operational verification |
| New title issuance | `coded` | Platform owns the internal title Grant created atomically with maintainer approval; Bastion release/build state is out of scope | Submission review transaction, generic Grant migration, API and Portal response | Add complete local integration evidence |

No capability is currently marked `production-verified`: this repository does
not contain traceable production end-to-end evidence for these user-facing
chains. Update this table only when such evidence is recorded.
