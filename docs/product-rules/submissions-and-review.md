# Submissions and Review

Evidence and verification rules. OCR details: [ocr.md](ocr.md). Domain facts:
[platform-domain-model.md](platform-domain-model.md).

## Intake

- Sources: Portal upload or QQ `/上传`. Both enter the same private evidence, OCR,
  Challenge matching, review, and Grant lifecycle; QQBot never stores evidence or
  Submission state.
- Portal: a one-time upload URL per session (no Challenge target) backed by private R2
  under `uploads/submissions/<submissionId>/`. The Submission enters `ocr_pending`
  only after hash, size, content type, and object ownership verify.
- Players never pick a Challenge. The platform evaluates every eligible Challenge.
- Public status is an opaque-ID, uncached D1 read: submission ID, map, timestamps,
  workflow status, and a safe Verified Run outcome (`created`, `reused`,
  `ineligible`, `invalidated`) with XP. No evidence, OCR, identity, match code,
  Run ID, review, Grant, conflict, or risk data.

## QQ ingress

`POST /v1/qq/submissions` carries command message ID, group and member OpenIDs, and
the attachment URL, filename, and declared type. QQBot resolves one image (own
attachment, else the quoted message's).

- The Player comes from the active QQ binding; unbound, banned, or inactive-group
  callers are rejected before any fetch. No map, Challenge, or BattleTag is sent.
- The platform fetches the URL while valid: HTTPS, trusted QQ hosts, revalidated
  bounded redirects, time limit, 10 MiB cap. Stored type comes from the image
  signature. Bytes go to private R2 before any D1 Submission exists; the URL is never
  persisted or logged.
- The Submission ID derives from the idempotency identity (command message). A
  changed payload is `IDEMPOTENCY_CONFLICT`. The record first holds an enqueueing
  claim: a redelivery inside the claim is rejected as in progress; an interrupted
  claim is resumed from stored data without refetching. A failed queue send returns
  the claim to resumable and marks the OCR row `OCR_QUEUE_SEND_FAILED` (admin retry
  recognizes it). Results are read in the Portal; no QQ result notification.

## Lifecycle

```text
Player API: processing -> needs_review | completed | rejected
Internal: upload_pending -> ocr_pending -> approved | ocr_review_required | resubmission_required
          ocr_review_required -> approved | rejected | resubmission_required
```

- Reliable evidence for all fields a Challenge's Conditions name, at the central
  confidence/layout policy, matches automatically. Ambiguous, weak, unsupported, or
  conflicting evidence is `ocr_review_required`; a reliable non-match is
  `resubmission_required`. No unverified Grant is ever created.
- Eligibility is evaluated at `submissions.created_at`, not at OCR, queue, or review
  time: a Pioneer submission created in its half-open window stays processable after
  `endsAt`; one created before `startsAt` or at/after `endsAt` never gains it. The
  upload-time rule snapshot governs downstream steps; legacy rows without one resolve
  through the direct challenge path.
- Automatic matching covers only the recognized map and needs reliable map-name
  evidence. A recognized higher difficulty covers lower ones (hierarchy in ocr.md) and
  issues each covered rewardable map title in one decision; maintainer candidates stay
  exact to the recognized difficulty.
- Player detail shows `ocr_review_required` as a request only if the player asked for
  manual handling; automatic routing carries no player-visible reason.

## Approval and outcomes

- Approval records zero or more independent outcomes (`verified_run`, `title_grant`,
  `challenge`) in one D1 batch with the review, rule snapshot, and audit. A Run-only
  approval has `grant_id = NULL`. An already-owned title links the existing Grant and
  records reuse.
- Title issuance uses the challenge's `titleKey` (title challenges) or
  `reward_title_key` (map challenges), keeping map context.
- A new Run is `created` once; exact same-player match-code reuse gives 0 XP. New
  awards use XP v3 (see the domain model); v1/v2 awards stay unchanged. Screenshots
  without a reliable match code can still reach titles but produce no Run or XP.
- Public and player responses carry only outcome status and XP; maintainer detail may
  add the Run ID and internal reason or conflict fields.

## Maintainer review

- The queue defaults to longest-waiting first (least recently updated), switchable to
  newest. Maintainers see historical and in-progress records, the CDN screenshot, and
  OCR output; the platform never silently drops records.
- Every decision (automatic or maintainer) is its own `submission_reviews` row; the
  latest is current and a maintainer may decide again. Re-deciding changes only
  Submission status and reason: it never revokes Titles or Runs already produced
  (revoke the Grant, or use a spot-check revocation). Re-approval with no new outcome
  reports "already owned".
- Maintainers confirm or correct any safe structured OCR field. Corrections are
  business facts, not OCR annotations: they rerun Conditions matching and drive Grants
  and Runs; raw OCR evidence is never changed. Where extraction cannot express what
  the screenshot visibly proves, they may confirm specific Challenges from the eligible
  set (completable at `created_at`, in the recognized Gameplay Revision, not owned or
  admin-revoked); approval revalidates and records them through the normal
  Completion -> Grant chain, with the basis in the audit.
- A read-only preview shows the Completions, Titles, and Run evidence approval would
  produce; it writes nothing.
- Rejection, resubmission, and spot-check revocation ask for confirmation; notes are
  optional. A rejection or resubmission note is shown to the player; a spot-check
  revocation note is audit only.
- Reopen: a maintainer can reopen an approved Submission with wrong recognition. One
  D1 batch withdraws its evidence-derived Grants, Completions, and Run (manual Grants
  untouched), clears derived fields, and returns it to review; re-approval re-derives
  everything and restores the same Run from the new evidence. Held submissions can
  re-run the decision from stored recognition without calling OCRKit.
- Auto-approval spot checks: `OCR_AUTO_REVIEW_SAMPLE_RATE` deterministically creates
  a pending spot check without blocking the result; a maintainer confirms it or revokes
  its evidence-derived outcomes, and player and Agents projections follow.

## Verified Run conflicts and revocation

- Spot-check revocation invalidates a Run only if that Submission created it; a
  reusing Submission cannot invalidate another's Run. A later valid OCR retry restores
  it once. Grant revocation never invalidates a Run.
- Same-player match-code conflict: the original Run and the conflicting evidence stay
  separate; the corrected Submission is never merged. A maintainer either keeps the
  original or invalidates it (idempotent, audited actor/time/reason, updating outcome
  and projection).
- Approving a Submission in review is that decision: reviewed evidence differing from a
  Run from another Submission invalidates it and records the replacement; if the
  Submission owns the differing Run, it is invalidated and rewritten. Evidence equal to
  an active Run holding the code is a duplicate (reused, no XP, own stale Run
  invalidated); differing evidence replaces it. A maintainer-invalidated Run keeps
  blocking until restored. Exact replays are reuse, not conflict records.
- Maintainer Verified Run reads (private, uncached) filter by player, map, difficulty,
  state, accepted date, origin, and match code; detail shows source Submission (no
  evidence URL), settlement facts, XP inputs, map projection, lifecycle, and
  conflicts. Corrections via `/v1/admin/verified-runs/{id}/corrections` update the same
  Run, audit before/after, and recalculate outcome, XP, and Mastery.
