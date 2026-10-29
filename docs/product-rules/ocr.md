# OCR Integration

OCRKit is recognition-only; the platform owns matching and every business outcome.
Handling rules: [data-and-security.md](../dev-rules/data-and-security.md).

## Job flow

- Upload completion or maintainer re-recognition creates a pending OCR result whose
  UUID is the round's job ID (queue retries reuse it). The Queue sends the stored image
  to `POST /api/v1/ocr/challenge/jobs` (multipart `file`, `job_id`); 202
  `{jobId, status: "accepted"}` acknowledges intake only. The Submission stays
  `ocr_pending`.
- OCRKit posts full evidence, or `OCR_RECOGNITION_FAILED` / `OCR_JOB_EXPIRED`, to
  `POST /v1/ocrkit/jobs/{jobId}/result` with `OCRKIT_API_TOKEN`.
- One conditional D1 claim serializes callbacks and manual review of a pending round.
  Transient failure releases it and returns 503 (OCRKit retries); duplicate or stale
  callbacks return 204 with no repeated Grants or Runs. The 45-minute stale repair bounds
  abandoned rounds (claiming refreshes the window; a crash keeps the claim until repair).

## Evidence policy

- Accept only response schema `1`, `ok: true`, and required fields at or above the
  confidence gate before value matching.
- Map challenges need `map_name`, `difficulty` (when the rule targets one),
  `challenge_completed`, `player`, and an explicitly required map variant; they never
  use generic achievement titles or the left panel. Title challenges need
  `challenge_completed`, `player`, and title evidence (a matching `achievement_titles`
  entry or a title followed by a checked mark; an aggregate-statistics panel is not
  evidence). `achievement_challenge_disabled: true`
  (the game's achievements-disabled notice) fails every title condition; `null` is unknown
  and changes nothing.
- Difficulty order: `简单` < `一般` < `困难` < `专家` < `传奇` < `地狱`. A harder
  recognized difficulty satisfies easier targets; `普通` normalizes to `一般`; a
  `地狱：` prefix is `地狱`. With several exact matches the decision is the highest
  recognized difficulty, but one approval batch grants every covered rewardable title.
- OCR `classic` is a legacy variant fact supporting retained revision evidence; scope
  comes from the assigned `gameplayRevisionId`, not a variant branch.

## Mastery acceptance

- Fail-closed: both `MASTERY_MIN_GAME_VERSION` and `MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS`
  stay empty until Bastion's run-code HUD and OCRKit's layout have a recorded release.
  Missing, malformed, or partial values disable new mastery acceptance and never affect
  the title path. Rollback: clear either and redeploy; ledger rows stay.
- When enabled, require the minimum game version, one configured layout, and `ok` fields
  at confidence `>= 0.9` for completion, viewer player, map name, difficulty, version, run
  code, and duration. The platform normalizes the code, resolves exactly one active
  canonical map, and decides duplicate, conflict, acceptance, and XP. Weak or ambiguous
  evidence yields no XP and does not block title matching.
- Run-code event-weight check: from Bastion 26.1004.6 the code embeds the room's
  event-weight total. The platform compares it with the expected total for the
  screenshot's build (regular build: implemented, unsuspended events outside any
  Standalone Mode's pools; standalone build: the total recorded on that mode). Within
  +/-0.50 passes; a larger gap grants nothing, records no Run, and routes to maintainer
  review. Players see only a generic "could not pass challenge verification" reason.
- No materialized mastery projection is stored; views recompute from `mastery_runs`.
  `rebuildMasteryProfiles` reconciles without mutating accepted, invalidated, or
  conflict rows.

## Accuracy feedback

The platform is not an annotation tool; ROI transcription and labels live in OCRKit
Model Studio. The platform keeps one `accurate`/`inaccurate` mark per OCR result.

- The owning player or a maintainer sets it; one row per (Submission, OCR result), latest
  writer wins. It binds to the result ID (a stale result is rejected; re-recognition
  starts unmarked), is idempotent via `Idempotency-Key`, carries no transcription, and
  never changes decisions, Grants, Runs, mastery, or OCR evidence.
- OCRKit uses marks only as a sampling hint, never as a label. Old
  `ocr_feedback_proposals`, `reviewed_annotations`, and snapshot tables are audit-only.

## Training screenshot sets

Immutable, versioned sets are the approval that member screenshots may be used for OCR
training; ROI review, labels, crops, and splits happen in OCRKit.

- Membership is by rule: the latest stored screenshot of every approved Submission plus
  that of any Submission whose current recognition is marked `inaccurate`. Maintainers
  exclude anomalies before finalizing; candidates lacking evidence or layout version are
  auto-excluded.
- Membership freezes at draft creation; finalized sets are immutable (later changes go in
  the next version). Rows carry the full delivery payload (source id, R2 key, SHA-256,
  MIME, size, layout version, mark). Evidence stays retained as provenance even if the
  Submission changes; copies OCRKit already downloaded are not recalled.
- A draft is finalized or discarded (correct by discarding and recreating). Discarded sets
  stay readable to maintainers, never served. Only finalized sets are served at
  `GET /v1/ocrkit/screenshot-sets/{version}` (`OCRKIT_SNAPSHOT_TOKEN`), with member
  facts only; OCRKit downloads from R2 with its own read-only credentials.
