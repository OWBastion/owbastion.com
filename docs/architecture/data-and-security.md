# Data and Security Boundaries

## Data ownership

| Store | Responsibility |
| --- | --- |
| D1 | Platform business state such as identities, submissions, OCR metadata, corrections, decisions, grants, drafts, and delivery state |
| R2 | Private evidence and large artifacts such as screenshots, OCR artifacts, training candidates, and reports |
| KV | Cache, rate limits, sessions with backing truth, and short-lived derived results |
| Bastion Git and snapshots | Released game content and version history |

KV and in-memory state must not be the sole source for review status, grants, identity, or player assets. Private objects should use immutable namespaced keys and content hashes.

The implemented foundation stores QQ identifiers and submission source metadata
as private D1 business data. It accepts only authenticated QQBot service calls,
requires an idempotency key for writes, and records write audit events. It does
not expose these identifiers through public views and does not yet persist
evidence objects to R2.

## Access roles

The target role model is:

| Role | Scope |
| --- | --- |
| `visitor` | Public released data |
| `player` | The player's own profile, submissions, progress, and appeals |
| `reviewer` | Evidence review and field correction |
| `content_admin` | Challenge, title, activity, and operational grant management |
| `developer` | Analysis, simulations, drafts, and PR preparation |
| `maintainer` | Release approval, rollback, and role management |

Authorization belongs at the API boundary, not only in the UI. Admin access needs strong authentication, services need separate credentials, privileged actions need immutable audit records, and secrets must never reach frontend bundles.

## Private evidence

Screenshots and review data are private by default. Implementations should validate content type, size, dimensions, and object prefixes; use short-lived signed access for authorized review; rate-limit public writes; detect duplicates; and prevent SSRF when retrieving external attachments.

Logs must not contain screenshot bytes, secrets, signed URLs, or unnecessary private identifiers.

QQ login codes, browser attempt tokens, session tokens, group OpenIDs, and member OpenIDs are private. Only hashes of short-lived login credentials are persisted, and the Portal receives a session cookie only after the platform has verified a code from an enabled group with an existing group-scoped player binding. Login attempts expire after five minutes and are consumed once. `GET /v1/me` exposes only the authenticated player's name, numeric player ID, binding status, and recent player-facing submission fields; QQ identifiers never leave the API boundary.

## Public-repository policy

The repository is public. Do not commit credentials, tokens, production endpoints, private identifiers, user screenshots, internal risk signals, signed URLs, or copied private logs. Public documentation should describe contracts and boundaries, not provide operational access details.
