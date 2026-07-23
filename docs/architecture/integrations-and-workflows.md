# Integrations and Workflows

This document describes public contracts and current implementation boundaries.
It intentionally omits credentials, private endpoints, deployment configuration,
and private operational data.

Capability status is maintained only in the [feature status matrix](../development/feature-status.md).

## Implemented platform slice

The current API implements versioned v1 QQ flows:

- authenticated QQBot confirms invitation-bound binding claims from a stable QQ
  member OpenID; it never creates or merges player accounts directly;
- authenticated QQBot calls create a map-completion submission using stable QQ
  group/member and source-message metadata;
- writes require an idempotency key; equal retries replay the original response
  and a changed reuse is rejected;
- D1 stores player accounts, bindings, submissions, attachment metadata,
  idempotency records, audit events, QQ login attempts, and sessions;
- when EVIDENCE_BUCKET is configured, submission creation validates and
  retrieves HTTPS image sources, writes private objects to R2, and records
  content metadata;
- public submission status exposes only the opaque submission ID, map,
  timestamps, and status;
- the Portal can create and poll a one-time QQ login attempt, then display the
  bound player and up to five recent submissions after session verification.
- the Portal can select an imported Bastion challenge, create a single-image
  upload session, upload private evidence, and complete the upload;
- an authenticated player can read only their own submission detail and
  screenshot, plus a constrained OCR summary; public submission status remains
  free of evidence and OCR fields;
- the platform stores a versioned Bastion title catalog, all released maps,
  map-only `PIONEER`/`CONQUEROR`/`DOMINATOR` reward slots, and historical title
  holder snapshots without linking source names to platform accounts;
- maintainers can explicitly migrate one historical holder snapshot or all of
  its unclaimed title records to a player account as auditable title grants,
  and can revoke an individual grant with a recorded reason; historical holder
  names are never matched or claimed automatically;
- a versioned Queue message invokes OCRKit, persists the raw result and match
  evidence, and moves matching submissions to `ready_for_review`;
- the maintainer Portal can inspect private evidence and OCR output and record
  an idempotent review decision.
- maintainers can list achievement challenges and immediately update
  title-challenge rules, including their Portal display category override;
- maintainers set a challenge to `sunsetting` with a planned Bastion version,
  then manually confirm retirement after that release; sunsetting challenges
  remain available for submission.
- maintainers may schedule a title challenge with a start and end timestamp;
  scheduled challenges remain visible as `未开放`, become submittable during
  the window, and stop accepting new submissions after it without a cron job.
- the Portal can publicly browse the active map catalog and map challenge
  directory; player authentication remains required for submissions, titles,
  and player-specific data.

Portal uploads use a one-time platform upload URL backed by the private R2
binding. The URL is intentionally scoped to one upload session and is not a
public object URL. User screenshot objects use the shared `uploads/` namespace,
with platform-generated keys under `uploads/submissions/<submissionId>/`; the
same object key and the explicit platform evidence bucket are sent to OCRKit.
The platform must not rely on OCRKit's default bucket, which is reserved for
OCRKit's own configured storage and model artifacts.

Administrative submission views are intentionally broader than player views.
Maintainers can inspect historical and in-progress submission states, evidence,
and recognition output, including records that predate the current lifecycle.
The platform does not silently discard those records from the administrative
queue; final approval, rejection, or resubmission decisions remain explicit
maintainer actions. Player endpoints remain ownership-scoped and expose only
the player's own submission status, evidence, and constrained OCR summary.

Player screenshot reads are authenticated and ownership-scoped to the current
player account. The Portal proxies the private object without issuing an object
URL; it returns only the recognized map, difficulty, player, and completion
values, never OCRKit's raw response or internal match evidence.

## Submission lifecycle

~~~text
upload_pending
→ ocr_pending
  ├→ ready_for_review → approved / rejected / resubmission_required
  ├→ ocr_review_required → approved / rejected / resubmission_required
  └→ resubmission_required
~~~

The legacy QQ flow retains its evidence retrieval states. Portal uploads are
single-image submissions and enter `ocr_pending` only after the upload hash,
size, content type, and private object ownership are verified. A high-quality
OCR mismatch becomes `resubmission_required`. Unsupported OCR responses,
missing or low-confidence fields, and exhausted OCR failures become
`ocr_review_required`, so a maintainer can inspect the evidence rather than
leaving a submission pending or treating uncertain recognition as a player
error.

Approval records the human decision only. Player title migration records a
maintainer-confirmed historical entitlement; it does not issue a new Bastion
title. Pull requests and releases remain outside this slice.

## Achievement catalog management

The administrator achievement surface displays the complete title catalog,
including global and map-scoped titles, as well as existing platform
challenges. It does not create challenge records for titles that have no public
condition. Title challenges may update
their conditions, evidence rules, submission mode, and optional Portal display
category. A title challenge may also be `scheduled` with an explicit start and
end timestamp; the platform derives its public availability from the current
time and rejects upload-session creation outside that window. Catalog-only
titles use the same administrator editor; saving a non-developer catalog title
creates its challenge record with the edited rules and selected lifecycle
status. Developer-retained catalog titles are a separate case: they are
reserved for developer use and are not player challenges. When no
display-category override is set, the Portal uses the category from the
imported Bastion title catalog. Map
challenges retain their imported map, difficulty, display name, and introduced
version; administrators may keep them enabled, mark them as sunsetting, retire
them, or reopen them.

Sunsetting retains player visibility and new upload sessions while displaying
the planned release version. Retiring a challenge prevents new upload sessions
while preserving submissions that already exist. Those submissions continue
through OCR and review under the ordinary submission lifecycle. Reopening
clears the retirement version. Administrator changes require maintainer
authorization, an idempotency key, and an audit record.

## Random-event directory

The public Portal lists implemented and removed random events, their released
metadata, and linked challenges that are currently open. Maintainers create,
edit, archive, and link events in the Portal. The same Portal/API path accepts
a CSV preview and confirmed import; it validates every row before an atomic
write, records the source hash and audit event, and never stores the CSV.

## Agents content API

The public `/v1/agents/*` API is a read-only knowledge projection over the same
published D1/release-snapshot content consumed by the Portal and Bastion
integration. It provides paginated event, map, achievement, and title queries,
resource details, and bounded cross-content search. It does not expose drafts,
player progress, runtime analytics, administrative fields, or private evidence;
it also does not write content or replace Bastion's released-source authority.

## QQBot and login

QQBot is a channel adapter. Binding starts from a Portal invitation page. The
player sends the existing `/验证 CODE` command in an enabled group; QQBot forwards only the stable
group/member identity and code. A maintainer must approve or reject the claim.
Unapproved claims cannot log in, submit, or read player data.
Maintainers may issue up to 100 BattleTag-targeted invitations in one
idempotent batch. The Portal presents a per-player copy action for the binding
link, code, and player instructions. New invitation codes are encrypted at
rest and can be retrieved individually by a maintainer while still active, so
they can be copied again without exposing them in the invitation list.
The administrator list retains each invitation's BattleTag, issuance time,
expiry, and lifecycle status, but never its plaintext code. A maintainer may
revoke only an unused, unexpired invitation with an auditable reason; revocation
makes the invitation unusable immediately.

Map-only titles are scoped to the map that supplied their reward slot. The
platform does not expose them as global titles, and it preserves Bastion's
map-specific pioneer display prefixes when returning a map-filtered title catalog.

A Portal login attempt creates a six-character code valid for two minutes.
The user sends /验证 CODE in an enabled QQ group. The API verifies that the
same QQ member OpenID has an existing binding before consuming the code,
records the group environment, and issues a 30-day browser session when the
Portal later polls the verified attempt. QQBot replies and recalls the code
message only after a successful verification.

Group access is managed through the platform-session-protected `/admin` Portal.
The Worker accepts maintainer requests only for player accounts with `is_admin`
enabled.
QQBot registers `GROUP_ADD_ROBOT` groups as `pending` and marks
`GROUP_DEL_ROBOT` groups `disconnected`, using the source event timestamp and
a stable idempotency key so delayed or repeated lifecycle events cannot
overwrite a newer platform state. A maintainer promotes exactly one
pending group to `active`; this atomically makes the previous active group
`legacy` and closes its `/绑定` and `/验证` policies. QQBot reads the
platform-owned group and command-policy snapshot at startup, then only after a
signed platform policy event. Group-policy changes are recorded in a D1
outbox, delivered through a dedicated Queue, and retried by a five-minute
Worker repair trigger until QQBot acknowledges the refresh. QQBot keeps the
last successful snapshot when an event refresh fails and fails closed before
the first successful snapshot; it does not poll the platform.
Because QQ does not provide a reliable group name through the channel
interface, maintainers may store a platform-owned display name/label and the
group environment in the Portal. The stable QQ group OpenID remains the
integration identifier.

For one QQ robot, member OpenIDs are stable across groups. The platform permits
one active binding for each `(provider, memberOpenId)` and player account;
revoked bindings remain auditable. Group OpenIDs remain command-policy,
message-source, session-environment, and audit context rather than identity
components.

## OCR integration

OCRKit remains the recognition-only service. The platform accepts only response
schema version `1`, `ok: true`, and required field evidence at or above its
configured confidence gate before value matching. For map challenges, this covers
`map_name`, `difficulty`, `challenge_completed`, and `player`; for manual title
challenges, it covers only `challenge_completed` and `player`. Uncertain OCR is
routed to human review. Title-specific conditions remain human-reviewed;
OCRKit does not decide eligibility or approval. Bastion changes must remain
reviewable, idempotent, and reconciled through its own CI and release process.
