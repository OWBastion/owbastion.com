# Data and Security Boundaries

## Data ownership

| Store | Current responsibility |
| --- | --- |
| D1 | QQ bindings, player accounts, submissions, upload sessions, attachment metadata, OCR results, review records, idempotency records, audit events, login attempts, sessions, title catalog, achievement challenge rules, map title rewards, historical title snapshots, and auditable player title grants |
| R2 | Private submission evidence when the EVIDENCE_BUCKET binding is configured |
| Bastion Git and snapshots | Released game content and version history; the platform stores an imported immutable catalog snapshot |

The OCR Queue carries only an opaque submission ID, private object key, and
schema version. The consumer resolves the platform evidence bucket from the
Worker configuration and passes it explicitly to OCRKit; OCRKit's default
bucket is not used for platform evidence. The consumer receives the delivery attempt count from Queue
metadata and records it with OCR results. OCR raw output and review decisions
remain in D1; no private screenshot is committed to the repository.

## Implemented service boundary

QQBot service calls require the configured QQBOT_API_TOKEN and receive
channel:write plus channel:read. Binding, submission, and QQ login verification
writes require an idempotency key and record an audit event. Administrative
requests require an authenticated platform session whose player account has
`is_admin` enabled; the Worker validates this independently of Portal UI
visibility. Administrator status changes and binding removals are idempotent
and auditable. Achievement-catalog changes use the same authorization,
idempotency, and audit boundary; they do not permit administrators to modify
the immutable imported Bastion title or map facts.

Portal upload sessions accept only JPEG, PNG, or WebP, limit the body to 10 MiB,
bind the expected byte size and SHA-256, expire after ten minutes, and store
the result under a submission-scoped private R2 key. The upload URL cannot be
reused after completion. It does not expose object keys, source URLs, or QQ
OpenIDs from public status and player endpoints.

## Private login and player data

QQ login codes, attempt tokens, session tokens, group OpenIDs, and member
OpenIDs are private. The database stores hashes of the short-lived attempt
token and code. Login attempts expire after two minutes; a verified browser
session expires after 30 days. The Portal receives a session cookie only after
the platform verifies a code from an enabled group with an existing group-scoped
binding.

GET /v1/me returns only the authenticated player's name, numeric player ID,
binding status, and up to five recent player-facing submissions. The separate
authenticated player-title response returns only the caller's active grants and
the public title and map-scope data needed to display them; it never returns
historical holder names, QQ identities, or audit data. QQ identities, evidence
objects, source URLs, and audit payloads do not cross the API boundary. The
protected administrator surface may read QQ group/member identifiers to operate
bindings; these fields are never returned by public or player APIs.

Historical title holder names are immutable source snapshots, not identity
proof. A player may display a historical title only after a maintainer creates
an active `player_title_grants` record for that account. Grant creation and
revocation are idempotent and auditable; revocation preserves the record and
removes the title from the player-facing result.

## Public-repository policy

The repository is public. Do not commit credentials, tokens, production
endpoints, private identifiers, user screenshots, internal risk signals, signed
URLs, or copied private logs. Public documentation should describe contracts
and boundaries without exposing operational access details.
