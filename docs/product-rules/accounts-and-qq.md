# Accounts, QQ, and Login

QQBot is a channel adapter; the platform owns accounts, bindings, and policy. Token and
expiry details: [data-and-security.md](../dev-rules/data-and-security.md).

## Request tracing

Every API request has a validated `X-Request-ID` (an incoming valid value is kept),
returned on success and error. Portal proxies forward it and show `Request-ID：...` in
error alerts and toasts (local validation errors get none). Queue messages, OCRKit
requests, Bastion reads, and QQBot policy notifications carry it when present and log the
operation and status. IDs are correlation only: never credentials, cookies, QQ identifiers,
bodies, or signed URLs.

## Contract

- An admin invitation admits one BattleTag. The player confirms a QQ binding claim in an
  enabled group; the platform creates the Player Account and first binding atomically.
  QQBot never creates or merges accounts.
- Passkey is a Portal login method registered from an authenticated account, not part of
  invitation. Players may add and remove Passkeys in settings; the last one can be removed
  only while an active QQ binding remains as fallback.
- Login by Passkey (discoverable, user-verified) or by QQ: the Portal creates a six-character
  code valid 2 minutes; the player sends `/验证 CODE` in an enabled group; the API checks
  group and claim policy before consuming the code and records the environment. QQBot
  replies and recalls the code message only after success and never sees session tokens.
  The original browser exchanges the completed claim for a 30-day session.
- Maintainers issue a short-lived single-use recovery link after verifying identity; it
  replaces Passkeys and revokes sessions, keeping the account and records.
- The Portal publicly browses the active map catalog and challenge directory; submissions,
  titles, and player data need authentication.
- Channel writes need an idempotency key: equal retries replay the original response, a
  changed reuse is rejected.
- `/v1/me` shows the profile and up to five recent submissions; `/v1/me/submissions` pages
  the same player-safe summary over the caller's full history. Players read only their own
  submission detail, screenshot, and a constrained OCR summary, and their own mastery via
  `/v1/me/mastery` (active runs; invalidated entries may remain in history without reason).

## Binding and invitations

- Binding starts from a Portal invitation link; the BattleTag comes from the invitation and
  is read-only on the public page. The player types `@`, selects the robot, and sends
  `/验证 CODE` in an enabled group; QQBot forwards only stable group/member identity and the
  code. The page offers a copy action for the full command.
- A clean first binding activates atomically with an automatic audit decision. Rebinds,
  transfers, conflicts, and ambiguous recovery stay pending for maintainer approval;
  incomplete claims cannot log in, submit, or read data. An expired confirmation code does not
  invalidate the link: the player regenerates a code from it without a maintainer.
- Maintainers issue up to 100 BattleTag-targeted invitations per idempotent batch, with a
  per-player copy action for link, code, and instructions. Codes are encrypted so a maintainer
  can re-copy an active one individually; the list shows BattleTag, issue time, expiry, and
  status, never plaintext. Only unused, unexpired invitations can be revoked (audited reason).
- An admin may attach unclaimed historical title record IDs to an invitation (searchable
  holder selection, but the selected record IDs are the authorization; name equality never
  authorizes). After the claim is approved, the platform creates or reuses historical
  `player_title_grants` with no second admin action. Each item records created, reused,
  conflict, or retry-required; conflicts never reassign a grant, and a recoverable failure
  never rolls back account, binding, or session. Retry requires an active QQ binding (legacy
  Passkey-first invitations retry only against their recorded account).
- Only maintainers change a BattleTag (name and number); players ask a maintainer, and there
  is no self-service request. The change rewrites the account's BattleTag in place and never
  moves facts, which stay on the Player Account. The old BattleTag is released at once, with no
  alias or history. It is rejected while the old or new BattleTag has a usable invitation or an
  undecided binding claim; the maintainer revokes the invitation first. In-game titles follow
  the new name after the next Bastion build syncs.
- Member OpenIDs are stable across groups for one robot: one active binding per
  `(provider, memberOpenId)` and account; revoked bindings stay auditable. Group OpenIDs are
  policy, source, environment, and audit context, never identity.

## Group access

Managed in `/admin` (the Worker requires `is_admin`).

- QQBot registers `GROUP_ADD_ROBOT` groups `pending` and marks `GROUP_DEL_ROBOT` groups
  `disconnected`, using the event timestamp and a stable idempotency key so delayed or
  repeated events cannot overwrite newer state.
- A maintainer promotes exactly one pending group to `active`; atomically the previous active
  becomes `legacy` and its `/绑定` and `/验证` policies close. Maintainers may store a display
  label and environment (the stable group OpenID stays the identifier).
- QQBot reads the group and command-policy snapshot at startup, then only after a signed
  platform policy event (D1 outbox, dedicated Queue, retried until acknowledged). It keeps
  the last good snapshot on refresh failure, fails closed before the first, and never polls.
