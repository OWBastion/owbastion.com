# Data and Security Boundaries

The repository is public: never commit credentials, tokens, production endpoints,
private identifiers, user screenshots, risk signals, signed URLs, or private logs.

## Stores

| Store | Holds |
| --- | --- |
| D1 | All business truth: accounts, Passkeys, sessions, QQ bindings, submissions, uploads, OCR results, Verified Runs, reviews, idempotency and audit records, catalog and map metadata, Challenges and Completions, title rules, Grants |
| R2 | Submission screenshots (unlisted CDN assets) and public achievement icons (via their API route) |
| KV `PLATFORM_CACHE` | Disposable read-through copies of catalog and grant projections, version-scoped keys, hours-long expiry; never truth or a public boundary |
| Bastion Git/releases | Game implementation and artifacts; Bastion reads metadata via the Agents API |

Read paths follow [ADR 0004](../adr/0004-storage-read-standard.md): stable,
identity-independent public data goes shared cache, KV, then D1; player-specific
and mutable workflow/security state reads D1 with `private, no-store` (ADR 0002).
KV outage falls back to D1; list endpoints must not add per-item queries or KV reads.

## Trust boundaries

- QQBot calls need `QQBOT_API_TOKEN` (`channel:write`, `channel:read`); writes
  need an idempotency key and audit event.
- Admin requests need a session whose account has `is_admin`; the Worker checks
  this independently of Portal UI. Admin changes, binding removals, and catalog
  edits are idempotent and audited, and never authorize changes to Bastion artifacts.
- A verified QQ claim creates a Player Account only with an active, unused admin
  invitation for that BattleTag, or with a Player code that still has uses and inviter quota
  and a BattleTag no existing account, admin invitation, or unclaimed historical holder
  claims. Account, first binding, and (for a Player code) the referral commit together.
  Later rebinding follows invitation and maintainer review. A QQ login attempt
  authenticates only the account of that member's active binding.
- Never expose private evidence, QQ identifiers, object keys, source URLs, review
  notes, or unapproved drafts publicly.

## Evidence and OCR

- Upload sessions accept JPEG/PNG/WebP up to 10 MiB, bind byte size and SHA-256,
  expire in 10 minutes, write to a submission-scoped high-entropy R2 key, and
  cannot be reused.
- Owner and maintainer detail views return the exact CDN evidence URL. The URL is
  not authorization; keep keys high-entropy and never list buckets or leak URLs
  through public status. Player OCR summary shows only map, difficulty, player,
  and completion values.
- The OCR Queue carries only submission ID, object key, schema version, and an
  optional correlation ID. The Worker verifies the key is that Submission's
  attachment, reads R2, and sends only bytes to OCRKit. OCRKit never sees keys or
  the bucket. Results and transitions commit together, idempotent by correlation ID,
  with the delivery attempt count recorded.
- OCR accuracy feedback is one accurate/inaccurate mark per recognition result
  (owner or maintainer, idempotent, latest writer wins). It never changes
  decisions, Grants, mastery, or evidence, and is only a sampling hint, never a
  training label. Projections never include confidence, thresholds, warnings,
  risk signals, raw payloads, or other players' evidence.
- Screenshot sets are OCRKit's training supply: admin management needs maintainer
  role; the read endpoint is private and versioned with Worker secret
  `OCRKIT_SNAPSHOT_TOKEN`, serves finalized sets only, and returns per-screenshot
  object facts (source id, key, SHA-256, MIME, size, layout version, accuracy
  mark), never identity, decisions, Grants, or bytes. OCRKit reads R2 directly with
  its own read-only prefix-scoped credentials; browsers never get storage
  credentials. Set members are retained even if the Submission is removed.

## Reviews

Ratings are D1 records keyed by account and event/map target; account link, audit,
hidden and withdrawn state stay private. Anonymous display is presentation only.
Aggregates exclude withdrawn and invalidated rows; hiding a comment keeps its
rating. Public reads (summary, bounded batch, paginated comments) return only
rating, comment text, creation time, and a public display name or no author; never
review IDs, account or game IDs, QQ identity, moderation state, or audit data.
They stay `private, no-store`.

## Login and sessions

- Passkey challenges, session/recovery tokens, QQ login codes and attempt tokens,
  and QQ OpenIDs are private. Sessions, recovery tokens, attempt tokens, and codes
  are stored hashed.
- Passkey challenges expire in 5 minutes, single use; authentication and
  registration require user verification, registration a discoverable credential.
  The Worker checks the exact Portal Origin, or an exact preview origin on its
  subdomain (`PORTAL_PREVIEW_ORIGINS`), and derives the RP ID from the Portal
  Origin's hostname.
  Registration needs an authenticated account and is not part of invitation.
- QQ login attempts expire in 2 minutes and issue the same direct session as
  Passkey. Only one live pending attempt holds a code; collisions regenerate.
- Player codes are user-chosen and shareable, stored upper case and unique, not hashed. Creation
  and registration check their quotas inside the same D1 statement that writes the row, so
  concurrent requests cannot exceed a limit. Public redemption keeps the Turnstile guard.
  Player and inviter views never carry QQ identifiers.
- Invitations: hashed for verification, encrypted for maintainer re-copy,
  single-use, one BattleTag, 7-day expiry; only unused, unexpired ones can be
  revoked (audited, immediate). Confirmation codes expire in 2 minutes. After
  QQBot verifies in an enabled group, account, binding, and claim approval commit
  together; the approved claim can bootstrap a session for 5 minutes (retry-safe).
- Portal sessions last 30 days. Recovery grants last 30 minutes, are single use,
  replace Passkeys, revoke sessions, and keep all business records.
- Expired attempts, pending claims, sessions, and challenges are pruned on the
  next creation path, not by a scheduled job; reviewed or approved claims stay as
  provenance.

## Player and Agents reads

- `GET /v1/me`: name, numeric player ID, up to five recent submissions.
  `GET /v1/me/submissions`: the caller's own submissions, paged, same fields.
  Player-title read: only the caller's active Grants plus public display data.
  `GET /v1/me/mastery`: active run projections only (map, difficulty, settlement
  metrics, XP, personal bests, bounded history). Neither returns run codes,
  source submissions, account/QQ identity, versions, event facts, OCR/evidence,
  risk, XP snapshots, or audit data. Admin APIs may read QQ identifiers; public
  and player APIs never do.
- Agents projection omits numeric player IDs; with the Bastion build token it may
  return display name, game player ID, active title keys, and map scope. It never
  returns QQ identifiers, submissions, review sources, timestamps, audit, analytics,
  or revoked/historical Grants.

## Title Grants

`player_title_grants` is the single entitlement table: player, `title_key`,
optional map context, source (`historical`, `submission`, `manual`, `automatic`),
source ID, revocation fields. Active uniqueness prevents the same title in the
same scope twice. Create and revoke are idempotent and audited; revoke preserves
the row and hides the title from the player. Each Grant links to its qualifying
Completion. Manual Grants create a manual Completion, never a Submission or
Review, and may target titles in any lifecycle state. Historical holder names are immutable
snapshots, not identity proof.
