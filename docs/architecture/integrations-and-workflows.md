# Integrations and Workflows

This document describes public contracts and current implementation boundaries.
It intentionally omits credentials, private endpoints, deployment configuration,
and private operational data.

## Implemented platform slice

The current API implements versioned v1 QQ flows:

- authenticated QQBot calls create or update a group-scoped player binding from
  a mutable player name and stable numeric player ID;
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
- the platform stores a versioned Bastion title catalog, all released maps,
  map-only `PIONEER`/`CONQUEROR`/`DOMINATOR` reward slots, and historical title
  holder snapshots without linking source names to platform accounts;
- a versioned Queue message invokes OCRKit, persists the raw result and match
  evidence, and moves matching submissions to `ready_for_review`;
- the maintainer Portal can inspect private evidence and OCR output and record
  an idempotent review decision.

Portal uploads use a one-time platform upload URL backed by the private R2
binding. The URL is intentionally scoped to one upload session and is not a
public object URL.

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
size, content type, and private object ownership are verified. OCR mismatches
become `resubmission_required`; repeated OCR service failures become
`ocr_review_required`.

Approval records the human decision only. Grant processing, pull requests, and
releases remain outside this slice.

## QQBot and login

QQBot is a channel adapter. It sends /绑定, /成就挑战, and /验证 requests to the
API and does not perform OCR, review, title grant, or GitHub logic.

Map-only titles are scoped to the map that supplied their reward slot. The
platform does not expose them as global titles, and it preserves Bastion's
map-specific pioneer display prefixes when returning a map-filtered title catalog.

A Portal login attempt creates a six-character code valid for two minutes.
The user sends /验证 CODE in an enabled QQ group. The API verifies that the
same group-scoped QQ identity has an existing binding before consuming the
code, records the group environment, and issues a 30-day browser session when
the Portal later polls the verified attempt. QQBot replies and recalls the code
message only after a successful verification.

Group access is managed through the platform-session-protected `/admin` Portal.
The Worker accepts maintainer requests only for player accounts with `is_admin`
enabled.
QQBot reads the enabled group snapshot with its service token at startup and on
the configured refresh interval; it keeps the last successful snapshot when a
later refresh fails and fails closed before the first successful snapshot.

## OCR integration

OCRKit remains the recognition-only service. The platform compares its
structured `map_name`, `difficulty`, `challenge_completed`, and `player` fields
with the selected Bastion challenge and bound player. OCRKit does not decide
eligibility or approval. Bastion changes must remain reviewable, idempotent,
and reconciled through its own CI and release process.
