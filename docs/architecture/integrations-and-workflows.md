# Integrations and Workflows

This document defines high-level contracts. It intentionally omits credentials, private endpoints, deployment configuration, and other operational details that do not belong in a public repository.

## Implemented foundation

The first platform vertical slice is implemented in the repository:

- versioned `v1` QQ binding and submission contracts use stable opaque message metadata;
- authenticated service calls can register or bind a QQ group member to a player using separate mutable player name and stable numeric player ID fields;
- authenticated service calls can create a map-completion submission from QQ identity metadata;
- the API can persist temporary QQ image sources into private R2 evidence and advance the submission to `ocr_pending`;
- the public status endpoint exposes only the opaque submission ID, map, timestamps, and lifecycle status;
- D1 stores the binding, player account, submission, attachment metadata, idempotency record, and audit event;
- repeated writes with the same idempotency key replay the original response, while a changed request is rejected.

OCR orchestration, review decisions, grants, and release reconciliation remain future milestones.

## Submission lifecycle

Keep review approval, grant completion, and game release as separate states:

```text
received
→ evidence_pending
→ ocr_pending
→ ocr_processing
→ ready_for_review
    ├→ approved
    │   → grant_pending
    │   → pr_created
    │   → granted
    │   → released
    ├→ rejected
    └→ resubmission_required
```

The review and grant states have distinct meanings:

| State | Definition |
| --- | --- |
| `approved` | The review decision passed, but Bastion has not yet been modified. |
| `pr_created` | A Bastion pull request containing the grant request has been created. |
| `granted` | The change to the authoritative title source has been merged or otherwise confirmed. |
| `released` | A game version or public snapshot containing the grant has been released. |

Failure states may include evidence, OCR, grant, and notification failures. Each transition needs an allowed predecessor, authorized actor, timestamp, idempotency behavior, audit record, and retry or reconciliation path.

## OCRKit

The platform owns orchestration; QQBot is only a channel adapter.

```text
submission
→ validate and persist private evidence
→ enqueue OCR work
→ call OCRKit through its private contract
→ store the raw versioned result and metadata
→ evaluate challenge rules
→ route to review
```

OCR is evidence rather than final truth. A retry or model change creates a new run; raw results are not overwritten and human corrections are stored separately.

## Challenge rules

Rules should be deterministic, versioned, testable, and data-driven. A rule may define a stable challenge or title key, compatible game versions, required evidence, completion conditions, automation level, missing-field behavior, and its active lifecycle.

Supported policy categories are `manual_only`, `ocr_assisted`, `auto_eligible`, and `telemetry_required`. A model confidence score alone must not grant a title; automatic approval requires an explicit policy and an evaluated false-positive threshold.

## Bastion integration

Released-content changes follow this controlled path:

```text
platform change set
→ validate against imported Bastion data/schema
→ produce a deterministic request
→ create a reviewable pull request
→ run repository CI and build checks
→ human review and merge
→ release
→ import the new versioned snapshot
→ reconcile platform state
```

Requests need stable external identifiers, idempotent retries, duplicate-grant protection, review context, least-privilege credentials, and reconciliation when an external operation succeeds but the callback does not.

## QQBot

The platform API should expose contracts for identity binding, submission creation from stable message metadata, player-visible status, and notification jobs. QQBot should not contain OCR, review-rule, title-slot, or GitHub workflow logic. External QQ identifiers remain private and must not appear in public views.

## QQ group login

The implemented login slice uses a short-lived browser challenge. The Portal creates a one-time code, and the user sends `/验证 CODE` while mentioning the bot in an enabled production or test group. QQBot forwards the group and member OpenIDs plus the source message ID to the platform. The platform verifies that the same group-scoped QQ identity is already bound to a player before it consumes the code, creates the browser session, and returns the target environment. An unbound identity receives `LOGIN_BINDING_REQUIRED`; QQBot keeps the code message and instructs the player to bind first. QQBot sends the success acknowledgement and calls the QQ group-message recall endpoint only after a successful verification.

Group access is configured by maintainers through the admin API. The login identity is group-scoped because QQ `member_openid` differs for the same user in different groups; the binding must therefore exist in the same group before login.
