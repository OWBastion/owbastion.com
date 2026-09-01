# Integrations and Workflows

This document describes public contracts and current implementation boundaries.
It intentionally omits credentials, private endpoints, deployment configuration,
and private operational data.

Capability status is maintained only in the [feature status matrix](feature-status.md).

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

## Implemented platform slice

The current API implements versioned v1 QQ flows:

- authenticated QQBot confirms invitation-bound binding claims from a stable QQ
  member OpenID; it never creates or merges player accounts directly;
- authenticated QQBot binding and verification calls use stable QQ group/member
  metadata; QQBot does not create current Portal screenshot submissions;
- channel writes require an idempotency key; equal retries replay the original
  response and a changed reuse is rejected;
- D1 stores player accounts, bindings, submissions, attachment metadata,
  idempotency records, audit events, QQ login attempts, and sessions;
- when EVIDENCE_BUCKET is configured, submission creation validates and
  retrieves HTTPS image sources, writes private objects to R2, and records
  content metadata;
- public submission status is an unauthenticated, opaque-ID lookup that exposes
  the submission ID, map, timestamps, workflow status, and when present a safe
  mastery outcome (`created`, `reused`, `ineligible`, or `invalidated`) with
  awarded XP. A conflict remains maintainer-only. It returns `Cache-Control: private, no-store`,
  reads D1 for every request, and excludes evidence, OCR output, player or QQ
  identity, run code, mastery-run ID, review metadata, grants, and internal
  conflict or risk signals;
- the Portal can create and poll a one-time QQ login attempt, then display the
  bound player and up to five recent submissions after session verification.
- the Portal can create a single-image upload session without a target, upload
  private evidence, and complete the upload; after OCR accepts the screenshot,
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
- the existing submission → private evidence → Queue/OCR path can additionally
  derive a mastery outcome. The platform, not OCRKit, verifies the bound player,
  completion state, canonical active map and difficulty, supported game version
  and OCR layout, reliable field evidence, and normalized run code before it
  records XP. `submission_outcomes` keeps zero or more independent
  `mastery_run`, `title_grant`, and `challenge` outcomes, so a mastery-only
  approval can have `grant_id = NULL` without creating a fake title Grant;
- the platform stores the current title and map metadata, and
  map-only `PIONEER`/`CONQUEROR`/`DOMINATOR` reward slots, and historical title
  holder snapshots without linking source names to platform accounts;
- maintainers can explicitly migrate one historical holder snapshot or all of
  its unclaimed title records to a player account as auditable title grants,
  and can revoke an individual grant with a recorded reason; historical holder
  names are never matched or claimed automatically;
- maintainers can directly create a `manual` title Grant for an existing
  player and catalog title for leak correction, appeals, or special rewards.
  Global titles have no map context; map titles require a configured map title
  rule, challenge, or reward association. Retired catalog titles remain eligible when
  explicitly selected by a maintainer. The dedicated
  `/v1/admin/title-grants/manual/batch` route applies the same validation and
  resolution rules to a bounded Cartesian product of players and title targets;
  it is distinct from historical migration `/bulk`, and its active Grants are
  consumed by the existing public and Agents projections;
- maintainers can update a player's BattleTag display name while keeping the
  numeric player ID stable; the update is idempotent, rejects a normalized-name
  conflict with another account sharing the same numeric ID, and records an
  audit event;
- a versioned Queue message invokes OCRKit and persists the raw result and match
  evidence. For an unselected challenge, the platform compares the response
  with the current active catalog and auto-approves exactly one complete,
  high-confidence rewardable candidate; ambiguous or low-confidence matches
  become `ocr_review_required`, while an explicit mismatch becomes
  `resubmission_required`;
- the maintainer Portal can inspect private evidence and OCR output and record
  an idempotent review decision. For ambiguous evidence, the maintainer may
  select every checked achievement supported by the screenshot; approval
  atomically creates or reuses each platform title Grant and links each
  selected challenge outcome to the Submission. A mastery-only approval
  records its accepted mastery outcome without a title Grant.
- maintainer-only mastery-run reads list and filter verified runs by player,
  map, difficulty, lifecycle state, accepted date, acceptance origin, and run
  code. Detail includes the source Submission/evidence route, recognized
  settlement facts, XP snapshot inputs, resulting map projection, lifecycle,
  and same-player run-code conflicts; it is always private and uncached.
- automatic approval writes the OCR result, approved review, title Grant reuse
  or creation when applicable, independent submission outcomes, submission rule
  snapshot, and audit records in one D1 batch. A deterministic sample can
  create a pending spot check without blocking the automatic result; a
  maintainer can confirm the sample or revoke evidence-derived outcomes, with
  the affected player and Agents projections then reflecting the revoked state.
- maintainers can create and list achievement challenges and immediately update
  title-challenge rules, including their Portal display category override and
  optional map scope. A map-scoped title challenge uses one unique title key;
  an empty map allowlist means all active maps, while a populated allowlist
  restricts submissions and map-scoped grants to those maps;
- the public and administrator map challenge directories project standard map
  titles from `map_title_rules` once per applicable active map. Each instance
  keeps its stable `map.<map>.<kind>` compatibility ID and exposes its source
  rule ID, title key, display kind, and explicit slot semantics; it is not an
  independently editable challenge record. Legacy map-completion rows are
  deduplicated against `map_title_rule_compat`: a row with a compat mapping is
  excluded from the directories so the rule projection is the single source,
  while rows without a mapping (including CLASSIC) remain direct read
  projections;
- maintainers set a challenge to `sunsetting`, then manually confirm retirement;
  sunsetting challenges
  remain available for submission.
- maintainers may schedule a title challenge with a start and end timestamp;
  scheduled challenges remain visible as `未开放`, become submittable during
  the window, and stop accepting new submissions after it without a cron job.
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
  ├→ approved (unique automatic match) / ocr_review_required / resubmission_required
  ├→ awaiting_player_confirmation → ready_for_review / resubmission_required
  ├→ ready_for_review → approved / rejected / resubmission_required
  ├→ ocr_review_required → approved / rejected / resubmission_required
  └→ resubmission_required
~~~

When an ambiguous automatic match enters `ocr_review_required`, a maintainer
may select one or more general achievements with checked title evidence or
map challenges belonging to the map identified in that submission's OCR
evidence. A map
candidate must carry the persisted map identity and match the OCR map name;
when OCR has recognized a difficulty, a manual map candidate must also carry
that same difficulty. The platform rejects challenges outside that candidate
set, including legacy candidates with missing scope data; it must not fall
back to the full active challenge catalog. It persists the ordered selection
set, records an audit event, and moves the submission to `ready_for_review`;
the final approval grants every selected reward in one review transaction
while retaining one primary challenge for legacy views. Challenge eligibility for
an already-created submission is evaluated at `submissions.created_at`, not at
OCR, queue, selection, or review time. Thus a Pioneer submission created in its
half-open window remains processable after `endsAt`, while a submission created
before `startsAt` or at/after `endsAt` never gains Pioneer eligibility later.

The legacy QQ flow retains its evidence retrieval states. Portal uploads are
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
Grant and records reuse in the audit event. A mastery-only approval keeps
`grant_id = NULL`; the normalized run is `created` once, while an exact
same-player run-code reuse receives 0 XP. Public and player responses expose
only mastery outcome status and awarded XP; maintainer detail may additionally
show the mastery-run ID and internal reason or conflict fields. Pull requests
and game builds remain outside this slice; Bastion reads current metadata
independently through the Agents API.

Evidence spot-check revocation invalidates the active mastery run only when the
revoked submission created that run; a reused submission cannot invalidate a
different source run. A later valid OCR retry restores that source run once.
Direct title-Grant revocation remains title-specific and never invalidates a
mastery run. Screenshots without a reliable run code remain eligible for the
legacy title path, but do not produce a mastery-run outcome with XP.

For a same-player run-code conflict, the platform retains the original accepted
run and the conflicting Submission/evidence separately. A maintainer may record
that the original remains authoritative, or invalidate it with an idempotent,
audited actor/time/reason transition that updates the source outcome and map
projection. The corrected Submission is never merged into the original; it
continues through the existing reviewed OCR/submission path, where it can create
the replacement run under normal verification rules. Exact same-fact replays
remain reuse outcomes and do not become high-priority conflict records.

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
platform-owned title metadata. Map
challenges retain their platform-owned map, difficulty, display name, and introduced
version; administrators may keep them enabled, mark them as sunsetting, retire
them, or reopen them.

Sunsetting retains player visibility and new upload sessions while displaying
the planned release version. Retiring a challenge prevents new upload sessions
while preserving submissions that already exist. Those submissions continue
through OCR and review under the ordinary submission lifecycle. Reopening
clears the retirement version. Map-scoped title challenges may declare
`map_variant = classic`; an empty `map_variant` means the formal map version. The
platform persists the effective requirement in the upload snapshot, matches only
the corresponding recognized version, and exposes both the required and recognized
variants in admin review details. Administrator changes require maintainer
authorization, an idempotency key, and an audit record.

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
and links back to its authoritative rule. Per-map management exposes resolved
inheritance and writes only the permitted exception fields, including the
Pioneer submission window; it never updates
`achievement_challenges` for a map-title projection.

**Exception precedence** — the deterministic resolution algorithm for a
`(ruleId, mapId)` pair follows five steps:

1. A retired or inactive map produces no projection regardless of the rule.
2. A disabled exception (`enabled = 0`) removes the projection for that map,
   overriding even an `all_active` rule default.
3. An enabled exception — override fields win over the rule default. Only
   `condition`, `evidence_rule`, `submission_mode`, and `slot` may be
   overridden; `title_key` and `display_kind` remain rule-level and cannot be
   changed by an exception.
4. No exception exists and the rule's `default_scope` is `all_active` — the
   rule default applies to the map.
5. No exception and `default_scope` is `explicit` — no projection.

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

## Agents content API

Bastion consumes current title metadata and active player grants through separate
read-only Agents endpoints. Title definitions come from `/v1/agents/titles`;
global active grants come from `/v1/agents/player-title-grants`; map holders are
queried per map through `/v1/agents/map-title-holders?mapId=...`. These responses
read D1 as the authoritative source and never expose historical or revoked
grants to the Bastion build. Portal edits are immediately visible through the
D1-backed service. Optional HTTP response caching belongs at the HTTP boundary
and must not alter database-service reads or become a second catalog truth.
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
active global title grants, and map title-holder relationships. The player
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
`mapVariant: "classic"`, revision `gameVersion`, and a validated
`spatialConfig`. The spatial object has finite three-component vectors for
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

An active map with no projectable default remains listed with an empty
`gameplayRevisions` array so a consumer cannot mistake an omitted map for a
retired map. Preparing, historical-only, malformed, incomplete, duplicate-
default, or invalidly assigned revisions are not Bastion-ready and do not
appear in that array. The map holder endpoint applies the same readiness
filter and every holder item carries `gameplayRevisionId`; the global player
grant endpoint contains only active global grants, never revision-scoped map
grants. These are additive fields under contractVersion `1`.

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
BattleTag or holder-name equality never authorizes migration. After a binding
claim becomes approved, the platform creates or reuses the normal historical
`player_title_grants` without a second administrator action for a clean first
binding. Each item records created, reused, conflict, or retry-required state;
conflicts never reassign an existing grant, and a recoverable migration failure
does not roll back the binding or session. Existing invitations without an
authorization remain unchanged.

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
title followed by a checked mark in the panel text. `classic` identifies the
classic version of the recognized map: it satisfies map challenges that do not
declare another variant, while classic-specific map challenges require the
`classic` map variant. Neither kind of map challenge needs title evidence.

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
snapshot on the submission, grant, and mastery-run facts. A rework therefore
creates independent new progression without rewriting old facts. The default
`/v1/me/mastery` profile uses only a map's default revision; an explicit
revision query can read the selected or historical revision's own profile and
bounded run history.

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

## OCR annotation feedback pipeline

The platform owns the durable annotation workflow that turns production OCR
evidence into reviewed training feedback without making production screenshots
automatically become training data.

### Player OCR feedback

The server derives a feedback prompt from centralized OCR quality and
field-level policy (field criticality, confidence/status gates, and
deterministic calibration sampling). The player projection receives only a
derived mode (`none`, `targeted`, `grouped`), the prompt-origin category, and
safe field identifiers/values; Portal code contains no independent confidence
thresholds. A high-confidence usable Submission requires no confirmation; a
passive correction entry remains available for confident-but-wrong results.
Unsupported/cropped/unusable evidence stays in the existing
resubmission/manual-review path and is never turned into an annotation task.
Calibration spot checks are distinguishable in provenance from
uncertainty-triggered prompts.

An authenticated player can confirm or correct only safe, player-visible OCR
fields of their own Submission. Each feedback record preserves the immutable
recognition context (source Submission/evidence, field, original recognized
value, OCR model/layout version, feedback type, prompt origin, proposed value,
actor, time). Retries are idempotent through a unique per-field proposal
boundary. Feedback is an annotation proposal only: it never changes the
Submission status, challenge selection, Grants, mastery outcomes, or OCR
evidence, and never becomes reviewed truth by itself.

### Maintainer annotation review

Maintainers review proposals in a queue ordered by a derived, explainable
priority (player corrections, uncertain/conflicting fields, and high-confidence
calibration failures above routine confirmations; critical field families and
repeated error patterns add weight). The queue exposes only the priority
category and reasons — never raw scoring internals — and priority never
substitutes for visual verification or affects Submission risk/business state.

A maintainer can Accept, Edit + Accept, or Reject without a mandatory reason,
or create a reviewed annotation directly for an eligible OCR field when no
player proposal exists. Reviewed annotations preserve source Submission,
OCR result/model/layout, field, original OCR value, player proposal and actor,
prompt origin, final reviewed transcription, maintainer actor/time, review
state, and optional note as separately traceable facts; original OCR evidence
and the player proposal are never overwritten. Accepting or rejecting an
annotation never mutates the Submission, challenge, Grant, or mastery
lifecycle. A correction uses an auditable supersession path: the previous
accepted annotation is marked superseded and its content is preserved; a
finalized dataset snapshot is never retroactively mutated.

### Reviewed dataset snapshots and OCRKit consumption

Maintainers explicitly create a draft snapshot from eligible reviewed
annotations (accepted, non-superseded, with model/layout provenance and source
evidence, and no prior snapshot membership); every exclusion is reported with
its reason, and no dataset is created automatically when feedback arrives.
Finalizing freezes membership and provenance; later annotations or corrections
belong to a later snapshot and never alter a finalized snapshot. Snapshot
records keep the exact visible transcription, the business-normalized value,
and the original OCR prediction distinct; the platform never manufactures a
training transcription from business metadata.

OCRKit consumes finalized snapshots through a private, versioned HTTP contract
(`/v1/ocrkit/datasets/:version`) authenticated with the `OCRKIT_SNAPSHOT_TOKEN`
secret. It reads only snapshot metadata and member annotation facts, and
retrieves source evidence through a platform-side proxy bounded to snapshot
members; OCRKit never receives direct D1 access, broad R2 credentials, QQ
identity, review risk signals, Grant/mastery decisions, or unrelated Submission
payloads. Missing or deleted source evidence is reported explicitly
(`410 EVIDENCE_UNAVAILABLE`) and never silently replaced; repeated reads and
download retries do not alter snapshot state. Source-level train/holdout
splitting and ML label generation remain OCRKit responsibilities.
