# Integrations and Workflows

This document describes public contracts and current implementation boundaries.
It intentionally omits credentials, private endpoints, deployment configuration,
and private operational data.

Capability status is maintained only in the [feature status matrix](feature-status.md).

The accepted convergence target for gameplay facts, title acquisition, progression,
identity, and administrator information architecture is defined in
[platform-domain-model.md](platform-domain-model.md). Where this document records a
transitional implementation mechanism that differs from that accepted model, treat the
mechanism as current implementation evidence, not as the desired end-state contract.

Gameplay Revision (`gameplayRevisionId`) is the current map progression and
build identity, scoped to a stable map. `CLASSIC`, `map_variant`, and
`mapVariant` are retained only as legacy compatibility or OCR evidence facts;
they do not replace the revision identity or determine current challenge
ownership.

## Request tracing

Every API request receives a validated `X-Request-ID` (or preserves the
validated incoming value). The API returns it in both successful and error
responses. Portal proxies forward the same header to the API and surface it in
error alerts and toasts as `Request-ID：...`; local browser validation errors do
not receive a fabricated ID. Upload Queue messages, OCRKit requests, Bastion
metadata reads, and QQBot policy notifications carry the originating request ID
when one exists, and emit structured logs with the operation and status. These
IDs are diagnostic correlation values only and must not contain credentials,
cookies, stable QQ identifiers, request bodies, or signed URLs.

## Platform workflow contract

The platform contract covers invitation-based account creation, QQ binding,
and Player Account authentication:

- an administrator invitation admits one BattleTag when the player confirms a
  QQ binding claim from an enabled group; the platform creates the Player
  Account and first QQ binding atomically from that verified claim;
- Passkey is a Portal login method registered from an authenticated Player
  Account; it is not part of invitation redemption or first registration;
- authenticated QQBot confirms invitation-bound channel claims from a stable
  QQ member OpenID; QQBot never creates or merges Player Accounts directly;
- authenticated QQBot binding and verification calls use stable QQ group/member
  metadata; QQBot submits a screenshot only through `POST /v1/qq/submissions`
  (below) and never writes evidence or Submission state itself;
- channel writes require an idempotency key; equal retries replay the original
  response and a changed reuse is rejected;
- D1 stores Player Accounts, Passkey credentials and challenges, direct Portal
  sessions, optional bindings, submissions, attachment metadata, idempotency
  records, and audit events;
- when EVIDENCE_BUCKET is configured, submission creation validates and
  retrieves HTTPS image sources, writes private objects to R2, and records
  content metadata;
- public submission status is an unauthenticated, opaque-ID lookup that exposes
  the submission ID, map, timestamps, workflow status, and when present a safe
  Verified Run outcome (`created`, `reused`, `ineligible`, or `invalidated`) with
  awarded XP. A conflict remains maintainer-only. It returns `Cache-Control: private, no-store`,
  reads D1 for every request, and excludes evidence, OCR output, player or QQ
  identity, match code, Verified Run ID, review metadata, grants, and internal
  conflict or risk signals;
- the Portal authenticates a discoverable Passkey with user verification, or
  an active QQ binding through a one-time group code, then displays the same
  Player Account's profile and up to five recent submissions;
  players can add and remove credentials in personal settings, and may
  remove their last Passkey only while an active QQ binding remains as a login
  fallback;
- a bound player can alternatively log in by sending a one-time verification
  code in an enabled QQ group; the platform issues the same direct Player
  Account session;
- maintainers can issue a short-lived, single-use recovery link after identity
  verification. Recovery replaces Passkeys and revokes sessions while keeping
  the existing Player Account and its business records;
- the Portal can create a single-image upload session without a target, upload
  the screenshot, and complete the upload; after OCR accepts it,
  the player confirms a platform-owned map or achievement challenge before it
  enters maintainer review;
- an authenticated player can read only their own submission detail and
  screenshot, plus a constrained OCR summary; public submission status remains
  free of evidence and OCR fields;
- an authenticated player can read only their own mastery projection through
  `/v1/me/mastery`: active verified runs determine aggregate personal bests;
  bounded history can retain an `invalidated` status without its reason. Stable
  map IDs, canonical difficulty, settlement metrics, and awarded XP remain
  player-facing. Run codes, source submissions, account and QQ identity,
  OCR/evidence, event facts, XP snapshots, lifecycle/audit fields, invalidation
  reasons, and risk signals remain private; this read does not create a run or
  decide submission eligibility;
- the existing submission → stored screenshot → Queue/OCR path can additionally
  derive a Verified Run outcome. The platform, not OCRKit, verifies the bound player,
  completion state, canonical active map and difficulty, supported game version
  and OCR layout, reliable field evidence, and normalized match code before it
  records XP. `submission_outcomes` keeps zero or more independent
  `verified_run`, `title_grant`, and `challenge` outcomes, so a Run-only
  approval can have `grant_id = NULL` without creating a fake title Grant;
- the platform stores the current title and map metadata, and
  map-only `PIONEER`/`CONQUEROR`/`DOMINATOR` reward slots, and historical title
  holder snapshots without linking source names to platform accounts;
- maintainers can explicitly migrate one historical holder snapshot or all of
  its unclaimed title records to a player account as auditable title ownership,
  and can revoke an individual Grant with a recorded reason; historical holder
  names are never matched or claimed automatically. Historical and manual
  issuance records the Challenge Completion that supports each Grant;
- manual single and batch issuance creates or reuses the Title's manual
  Challenge, then records an independent Completion and linked Grant for each
  player. Global Titles have no map context; map Titles require a configured
  map title rule, Challenge, or reward association. Retired Titles remain
  eligible only through explicit maintainer issuance. The dedicated
  `/v1/admin/title-grants/manual/batch` route applies the same validation and
  resolution rules to a bounded Cartesian product of players and title targets;
  it is distinct from historical migration `/bulk`, and its active Grants are
  consumed by the existing public and Agents projections;
- the platform stores the developer/all-title capability independently from
  equipped rows. Ordinary players may own any number of active eligible title
  Grants, but only eligible global Grants can be selected, and their Agents
  projection contains only the selected maximum of ten. Map-scoped Grants are
  applied automatically by their map/revision projection and never consume an
  equipped slot. An all-title player is projected with `allTitles: true` and
  therefore receives newly published global titles automatically. If a legacy
  migration leaves an ordinary player with more than ten eligible global Grants
  and no equipped rows, the Portal surfaces expose an idempotent selection
  editor, and the maintainer surface highlights the migration gap while
  allowing authorized global equipped-set management. Both paths replace only
  the equipped selection after the same active-global validation;
- the current player title read preserves active Grants whose catalog definition
  is retired, so historical ownership remains visible. Retired definitions stay
  outside ordinary active acquisition and review issuance; the equipped
  selection path accepts active global Grants even when their catalog definition
  is retired.
- maintainers can update a player's BattleTag display name while keeping the
  numeric player ID stable; the update is idempotent, rejects a normalized-name
  conflict with another account sharing the same numeric ID, and records an
  audit event;
- a versioned Queue message invokes OCRKit and persists the raw result and match
  evidence. The platform compares structured OCR fields with each eligible
  Challenge's canonical Conditions. It grants every matching reward whose
  required evidence meets the centralized confidence/layout policy; weak,
  unsupported, or conflicting evidence becomes `ocr_review_required`, while a
  reliable non-match becomes `resubmission_required`;
- the maintainer Portal can inspect the unlisted CDN screenshot and OCR output and record
  an idempotent review decision. A maintainer may correct visible OCR fields;
  the platform reruns the same Conditions matcher over those corrected facts
  and approval atomically creates or reuses every matching title Grant and
  Challenge Completion. A mastery-only approval records its accepted Verified
  Run outcome without a title Grant. A player never selects a Challenge during
  upload or processing.
- maintainer-only Verified Run reads list and filter runs by player,
  map, difficulty, lifecycle state, accepted date, acceptance origin, and run
  match code. Detail includes source Submission metadata without the evidence URL, recognized
  settlement facts, XP snapshot inputs, resulting map projection, lifecycle,
  and same-player match-code conflicts; it is always private and uncached.
  Maintainers can submit an evidence-backed correction through
  `/v1/admin/verified-runs/{verifiedRunId}/corrections`; the same Run is updated,
  before/after facts and XP snapshots are audited, and its source outcome plus
  current XP/Mastery projections are recalculated.
- automatic approval writes the OCR result, approved review, title Grant reuse
  or creation when applicable, independent submission outcomes, submission rule
  snapshot, and audit records in one D1 batch. A deterministic sample can
  create a pending spot check without blocking the automatic result; a
  maintainer can confirm the sample or revoke evidence-derived outcomes, with
  the affected player and Agents projections then reflecting the revoked state.
- the current title-challenge and map-title-rule admin routes and directories
  remain a bounded compatibility adapter while their records are converged on
  canonical Challenges. Legacy map rows keep their stable compatibility IDs
  and explicit Gameplay Revision assignments during that transition;
- canonical Challenges use `draft`, `active`, and `archived`; configured
  start/end timestamps determine when an active Challenge is completable, and
  public-condition visibility is separate from evaluation. Legacy schedule,
  release, and enablement fields are adapter inputs or projections, not
  additional Challenge lifecycle states;
- every new qualification outcome is recorded as a Challenge Completion before
  its Grant. A Player who already owns the Title is skipped across its normal
  acquisition Challenges in the same qualification scope. Explicit `satisfies`
  links may record lower Challenge Completions and Grants when the Player does
  not already own those Titles;
- the Portal can publicly browse the active map catalog and map challenge
  directory; player authentication remains required for submissions, titles,
  and player-specific data.

### Player review foundation

Issue #44 establishes the platform-owned D1 and domain foundation for player
ratings of existing events and maps. A review stores only the stable target
type and ID, the authenticated player account, a 1–5 rating, an optional
comment, anonymous-display preference, lifecycle state, and timestamps; it
does not copy catalog names or other event/map facts. One player has one
current review row per target, and retries or later submissions update that
row rather than creating parallel records.

New reviews are accepted only for implemented, non-archived events and active
maps. Withdrawn and invalidated rows remain auditable; comment hiding is
independent from whole-review invalidation, so a hidden comment can retain its
rating while an invalidated review is excluded from all aggregates. Ratings
are feedback only: they do not change map difficulty metadata, event weights,
release state, Agents projections, or Bastion build data.

The public read slice exposes one summary, a bounded batch of summaries, and a
paginated comment feed for an event or map. Summaries include the average,
valid-review count, 1–5 distribution, and the shared three-review
`sampleInsufficient` rule. Public comments exclude hidden, withdrawn, and
invalidated rows; hidden comments do not remove a still-valid rating from the
summary. Anonymous comments have no author projection, while other comments
carry only the current public display name. The API keeps these review reads
private and uncached, and the batch query resolves directory targets in a
bounded operation rather than issuing one query per card. Portal rendering and
maintainer moderation remain separate slices.

### Maintainer review moderation

Maintainer review routes are private administrative reads and writes. The
paginated list and detail response may include the platform player account,
numeric player ID, public-anonymous preference, review lifecycle fields, and
review audit context; player and public review routes continue to omit these
fields. Comment hide/restore changes only the comment projection, while
whole-review invalidation/restore changes the valid aggregate boundary. Both
operations retain the review row, record an audit event, accept an optional
reason, and use the existing actor-scoped idempotency records. The Portal uses
the shared admin workspace/table/dialog patterns and keeps mobile records in
document flow with stable review IDs.

The local integration chain in `packages/database/src/review.test.ts` runs the
same D1-backed service boundary for one event and one map. It covers player
creation, update, withdrawal, and replay; public summary/comment projections;
anonymous author omission; maintainer comment and whole-review transitions;
aggregate changes; shared contract parsing; and replay checks for idempotency
and audit cardinality. This is local integration evidence only. A health check,
deployment result, or API reachability check is not production review evidence;
production verification requires a separately approved, sanitized event and
map trace after the dependent deployment is live.

Portal uploads use a one-time platform upload URL backed by the private R2
binding. The URL is intentionally scoped to one upload session and is not a
public object URL. User screenshot objects use the shared `uploads/` namespace,
with high-entropy platform-generated keys under
`uploads/submissions/<submissionId>/`. The OCR Queue carries the opaque
submission ID and object key; the Worker verifies that the key belongs to the
Submission's stored attachment, reads that one object from R2, and sends only
its bytes to OCRKit's authenticated multipart endpoint. OCRKit receives
neither the object key nor access to the platform evidence bucket.

Administrative submission views are intentionally broader than player views.
Maintainers can inspect historical and in-progress submission states, the
unlisted CDN screenshot, and recognition output, including records that
predate the current lifecycle.
The platform does not silently discard those records from the administrative
queue; final approval, rejection, or resubmission decisions remain explicit
maintainer actions. The review queue lists the longest-waiting Submissions
first by default (least recently updated), and maintainers can switch to
newest first. Player endpoints remain ownership-scoped and expose only
the player's own submission status, evidence, and constrained OCR summary.

Player submission details remain session- and ownership-scoped, and maintainer
submission details remain behind the maintainer boundary. Those detail
responses expose the exact unlisted CDN URL needed to display the screenshot;
the browser loads image bytes directly from the cacheable R2 custom domain.
Possession of that URL is sufficient to read the image, so disclosure is not
authorization. Public status responses contain no evidence URL or object key.
Public achievement icons remain on their separate public API route. Player
detail returns only the recognized map, difficulty, player, and completion
values, never OCRKit's raw response or internal match evidence.

## Submission lifecycle

~~~text
Player API: processing → needs_review / completed / rejected
Internal lifecycle: upload_pending → ocr_pending → approved,
                                      ocr_review_required, or resubmission_required
                    ocr_review_required → approved / rejected / resubmission_required
~~~

The platform evaluates every eligible Challenge against its canonical
Conditions; there is no upload-time Challenge choice. Evidence must satisfy the
fields named by those Conditions and the centralized OCR schema, layout, and
confidence policy. Missing, unsupported, low-confidence, or conflicting evidence
remains in review without creating an unverified grant. A maintainer can
visually confirm unsupported OCR layouts or correct structured values when the
business facts are established; the same Conditions matcher then decides the
evidence-derived grants. When automatic extraction cannot express what the
screenshot visibly proves, the maintainer may additionally confirm specific
Challenges from the Submission's eligible set (the canonical Challenges that were
completable at `submissions.created_at`, in the recognized map's Gameplay
Revision, and not already owned or administratively revoked for the player).
Such a confirmation is reviewed evidence, not a direct Grant: approval
revalidates it against that eligible set and records it through the normal
Completion -> Grant chain, including lifecycle, `satisfies`, and revocation
rules, and the review audit and Submission outcome record the confirmation
basis. Before approving, the maintainer sees a read-only preview of the
Completions, Titles, and Verified Run evidence that approval would produce for
the current corrections and confirmations. The preview writes nothing: canonical
Challenge records that approval would create or replace are planned in memory
and materialized only by the approval itself. Challenge
eligibility for an already-created submission is evaluated at
`submissions.created_at`, not at OCR, queue, or review time. Thus a Pioneer
submission created in its half-open window remains processable after `endsAt`,
while a submission created before `startsAt` or at/after `endsAt` never gains
Pioneer eligibility later.

During approval, a maintainer may confirm or correct the complete visible
value of any safe structured OCR field. These are business corrections: they
rerun canonical Challenge matching and drive Grant and Verified Run outcomes
for that Submission. They are not OCR annotations; the platform no longer
derives training labels from review. Raw OCR evidence remains unchanged.

Each review decision, automatic or by a maintainer, is kept as its own
`submission_reviews` record; the latest one is the Submission's current
decision. The maintainer detail shows that latest decision (automatic or
maintainer, time, optional note) and keeps the decision controls, so a
maintainer may decide again. A later decision changes only the Submission's
status and reason: Submission status and Title state are separate, so it never
revokes Titles or Verified Runs the Submission already produced; removing a
Title goes through Grant revocation or a spot-check revocation. Maintainer
submission views carry the Submission's active Grants (from automatic or
maintainer approval), and the confirmation for a later rejection or
resubmission request names the Titles and Verified Run that stay. Re-approving
without a new outcome is accepted on those retained Grants, reported as already
owned. Rejections, resubmission requests, and spot-check revocations ask for
confirmation first; their note stays optional. A rejection or resubmission note is the reason the
player sees, while a spot-check revocation note is only kept in the audit.

Player-facing Submission detail describes an `ocr_review_required` record as a
submitted request only when the player asked for manual handling; automatic
routes to maintainer review (ambiguity, low confidence, Verified Run conflicts)
carry no player-visible reason beyond the waiting state.

Submissions come only from Portal uploads. They are
single-image submissions and enter `ocr_pending` only after the upload hash,
size, content type, and private object ownership are verified. The Portal waits
for OCR to finish before showing the player the next action. A selected
challenge is matched against its submission-time snapshot; a successful match
enters `ready_for_review` unless the rewardable evidence can be approved
automatically. When no challenge was selected, the OCR response is compared
against active map/title challenges. A unique rewardable match with complete
evidence can become `approved` directly; ambiguity or low confidence enters
`ocr_review_required`, and an explicit mismatch becomes
`resubmission_required`. `ocr_review_required` therefore represents a usable
but non-automatic record that a maintainer must inspect.
A submission-time rule snapshot or selection snapshot is authoritative for
downstream processing when present. For an unknown/unselected submission, the
candidate catalog and time-limited rule projections are resolved using the
persisted submission timestamp; public challenge visibility and new upload
sessions continue to use the current time. Automatic matching evaluates map
challenges only for the map recognized in the
screenshot and requires reliable map-name evidence; without a recognized map or
with low-confidence map evidence the record stays in maintainer review instead
of auto-approving. Difficulty coverage follows the hierarchy described in
[OCR integration](#ocr-integration): a recognized higher difficulty covers
lower map difficulty challenges for automatic approval and can issue each
covered rewardable map title in the same decision. The maintainer candidate
list remains exact to the recognized difficulty so that manual processing does
not present lower difficulty alternatives.

Approval records one or more accepted Submission outcomes; it does not imply
that the Submission has an active title Grant. Title issuance remains one D1
batch: title challenges use their direct `titleKey`, map challenges use their
explicit `reward_title_key`, and both retain map context. If the player already
owns the same active title in that scope, the Submission links to the existing
Grant and records reuse in the audit event. A Run-only approval keeps
`grant_id = NULL`; the normalized Verified Run is `created` once, while an exact
same-player match-code reuse receives 0 XP. New XP awards use v2 without a
Challenge bonus; untouched historical v1 snapshots and awards remain unchanged.
Public and player responses expose only the safe outcome status and awarded XP;
maintainer detail may additionally show the Verified Run ID and internal reason
or conflict fields. Pull requests
and game builds remain outside this slice; Bastion reads current metadata
independently through the Agents API.

Evidence spot-check revocation invalidates the active verified run only when the
revoked submission created that run; a reused submission cannot invalidate a
different source run. A later valid OCR retry restores that source run once.
Direct title-Grant revocation remains title-specific and never invalidates a
Verified Run. Screenshots without a reliable match code remain eligible for the
legacy title path, but do not produce a Verified Run outcome with XP.

For a same-player match-code conflict, the platform retains the original accepted
run and the conflicting Submission/evidence separately. A maintainer may record
that the original remains authoritative, or invalidate it with an idempotent,
audited actor/time/reason transition that updates the source outcome and map
projection. The corrected Submission is never merged into the original; it
continues through the existing reviewed OCR/submission path, where it can create
the replacement run under normal verification rules. Exact same-fact replays
remain reuse outcomes and do not become high-priority conflict records.

## Achievement catalog management

The administrator achievement surface displays the complete Title catalog,
including global and map-scoped Titles, alongside platform Challenges. A Title
has `draft`, `active`, or `retired` lifecycle and an independent public
visibility setting. Visibility controls public presentation; it does not change
whether a Challenge can produce a Completion. A Title is ordinarily obtainable
when it has at least one currently completable Challenge. Retiring a Title
stops ordinary acquisition while preserving existing Completion and Grant facts.
A maintainer may still explicitly issue a retired Title through its manual
Challenge.

Each Challenge awards exactly one Title and has `draft`, `active`, or `archived`
lifecycle, optional start/end timestamps, and an independent condition
visibility flag. Public-condition visibility controls whether the condition is
shown; it does not gate evaluation. Conditions use top-level AND/OR over their
configured facts. Material qualification changes create a new Challenge and
archive the prior one; copy and other presentation-only changes may update the
existing Challenge. The current legacy authoring and public-projection routes
still expose their schedule/release fields while records are adapted into the
canonical Challenge → Completion → Grant chain.

Manual issuance, including bounded batch issuance and historical migration,
records a manual or migration Completion before linking the resulting Grant.
Administrator changes require maintainer authorization, an idempotency key,
and an audit record. Historical challenge and submission records may retain
`map_variant = classic` as compatibility evidence. Current challenge
applicability comes from the explicit revision assignment and is snapshotted as
`gameplayRevisionId`; the legacy variant value does not act as a second map
identity.

### Map title rule model

Standard map titles (CONQUEROR, DOMINATOR, PIONEER) are governed by a
reusable `map_title_rules` entity — one row per rule kind — rather than
duplicated `achievement_challenges` rows per map. Each rule owns the
authoritative condition, evidence rule, submission mode, display strategy
(`map_name_suffix`, `map_pioneer`, or `fixed`), default reward slot, and
lifecycle status.

`PIONEER` is an exception-only rule: its default scope must always be
`explicit`, so it is not a challenge for every active map. A maintainer may
enable a map exception only for the limited window of a map rework or a new
map launch, with explicit start and end timestamps (the Portal defaults the
first window to 24 hours), then disable it when that window ends. A submission
must be created inside that window; its resolved window is persisted in the
immutable rule snapshot, so review and grant remain valid after the event ends.
`CONQUEROR` and `DOMINATOR` retain their configured default scope. The API,
database service, and rule projection all reject or ignore an `all_active`
Pioneer rule or an expired Pioneer exception so a migration or stale
configuration cannot reopen it globally.

Administrators manage these entities on the dedicated map-title-rule surface.
The ordinary map-completion screen may display a projection, but it is read-only
and links back to its authoritative rule. Applicability belongs to the exact
Gameplay Revision: only an enabled `map_title_rule` assignment on a `default` or
`selectable` revision projects the challenge. For `all_active` rules, the service
materializes those assignments on eligible revisions; `explicit` rules require
an explicit assignment. Per-map management exposes resolved inheritance and
writes only the permitted override fields and Pioneer submission window; it does
not change revision assignment or update `achievement_challenges` for a
map-title projection.

**Projection and exception resolution** — the deterministic resolution for a
`(ruleId, mapId, gameplayRevisionId)` follows these steps:

1. An inactive map or rule produces no projection.
2. A missing or disabled revision assignment produces no projection. The
   exception's `enabled` field never assigns or unassigns a challenge.
3. `PIONEER` additionally requires an explicit-scope rule and an enabled,
   bounded map exception whose window contains the submission creation time.
4. An enabled map exception may override `condition`, `evidence_rule`,
   `submission_mode`, and `slot` for the map. These values take precedence over
   the revision assignment's optional field overrides and the rule defaults.
   `title_key` and `display_kind` remain rule-level and cannot be changed by an
   exception. A disabled exception contributes no overrides, but leaves the
   revision assignment unchanged.

**Compatibility mapping** — the `map_title_rule_compat` table retains the
legacy `map.<mapId>.<kind>` public IDs used by existing `achievement_challenges`
rows. Each compat row links a legacy challenge ID to its authoritative rule and
map; the `is_standard_instance` flag distinguishes template projections (the
old per-map duplication pattern) from genuine map-specific exceptions. These
IDs are stable across rule changes.

**Submission-time snapshot** — at upload-session creation, the resolved
projection is serialised as an immutable JSON object and stored in
`submissions.rule_snapshot_json`. The snapshot captures `ruleId`,
`ruleRevision`, `mapId`, `titleKey`, `mapVariant`, `slot`, `displayKind`, `condition`,
`evidenceRule`, `submissionMode`, `defaultScope`, and `exceptionId`. Review
and grant decisions must read this snapshot rather than performing a live rule
lookup; the snapshot governs even if the rule or exception is subsequently
modified. Legacy submissions (`rule_snapshot_json IS NULL`) continue to resolve
through the direct `achievement_challenges` join or the `title_challenges` path.

**`map_title_rewards` remains a read-only compatibility layer** during the
current migration window. The rule model is the new source of truth; existing
`map_title_rewards` rows continue to serve the Agents API and grant display
paths until explicitly retired. New rules do not write to `map_title_rewards`.



## Random-event directory

The public Portal lists implemented and removed random events, their public
metadata, and linked challenges that are currently open. Maintainers create,
edit, archive, and link events in the Portal. The same Portal/API path accepts
a CSV preview and confirmed import; it validates every row before an atomic
write, records the source hash and audit event, and never stores the CSV.
Maintainers change several events at once through one idempotent batch
request (up to 100 events, changing only the listed fields, all or nothing,
recorded as a single audit event); restoring earlier values is another batch.
Challenge links are not part of it.
Maintainers may suspend or restore a whole game version through a separate,
idempotent operational state. Suspension leaves event lifecycle, balancing
metadata, and admin visibility unchanged, but omits that version's events from
the Bastion-facing `/v1/agents/events` projection. It takes effect on the next
Bastion sync/build/release; the platform does not trigger those operations.
Each event carries an optional `eventGroup`, a maintainer-set label for
grouping and search in the Portal. It is display metadata only: it does not
affect eligibility or probability, and it is separate from the Bastion-side
eligibility event groups. Maintainers set it in the editor or through an
optional trailing `事件组` CSV column; leaving it out of an update keeps the
stored value.
The default projection covers implemented and removed events. An explicit
`status` query parameter selects a single `releaseStatus` — `development`,
`implemented`, or `removed` — so agents can inspect events still under
development without putting them in the default build projection. The same
status contract applies to the event detail lookup and to event search
results.

## Agents content API

Bastion consumes current title metadata and active player grants through separate
read-only Agents endpoints. The global title list, detail, and title search are
one build projection of stable title definitions; they may include a global
title before its player-facing challenge is released, with `gameVersion: null`
until release metadata exists. That inclusion does not make the title visible,
earnable, or equipable through player-facing flows. Global active grants come from
`/v1/agents/player-title-grants`; map holders are queried per map through
`/v1/agents/map-title-holders?mapId=...`. These responses read D1 as the
authoritative source and never expose historical or revoked grants to the
Bastion build. Portal edits are immediately visible through the D1-backed
service. Optional HTTP response caching belongs at the HTTP boundary and must
not alter database-service reads or become a second catalog truth.
For an active map whose enabled revision projection is incomplete or otherwise
unavailable, the map-holder endpoint returns `503 AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE`;
it never returns a trustworthy-looking
empty holder page. A valid, projectable map with no active holders still returns
the ordinary `200` empty page.
Submission-status reads are intentionally uncached: workflow state is
authoritative in D1 and each refresh observes the latest committed transition.

The public `/v1/agents/*` API is a read-only projection of the platform's
current event, map, title, and achievement metadata plus title-holding facts
needed to generate Bastion's in-game title database. Bastion reads this API
during its build and release process; the platform does not import or consume a
formal Bastion content snapshot. The API provides paginated event, map,
achievement, and title queries, resource details, bounded cross-content search,
active global title grants, and map title-holder relationships. Map title-holder
relationships are resolved from active map-scoped Grants and their projectable
map/revision context, independently of equipped global rows. The player
projection is intentionally narrow: ordinary requests omit numeric player IDs;
requests carrying the Bastion build token expose only the current display name,
stable game player ID, active title keys, and required map scope. It does not
expose QQ identities, submissions, review sources, timestamps, audit data,
player progress beyond active title ownership, runtime analytics,
administrative fields, private evidence, game implementation, or build
artifacts.
Agents achievement responses include rule-derived map-title instances alongside
ordinary title challenges. A dynamic instance carries its source rule and an
explicit `dynamic: true` slot descriptor, so Bastion must not infer dynamic
map-title meaning from a nullable slot.

`/v1/agents/maps` and `/v1/agents/maps/:mapId` additionally expose the stable
map's `gameplayRevisions` build projection. It contains only `default` and
`selectable` revisions with `enabled: true`, explicit `isDefault`/
`isSelectable` flags, the machine `gameplayRevisionId`, optional explicit
`mapVariant: "classic"` compatibility marker, revision `gameVersion`, and a
validated `spatialConfig`. The marker is separate from the revision identity.
The spatial object has finite three-component vectors for
`bastionPositions`, `resetPosition`, `endPosition`, `thirdPersonPosition`, and
`creditsPosition`; optional control center/jump/respawn vectors with paired
axis/threshold; and deterministic portal/springboard position arrays. Control
roles are independently present only when that stable Bastion map implementation
uses them; an axis requires at least one respawn vector, while cardinality is
validated by the consuming map implementation. A multi-stage map may add
deterministic `alternateStages`, each with a stable non-localized `stageId`, a
platform-owned finite `setupDetection` position and positive radius, and its
full role set; Bastion evaluates that selector once during setup and only then
selects one of these platform-owned configurations. It is not a free-form
payload. `challengeRefs` contains references only; the full
challenge definition remains authoritative in `/v1/agents/achievements` and
is joined by map revision ID plus challenge family/ID.

A revision that composes runtime stages uses `spatialConfig.composition` plus
one `spatialConfig.stages` entry per atomic stage. The route root owns shared
points that exist once for the whole combined map: reset, end, third-person,
credits, and the required respawn-axis settings. Each stage owns its Bastion
spawn points, control centers, exactly one paired control jump/respawn point,
portals, springboards, and optional setup detector. The route uses one scalar
axis/threshold pair shared by all stages. A shared point is not copied into
each stage. The consuming Bastion build must assemble stage-local point arrays
in its selected order; the platform does not store coordinate copies for stage
pairs or route permutations. Route boundaries that depend on which stages are
selected (for example cyclic Busan routes) are stage-scoped: a stage may
optionally carry `resetPosition`, `thirdPersonPosition`, and `creditsPosition`,
which override the route-root value when that stage is the route's first stage,
and `endPosition`, which overrides it when that stage is the route's last stage.
Absent stage values inherit the route root; the platform never stores the
resolved per-route result.
`composition.selectionCount` is the total number of ordered stages Bastion
selects for one game. The first stage selection is either `setup_detection`
with an explicit fallback stage ID, or `random`; the remaining selection is
`random_unique`. Setup-detected selection requires a detector on every
non-fallback stage and forbids a detector on the fallback. Random first-stage
selection forbids unused setup detectors. Stage IDs are unique and stable, and
the stage list is emitted in stage-ID order; the platform never stores the
per-game selection. Keep a composed revision in `preparing` until the consuming
Bastion build accepts this response shape. The existing static and
`alternateStages` shape remains valid for other revisions.

An active map with no projectable default remains listed with an empty
`gameplayRevisions` array so a consumer cannot mistake an omitted map for a
retired map. Preparing, historical-only, malformed, incomplete, duplicate-
default, or invalidly assigned revisions are not Bastion-ready and do not
appear in that array. The map holder endpoint applies the same readiness
filter and every holder item carries `gameplayRevisionId`; the global player
grant endpoint contains only active global grants, never revision-scoped map
grants. These are additive fields under contractVersion `1`.

## QQ screenshot ingress

`/上传` is a second ingress into the same Submission, private evidence, OCR,
Challenge matching, review, and Grant lifecycle as the Portal upload. QQBot
resolves exactly one image (the command message's own attachment, otherwise the
quoted message's) and calls `POST /v1/qq/submissions` with the QQ command
message ID, group and member OpenIDs, and the attachment URL, filename, and
declared type. The `Idempotency-Key` derives from the command message identity.
The request carries no map, Challenge, or BattleTag; the platform derives the
Player from the active QQ binding and rejects unbound, banned, or inactive-group
callers before fetching anything.

The platform fetches the QQ attachment while the URL is valid, over HTTPS only
from trusted QQ hosts, with revalidated bounded redirects, a time limit, and a
10 MiB cap. The stored type comes from the image's actual signature, not the
declared metadata. The bytes are written to private R2 before any D1 Submission
exists, and OCR then runs from the R2 object key through the existing queue. The
attachment URL is never persisted in D1, audit payloads, queue messages, or logs.

The Submission ID is derived from the idempotency identity, so retries and
concurrent duplicates resolve to one Submission. Reusing the key with a
different payload is rejected with `IDEMPOTENCY_CONFLICT`. The idempotency
record first holds an enqueueing claim; a redelivery that finds a claim still
inside the queue send is rejected as in progress, while an interrupted claim is
taken over and resumed from the stored Submission/attachment without refetching
or duplicating the operation. If the queue send fails, the claim returns to the
resumable state and the OCR row is marked `OCR_QUEUE_SEND_FAILED`, which the
existing admin OCR retry path also recognizes. Results are read
through the Portal; QQ result notification is not part of this ingress.

## QQBot and login

QQBot is a channel adapter. Binding starts from a Portal invitation link whose
target BattleTag is resolved from the administrator-issued invitation. The
player manually types `@`, selects the robot from the group member list, and
sends `/验证 CODE` in an enabled group; QQBot
forwards only the stable group/member identity and code. The binding page
offers a copy-command action that copies the full `/验证 <code>` command. A
clean first binding
is activated atomically after verification and records an automatic audit
decision. Rebinds, transfers, conflicts, and ambiguous recovery cases remain
pending for maintainer approval; uncompleted claims cannot log in, submit, or
read player data. An expired confirmation code does not invalidate the binding
link: the player can regenerate a fresh code from the same original invitation
link without maintainer action.
Maintainers may issue up to 100 BattleTag-targeted invitations in one
idempotent batch. The Portal presents a per-player copy action for the binding
link, code, and player instructions. The link carries the invitation code; the
public page shows the resolved BattleTag as read-only and does not accept
replacement identity fields. New invitation codes are encrypted at
rest and can be retrieved individually by a maintainer while still active, so
they can be copied again without exposing them in the invitation list.
The administrator list retains each invitation's BattleTag, issuance time,
expiry, and lifecycle status, but never its plaintext code. A maintainer may
revoke only an unused, unexpired invitation with an auditable reason; revocation
makes the invitation unusable immediately.

An administrator may explicitly attach currently unclaimed historical title
record IDs to an invitation. The Portal uses a searchable holder selection for
discovery, but the selected platform-owned record IDs are the authorization;
BattleTag or holder-name equality never authorizes migration. After a QQ
binding claim is approved, the platform creates or reuses the normal historical
`player_title_grants` without a second administrator action. Each item records
created, reused, conflict, or retry-required state; conflicts never reassign an
existing grant, and a recoverable migration failure does not roll back account
creation, binding, or session issuance. Retry requires the invited Player
Account to have an active QQ binding. The legacy Passkey-first invitations
created by the deployed invitation flow are retried only against their recorded
Player Account after that account has an active QQ binding. Existing invitations
without an authorization remain unchanged.

Map-only titles are scoped to the map that supplied their reward slot. The
platform does not expose them as global titles, and it preserves Bastion's
map-specific pioneer display prefixes when returning a map-filtered title catalog.

A Portal login attempt creates a six-character code valid for two minutes.
The user sends /验证 CODE in an enabled QQ group. The API verifies the group
and claim policy before consuming the code, records the group/member
environment, and the original invitation browser exchanges a completed claim
for a 30-day browser session. QQBot replies and recalls the code message only
after a successful verification; it never receives browser session tokens.

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
outbox, delivered through a dedicated Queue, and retried by later group-policy
changes until QQBot acknowledges the refresh. QQBot keeps the last successful
snapshot when an event refresh fails and fails closed before
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

Portal upload completion and maintainer re-recognition create a pending OCR
result whose UUID is the processing-round job ID. The Queue dispatches the
stored image to `POST /api/v1/ocr/challenge/jobs` with multipart `file` and
`job_id`; HTTP 202 `{jobId, status: "accepted"}` acknowledges intake, not
recognition. Queue retries reuse the same UUID. The Submission stays
`ocr_pending` while OCRKit recognizes the image.

OCRKit sends the complete recognition evidence or `OCR_RECOGNITION_FAILED` /
`OCR_JOB_EXPIRED` to `POST /v1/ocrkit/jobs/{jobId}/result`, authenticated with
the existing `OCRKIT_API_TOKEN` Bearer credential. The platform owns matching
and all business outcomes. A single conditional D1 claim serializes callbacks
and manual review of the same pending round; transient failures release the
claim and return 503 for delivery retry. Duplicate and stale callbacks return
204 without repeating Grants or Verified Runs. The existing 15-minute stale
repair bounds abandoned OCR rounds; claiming a result refreshes the processing
window. A process crash during result handling retains its claim until stale
repair recovers it.

OCRKit remains the recognition-only service. The platform accepts only response
schema version `1`, `ok: true`, and required field evidence at or above its
configured confidence gate before value matching. For map challenges, this covers
`map_name`, `difficulty` when the map rule declares a difficulty target,
`challenge_completed`, `player`, and an explicitly required map variant. Map
challenges, including map-title projections, do not use generic achievement
titles or the left achievement panel as evidence. For title challenges, it
covers `challenge_completed`, `player`, and title evidence.

Difficulty values follow a fixed hierarchy
(`简单` < `一般` < `困难` < `专家` < `传奇` < `地狱`): a recognized harder
difficulty satisfies an easier challenge target, `普通` is normalized to
`一般`, and a `地狱：`-prefixed label counts as `地狱`. When several
map-difficulty challenges match exactly, automatic matching selects only the
highest recognized difficulty as the decision, but the single approval batch
creates or reuses grants for every covered grantable exact match so a harder
clear awards the covered lower-difficulty titles too. Automatic decisions
additionally require reliable map-name evidence — the field status must be
`ok` with confidence at
or above the gate — and map challenges are evaluated only for the map named in
the screenshot. A statistics panel without a checked title (for example, one
listing only aggregate counters) is not treated as checked achievement
evidence; title evidence requires a matching `achievement_titles` entry or a
title followed by a checked mark in the panel text. OCR `classic` is a
recognized legacy map-variant fact that can support the corresponding retained
revision evidence. Current challenge scope is determined by the assigned
`gameplayRevisionId`, not by an independent `map_variant` branch. Neither kind
of map challenge needs title evidence.

Mastery acceptance is fail-closed by default: both
`MASTERY_MIN_GAME_VERSION` and `MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS` are
empty until release records prove that the Bastion run-code HUD and the matching
OCRKit layout are available. Operators may set both values only after that
cross-repository release boundary is recorded. A missing, malformed, or partial
setting disables new mastery acceptance; it never changes the independent
legacy title path.

When explicitly enabled, the platform requires the configured minimum game
version, one configured OCR layout, and `ok` field evidence at confidence
`>= 0.9` for completion, viewer player, map name, difficulty, version, run
code, and completion duration. The platform normalizes and checks the code,
resolves the map against exactly one active canonical map, and decides
duplicate, conflict, acceptance, and XP; OCRKit supplies only evidence. Missing,
weak, unsupported, or ambiguous mastery evidence produces no XP and does not
block independent legacy title matching. Clearing either runtime setting and
redeploying is the write rollback: existing ledger rows remain retained.

No materialized mastery projection is stored. Player and maintainer projections
are recomputed from `mastery_runs`; support reconciliation uses the
`rebuildMasteryProfiles` service read and does not mutate accepted, invalidated,
or conflict rows. Schema rollout remains covered by `pnpm run check:migrations`.

A stable map may have several gameplay revisions. A revision is
`preparing`, `default`, `selectable`, or `historical`; each map has exactly one
default revision. The default represents current progression, while a selectable
revision can be intentionally restored for its own progression and a historical
revision remains readable without becoming current again. The database enforces
the single-default invariant. Revision IDs are machine identifiers: the legacy
compatibility marker remains in `legacyMapVariant`, while its historical
revision uses the reserved `v0` sequence rather than a label such as
`classic`.

Creating a rework creates a `preparing` revision and retains the existing
default until promotion. Promoting that revision atomically moves the replaced
default to the administrator-selected `selectable` or `historical` state; the
service never copies player progress and never leaves an observable duplicate
or missing default.

Map-title rules, direct map challenges, map-scoped title challenges, and the
legacy `CLASSIC`/`PIONEER` projections are all assigned through the same
revision-aware challenge-assignment model. Every projected map challenge
exposes its exact `gameplayRevisionId`; assignments to a `default` or
`selectable` revision determine catalog visibility instead of a legacy variant
branch. At submission or grant time that resolved revision is an immutable
snapshot on the submission, grant, and Verified Run facts. A rework therefore
creates independent new progression without rewriting old facts. The default
`/v1/me/mastery` profile uses only a map's default revision; an explicit
revision query can read the selected or historical revision's own profile and
bounded run history.

Map reviews are stored and queried against the exact Gameplay Revision ID.
Single-target reads, writes, comments, and summaries require that ID; batched
map summaries pair each map ID with its Revision ID. Existing reviews recorded
before revision attribution remain retained with a NULL Revision ID, are not
backfilled by inference, and are excluded from every Revision-specific public
aggregate. Maintainer review records continue to expose those unscoped rows for
audit. Event reviews remain bound to the stable Event and return a NULL Revision
ID.

The Agents projection is stricter than the retained revision model: a map is
build-projectable only when exactly one enabled default revision has valid
spatial data and every enabled assignment resolves to a current public map
challenge. Valid selectable revisions may then join the same projection.
Historical progression remains attributable through its stored revision ID,
but cannot inflate the normal build projection or its holder list. A challenge
lookup that is shared by multiple enabled revisions must include
`gameplayRevisionId`; no endpoint infers identity from labels, order, or a
missing value.

The platform owns candidate selection, rule-snapshot evaluation, approval,
Grant reuse, audit, and spot-check revocation. Uncertain or ambiguous results
are routed to maintainers; OCRKit does not decide eligibility or approval.
Bastion implementation and build changes remain reviewable, idempotent, and
reconciled through Bastion's own CI and release process.

## OCR accuracy feedback

The platform is not an OCR annotation tool. ROI-level transcription review and
training labels live in OCRKit Model Studio; Submission review produces only
business corrections. What the platform still collects is a single
screenshot-level accuracy mark per OCR result.

An authenticated player may mark whether the latest recognition result for
their own Submission read the screenshot `accurate` or `inaccurate`; a
maintainer may set the same mark from the review surface. One row per
(Submission, OCR result) is shared between both actors and the latest writer
wins. The mark binds to a specific OCR result ID; marking a stale result is
rejected, and a re-recognition starts unmarked. Retries are idempotent via the
Idempotency-Key header. The mark carries no transcription content, never
changes the Submission decision, challenge selection, Grants, Verified Run
outcomes, or mastery state, and never overwrites original OCR evidence.

OCRKit may consume the marks only as a sampling and prioritization hint; a
platform accuracy mark is never itself a training label. Historical
`ocr_feedback_proposals`, `reviewed_annotations`, and dataset snapshot tables
remain for audit but are no longer produced or consumed by any workflow.

## OCR training screenshot sets

The platform supplies OCRKit Model Studio with immutable, versioned screenshot
sets. A set is the explicit approval that its member screenshots may be used
for OCR training; ROI review, labels, crops, and train/holdout splits are
produced entirely in OCRKit.

Membership is selected automatically by rule, not by manual per-screenshot
curation: the latest stored screenshot of every approved Submission, plus the
latest stored screenshot of any Submission whose current recognition carries an
`inaccurate` accuracy mark. A stale mark on an older result does not qualify a
screenshot. Maintainers can exclude anomalous screenshots from a set before
finalization; they do not opt normal screenshots in. Candidates that lack
stored evidence or a usable layout version are recorded as automatic
exclusions.

Set membership freezes at draft creation and finalized sets are immutable: a
later approval or mark change belongs to the next set version and never
rewrites an existing set. Member rows carry the complete delivery payload and
provenance — source screenshot id, R2 object key, SHA-256, MIME type, byte
size, layout version, and the accuracy mark when present — so a finalized set
remains complete and its evidence remains retained as training provenance even
if the source Submission later changes or is removed. Copies OCRKit already
downloaded are OCRKit-local training data and are not recalled.

A draft either becomes finalized or is discarded — drafts are not left open
indefinitely, and correcting a draft means discarding it and creating a new
version. Discarded sets stay readable to maintainers for audit but are never
served to OCRKit; only finalized sets are visible through the private
`GET /v1/ocrkit/screenshot-sets/{version}` endpoint, so the maintainer hands
OCRKit the version of a finalized set. The endpoint is authenticated with the
`OCRKIT_SNAPSHOT_TOKEN` secret; the payload contains only the member facts
above — never player identity, QQ data, Submission decisions, Grant/mastery
state, or risk signals — and never returns image bytes. OCRKit downloads the
member objects directly from the evidence bucket using its own read-only
credentials scoped to the screenshot prefix.
