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
| QQ binding and submission creation | `coded` | `owbastion.codes` owns platform state; QQBot is the channel adapter | `apps/api/src/app.ts`, API tests, D1/R2 service code | Add cross-boundary QQ and storage integration evidence |
| Portal QQ login, sessions, and player center | `coded` | Portal renders; API owns identity and sessions | Portal/API tests and session contract code | Add deployed browser-flow verification |
| Map and achievement challenge catalogs | `coded` | Bastion owns released game facts; platform stores imported challenge data | Catalog API, Portal catalog, database and API tests | Add import/reconciliation integration evidence |
| Player screenshot upload and private evidence storage | `coded` | Platform owns upload sessions and private R2 evidence | Upload validation, object-key, contract, and API tests | Add R2-backed integration evidence |
| OCR Queue delivery and retry handling | `coded` | Worker owns queue orchestration; OCRKit owns recognition | `apps/api/src/worker.ts`, Queue consumer tests, deployment queue setup | Add Queue-to-OCRKit integration evidence |
| Map-challenge OCR matching | `coded` | OCRKit recognizes; platform compares structured evidence with the selected challenge and player | `packages/database/src/ocr-match.ts`, OCR match tests, workflow code | Add full submission-to-match integration evidence |
| Maintainer submission review | `coded` | Platform maintainer surface owns review decisions; OCR is evidence only | Review API, Portal admin tests, contract and database code | Add review end-to-end integration evidence |
| Historical title migration and grants | `coded` | Bastion owns historical facts; platform records maintainer-confirmed grants | Grant API, Portal admin tests, audit/idempotency code | Add production operational verification |
| New title issuance | `planned` | Bastion remains authoritative for released title issuance | No current implementation | Define release and grant orchestration |
| Bastion/GitHub change orchestration | `planned` | Bastion owns source and releases; platform may orchestrate future changes | No current implementation | Define workflow, authorization, and reconciliation contracts |

No capability is currently marked `production-verified`: this repository does
not contain traceable production end-to-end evidence for these user-facing
chains. Update this table only when such evidence is recorded.

