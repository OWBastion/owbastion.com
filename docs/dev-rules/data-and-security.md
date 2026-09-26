# Data and Security Boundaries

## Data ownership

| Store | Current responsibility |
| --- | --- |
| D1 | Player Accounts, Passkey public credentials and counters, one-time authentication/registration challenges, recovery grants, direct Portal sessions, optional QQ bindings, submissions, upload sessions, attachment metadata, OCR results, verified mastery runs and lifecycle events, review records, idempotency records, audit events, title catalog, achievement challenge rules, map catalog metadata, map title rewards, map title rules, map title rule exceptions, map title rule compatibility mappings, historical title snapshots, and auditable player title grants |
| R2 | Submission screenshots served as unlisted CDN assets, plus isolated public achievement icons served by their explicit public API route when the EVIDENCE_BUCKET binding is configured |
| Bastion Git and release artifacts | Game implementation, builds, releases, and published game artifacts; Bastion reads current platform metadata through the Agents API |

The OCR Queue carries only an opaque submission ID, object key, schema version,
and an optional request-correlation ID. The Worker verifies that the key is the
stored attachment for that Submission, reads that object through its R2 binding,
and sends only its bytes to OCRKit's authenticated multipart endpoint. OCRKit
receives neither the object key nor access to the platform evidence bucket. The
consumer receives the delivery attempt count from Queue metadata and records it
with OCR results. OCR raw output and review decisions remain in D1; result
persistence and submission state transitions are platform-owned, idempotent by
request-correlation ID, and committed together.
No private screenshot is committed to the repository.

## Platform trust boundaries

QQBot service calls require the configured QQBOT_API_TOKEN and receive
channel:write plus channel:read. Binding and submission writes require an
idempotency key and record an audit event. QQ verification may attach a channel
binding only to an existing active Player Account and cannot create an account.
A verified QQ login attempt authenticates only the Player Account of the active
binding for that QQ member. Administrative
requests require an authenticated platform session whose player account has
`is_admin` enabled; the Worker validates this independently of Portal UI
visibility. Administrator status changes and binding removals are idempotent
and auditable. Achievement-catalog changes use the same authorization,
idempotency, and audit boundary. Authorized administrators may modify
platform-owned title, map, event, and challenge metadata through the platform's
audited workflows; those workflows do not authorize changes to Bastion-owned
game implementation, builds, releases, or published game artifacts.

Portal upload sessions accept only JPEG, PNG, or WebP, limit the body to 10 MiB,
bind the expected byte size and SHA-256, expire after ten minutes, and store
the result under a submission-scoped high-entropy R2 key. The upload URL cannot
be reused after completion. Public status responses do not expose evidence
URLs, object keys, source URLs, or QQ OpenIDs.

Player-owned and maintainer submission detail responses expose the exact
evidence URL needed by their screenshot view. The browser loads image bytes
directly from the configured R2 custom domain/CDN, where the unlisted asset is
cacheable. The URL is not authorization: anyone who obtains it can read the
image. Keep object keys high-entropy and do not expose bucket listing or URLs
from public submission status. Public achievement icons remain available only
through their separate public API route. The player-facing OCR summary contains
only recognized map, difficulty, player, and completion values; raw OCR output
and internal match details remain private.

Player OCR feedback is a separate annotation-proposal boundary. The player
projection exposes only a derived feedback mode (none/targeted/grouped), the
prompt-origin category, safe field identifiers and recognized values, and
explicit submitted/available state; it never includes numeric confidence,
thresholds, warnings, risk signals, raw OCRKit payloads, or other players'
evidence. Feedback writes require the Portal session, the player's own
Submission, and an idempotency key; proposals never alter the Submission
decision, challenge, Grant, mastery, or OCR evidence.

Dataset snapshots and reviewed annotations are maintainer/service-only. The
OCRKit consumption contract is a private, versioned HTTP boundary requiring
the `OCRKIT_SNAPSHOT_TOKEN` secret (a Worker secret, never a committed
variable); it exposes only finalized snapshot metadata and member annotation
facts, never QQ identity, player-account internals, review risk signals,
Grant/mastery decisions, object keys, or unrelated Submission payloads. The
platform resolves evidence only for finalized snapshot members and reports
missing or deleted source evidence explicitly (410 `EVIDENCE_UNAVAILABLE`)
instead of silently substituting another image.

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

Passkey challenges, session tokens, recovery tokens, QQ login codes, QQ login attempt tokens, QQ group OpenIDs, and
member OpenIDs are private. The database stores hashes of session and recovery
tokens and of the short-lived QQ attempt token and code. QQ login attempts expire
after two minutes and a verified attempt issues the same direct Player Account
session as Passkey login. Passkey challenges expire after five minutes and can be consumed only
once. Authentication and registration require user verification; registration
requires a discoverable credential. The Worker checks the exact Portal Origin
and derives the WebAuthn RP ID from its hostname before it asks the auth package
to verify a response. Invitation codes are hashed for verification and
encrypted at rest for maintainer re-copy, are single-use, target one BattleTag,
and expire after seven days. A maintainer can revoke only an unused,
unexpired invitation; the reason is retained in the audit record and
revocation takes effect immediately. Invitation confirmation codes expire
after two minutes. A first invitation creates its Player Account only after
valid Passkey registration. A later QQ confirmation attaches the optional
channel or sends a conflict to maintainer review. Portal sessions expire after
30 days and are stored against the Player Account, independent of QQ binding
state. Existing active QQ sessions are backfilled to direct Player Account
sessions during the cutover. Maintainer recovery grants expire after 30 minutes,
are single-use, replace the account's Passkeys, revoke its Portal sessions, and
preserve all business records on that Player Account.

GET /v1/me returns only the authenticated player's name, numeric player ID,
and up to five recent player-facing submissions. The separate
authenticated player-title response returns only the caller's active grants and
the public title and map-scope data needed to display them; it never returns
historical holder names, QQ identities, or audit data. QQ identities, evidence
objects, source URLs, and audit payloads do not cross the API boundary. The
protected administrator surface may read QQ group/member identifiers to operate
bindings; these fields are never returned by public or player APIs.

GET /v1/me/mastery is likewise session- and ownership-scoped. It reads only
active verified-run projections for the current player: stable map ID, canonical
difficulty, settlement metrics, awarded XP, aggregate personal bests, and a
bounded recent-run/history page. Run codes, source submission IDs, account and
QQ identifiers, game-version and event facts, OCR/evidence data, risk signals,
XP rule snapshots, and lifecycle/audit details remain platform-private. This
read does not create runs or decide submission eligibility.

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
