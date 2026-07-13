# Integrations and Workflows

This document defines high-level contracts. It intentionally omits credentials, private endpoints, deployment configuration, and other operational details that do not belong in a public repository.

## Submission lifecycle

Keep review approval, grant completion, and game release as separate states:

```text
received → evidence_pending → ocr_pending → ocr_processing
→ ready_for_review
→ approved | rejected | resubmission_required
→ grant_pending → pr_created → granted → released
```

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
