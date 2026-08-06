# Data and Security Boundaries

## Data ownership

| Store | Current responsibility |
| --- | --- |
| D1 | QQ bindings, player accounts, submissions, upload sessions, attachment metadata, OCR results, review records, idempotency records, audit events, login attempts, sessions, title catalog, achievement challenge rules, map catalog metadata, map title rewards, map title rules, map title rule exceptions, map title rule compatibility mappings, historical title snapshots, and auditable player title grants |
| R2 | Submission evidence served through the configured public CDN origin and isolated public achievement icons when the EVIDENCE_BUCKET binding is configured |
| Bastion Git and release artifacts | Game implementation, builds, releases, and published game artifacts; Bastion reads current platform metadata through the Agents API |

The OCR Queue carries only an opaque submission ID, private object key, schema
version, and an optional request-correlation ID. The consumer resolves the platform evidence bucket from the
Worker configuration and passes it explicitly to OCRKit; OCRKit's default
bucket is not used for platform evidence. The consumer receives the delivery attempt count from Queue
metadata and records it with OCR results. OCR raw output and review decisions
remain in D1; result persistence and submission state transitions are
platform-owned, idempotent by request-correlation ID, and committed together.
No private screenshot is committed to the repository.

## Implemented service boundary

QQBot service calls require the configured QQBOT_API_TOKEN and receive
channel:write plus channel:read. Binding, submission, and QQ login verification
writes require an idempotency key and record an audit event. Administrative
requests require an authenticated platform session whose player account has
`is_admin` enabled; the Worker validates this independently of Portal UI
visibility. Administrator status changes and binding removals are idempotent
and auditable. Achievement-catalog changes use the same authorization,
idempotency, and audit boundary; they do not permit administrators to modify
the platform-owned title, map, event, or challenge metadata.

Portal upload sessions accept only JPEG, PNG, or WebP, limit the body to 10 MiB,
bind the expected byte size and SHA-256, expire after ten minutes, and store
the result under a submission-scoped private R2 key. The upload URL cannot be
reused after completion. It does not expose object keys, source URLs, or QQ
OpenIDs from public status and player endpoints.

Player submission detail and evidence reads require the Portal session and
verify that the submission belongs to the current player account. Player
evidence URLs are returned only after that check; the image itself is served
from the configured CDN. Admin review details
return the R2 object URL under the configured public custom domain; access to
that URL is bearer-style and depends on the opaque submission UUID and content
hash in the object key. Player detail responses use the same CDN URL only after
the API verifies ownership. Both Portal surfaces send the weak
`x-owbastion-review` source header; WAF validation of that header is not an
authorization mechanism. The
player-facing OCR summary contains only recognized map, difficulty, player, and
completion values; raw OCR output and internal match details remain private.

Player ratings are D1-owned records keyed by the authenticated player account
and a stable event/map target. The account association, audit events, hidden
comment state, withdrawn rows, and invalidated rows remain private platform
data. Anonymous display is only a public presentation preference; it never
removes the internal account association. Rating aggregates exclude withdrawn
and invalidated rows, while comment hiding does not remove a rating from the
aggregate.

Public review reads use separate summary and comment projections. Single-target
summaries, bounded batches, and paginated comments return only rating facts,
comment text, creation time, and either an approved public display name or no
author for anonymous reviews. They never return review IDs, player account or
numeric game IDs, QQ identities, session fields, moderation state, or audit
payloads. These responses remain `private, no-store` because review state is
not shared through public HTTP cache boundaries.

## Private login and player data

QQ login codes, attempt tokens, session tokens, group OpenIDs, and member
OpenIDs are private. The database stores hashes of the short-lived attempt
token and code. Invitation codes are hashed for verification and encrypted at
rest for maintainer re-copy, are single-use, target one BattleTag, and expire
after seven days. A maintainer can revoke only an unused, unexpired invitation;
the reason is retained in the audit record and revocation takes effect
immediately. Invitation confirmation codes expire after two minutes; a clean
first invitation activates a binding automatically after the platform verifies
a code from an enabled group, while conflicts remain under maintainer review.
Login attempts expire after two minutes; a verified browser session expires
after 30 days. The Portal receives a session cookie only after the platform
verifies both the completed claim and the original browser claim capability.

GET /v1/me returns only the authenticated player's name, numeric player ID,
binding status, and up to five recent player-facing submissions. The separate
authenticated player-title response returns only the caller's active grants and
the public title and map-scope data needed to display them; it never returns
historical holder names, QQ identities, or audit data. QQ identities, evidence
objects, source URLs, and audit payloads do not cross the API boundary. The
protected administrator surface may read QQ group/member identifiers to operate
bindings; these fields are never returned by public or player APIs.

The public Agents projection is a separate title-fact boundary. Ordinary
responses omit numeric player IDs. Requests carrying the dedicated Bastion
build token may return the current player display name, stable game player ID,
active title keys, and the map scope required to generate Bastion's in-game
title database. These are limited game facts, not a player account or review
record. Agents responses must not include QQ identifiers, submission
identifiers or content, review sources, timestamps, audit payloads, runtime
analytics, or revoked and historical title grants.

Historical title holder names are immutable source snapshots, not identity
proof. `player_title_grants` is the single entitlement table: each record
stores the player, stable `title_key`, optional map context, source (`historical`,
`submission`, `manual`, or `automatic`), source ID, and revocation fields.
Active uniqueness prevents a player from holding the same title in the same
scope twice. Grant creation and revocation are idempotent and auditable;
revocation preserves the record and removes the title from the player-facing
result. Manual grants use `source_type = manual` and never create a Submission
or Review record; they may target retired titles when explicitly selected by a
maintainer.

## Public-repository policy

The repository is public. Do not commit credentials, tokens, production
endpoints, private identifiers, user screenshots, internal risk signals, signed
URLs, or copied private logs. Public documentation should describe contracts
and boundaries without exposing operational access details.
