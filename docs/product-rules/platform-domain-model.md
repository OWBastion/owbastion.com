# Platform Domain Model and Product Lifecycles

This document defines the accepted product and domain contract for platform
convergence work. It is authoritative for the intended product semantics, even
when the current implementation still uses transitional structures.

Capability implementation and verification status remain exclusively in
[feature-status.md](feature-status.md). Existing implementation details in
[integrations-and-workflows.md](integrations-and-workflows.md) may temporarily
describe pre-convergence mechanisms. Follow-up implementation work must
reconcile those mechanisms with this contract rather than treating them as the
desired end state.

## Product objective

The platform exists primarily to:

1. maintain authoritative platform metadata for titles, challenges, maps,
   gameplay revisions, random events, players, and related operations;
2. accept screenshot evidence and turn it into verified gameplay facts;
3. issue and manage titles through one coherent qualification path;
4. give repeated play durable value through XP, mastery, personal bests, and
   leaderboards;
5. keep administrator workflows compact and organized around real operational
   tasks instead of exposing every persistence entity as a separate product.

The domain should minimize parallel truth. A lower-level accepted fact may feed
multiple downstream products, but downstream projections must not copy or
redefine that fact.

## Core fact graph

The primary gameplay evidence flow is:

~~~text
Submission
  -> OCR evidence / maintainer correction
  -> Verified Run
       -> XP / mastery projections
       -> leaderboard projections
       -> Challenge evaluation
            -> Challenge Completion
                 -> Title Grant
                      -> equipped title preference
~~~

These concepts have distinct responsibilities:

- **Submission** is evidence and workflow state.
- **Verified Run** is the durable accepted gameplay fact derived from one
  player's screenshot evidence.
- **Challenge** defines one path to obtain one Title.
- **Challenge Completion** records that a Player satisfied a Challenge.
- **Grant** represents current ownership of a Title.
- **Mastery, XP, personal bests, long-term rankings, and seasonal rankings** are
  projections over valid Verified Runs.
- **Equipped title** is a player preference over currently owned Titles, not a
  separate ownership fact.

A Submission may produce a Verified Run without satisfying any Challenge. A
single Verified Run may satisfy multiple still-relevant Challenges. The same
lower-level fact may therefore update mastery and title acquisition in one
processing pass without creating parallel gameplay records.

## Stable identities and keys

Stable platform business keys are required for objects that are consumed across
repositories or remain conceptually stable across edits:

- Title: stable business key;
- Map: stable business key;
- Random Event: stable business key.

Display names, localization, descriptions, icons, ordering, and similar
presentation fields are mutable and must not be used as stable identifiers.

Challenge does not require a manually maintained business key. It uses its
stable internal ID because a material qualification-rule change creates a new
Challenge rather than reusing the old rule identity.

## Title contract

### Lifecycle

A Title has only:

- `draft`;
- `active`;
- `retired`.

A separate public-visibility field controls whether the Title may appear on
player-facing/public surfaces. A Title can therefore be active and publicly
visible before it has an obtainable Challenge, which supports promotion or
pre-release display without inventing a `preview` lifecycle state.

"Obtainable" is derived, not stored. A Title is obtainable only when at least
one of its Challenges is currently completable.

Retiring a Title prevents new Challenge Completions for it. Existing current
Grants remain owned unless an explicit revoke or reset rule removes them, and
historical Completion and Grant records remain auditable.

### Category

Title category or tags are display and filtering metadata only. They must not
select a different issuance engine or lifecycle. Map, event, community,
developer, and special Titles all use the same Challenge -> Completion -> Grant
chain.

### Ownership

A Player has at most one current active ownership state for a Title.

Once a Player currently owns a Title, normal gameplay processing skips all
Challenges that award that Title. Repeated play continues to create or update
Verified Run-derived projections, but it does not create duplicate Completion
or Grant records merely to prove the same Title again.

Multiple active Challenges may award the same Title when product design needs
multiple acquisition paths. They remain independent ways to obtain the same
single ownership state.

## Challenge contract

### Purpose

A Challenge is an acquisition condition for exactly one Title. Challenges are
not a generic rewardless rules engine.

### Lifecycle

A Challenge has only:

- `draft`;
- `active`;
- `archived`.

It may additionally have:

- `startsAt`;
- `endsAt`;
- a public-condition visibility field.

There is no separate `enabled`, `available`, `obtainable`, `preview`,
`paused`, or `sunsetting` business state.

A Challenge is currently completable only when all of the following are true:

~~~text
challenge.status == active
AND current time is inside its configured time window
AND its Title is not retired
AND the Player does not currently own that Title
AND no explicit administrative block prevents automatic re-grant
~~~

Expired Challenges stop producing new Completions. Existing Completion and
Grant records remain unless another explicit lifecycle action, such as a
Gameplay Revision reset, says otherwise.

### Conditions

Conditions are embedded Challenge configuration. They are not reusable
standalone entities.

The initial expression model is intentionally small:

- one list of conditions;
- one top-level `AND` or `OR` mode.

Do not add nested expression trees until a confirmed product requirement cannot
be expressed by this model.

Current Challenges are expected to be primarily decidable from one Verified
Run. The model may leave room for future aggregate conditions such as "complete
X valid runs", time-window counts, or multi-map sets, but no generic task
progress state, counters, or workflow engine should be introduced before such a
Challenge is actually required. Aggregate progress should remain derivable from
Verified Runs.

A material qualification change creates a new Challenge and archives the old
one. Material changes include changing difficulty, required counts, relevant
events, map/revision scope, or other qualification semantics. Presentation-only
changes such as copy, iconography, sorting, or explanatory text may edit the
existing Challenge.

### Satisfies relationships

A higher Challenge may explicitly satisfy a lower Challenge when that
relationship is part of the product rule. The result is ordinary completion of
the lower Challenge, followed by its own Title Grant if that Title is not
already owned.

The relationship belongs to Challenge semantics, not Grant inheritance.

## Manual acquisition

Special, community, developer, compensation, appeal, or other administrator-led
issuance still uses the same domain chain.

A Title may opt into one active **manual Challenge**. The administrator-facing
operation may be reduced to:

- choose one Title;
- choose one or more Players;
- optionally enter an audit note;
- confirm.

The platform then creates the manual Challenge Completion and corresponding
Grant for each Player. Batch issuance is only a UI/operation convenience; each
Player keeps an independent Completion and Grant.

If a Title has no active manual Challenge, administrators do not bypass the
model by directly inserting a Grant.

## Submission contract

### Player-facing lifecycle

Player-facing Submission state should remain compact:

- `processing`;
- `needs_review`;
- `completed`;
- `rejected`.

Internal Queue, OCR, annotation, Grant, and downstream projection states should
not leak into the player workflow vocabulary.

Later invalidation of a downstream Run, Completion, or Grant does not rewrite a
previously processed Submission back to `rejected`. The Submission records
that the evidence workflow completed; later corrections belong to the affected
business facts.

### Ownership and identity

A Submission belongs to the authenticated Player Account that created it. The
screenshot does not re-prove player identity, and the platform does not transfer
a Submission to another Player during review.

BattleTag is the Player's game identity binding, not an OCR identity field for
the current screenshot contract.

### Evidence retention

Evidence that still supports a Verified Run, Completion, Grant, reviewed
annotation, or finalized dataset provenance is retained. A Player must not be
able to physically delete evidence whose removal would sever an accepted
business fact from its provenance.

Evidence with no accepted downstream fact, such as rejected evidence, may be
eligible for deletion according to product and retention policy. No complex
retention system is required until storage, privacy, or legal requirements make
one necessary.

## OCR and evidence evaluation

OCRKit owns image processing, recognition, model training, evaluation, model
versioning, and model lifecycle.

The platform owns:

- the accepted business fields and normalization;
- confidence/quality policy for automatic business decisions;
- compatibility gates for Bastion HUD/layout/game versions;
- Challenge evaluation;
- manual correction and review;
- all resulting Run, Completion, Grant, mastery, and ranking facts.

OCRKit output is structured evidence, never an approval decision.

Challenge qualification and OCR recognition must not maintain parallel rule
definitions. Challenge Conditions are the business rules. The platform compares
structured OCR evidence against those Conditions.

If the evidence fields required by a Challenge are complete and meet the
platform's quality policy, the platform may decide automatically. Missing,
unsupported, conflicting, or low-confidence evidence enters
`needs_review`.

Administrators correct the structured evidence, not downstream rewards. After
correction, the platform reruns Challenge matching over the corrected complete
evidence and recalculates affected downstream results.

Challenge-specific OCR confidence thresholds or duplicated "OCR rule" objects
are not part of the product model.

## Verified Run

### Role

The current concept named "Verified Mastery Run" is generalized to
**Verified Run**. It is not owned by Mastery; Mastery is one consumer.

Do not create a second gameplay ledger beside the existing accepted-run data.
Implementation work should converge the existing run model and naming.

### Uniqueness

The strong gameplay duplicate boundary is:

~~~text
(playerAccountId, matchCode)
~~~

The match code identifies a room/run, so different Players from the same room
may independently own Verified Runs with the same `matchCode`.

For one Player and one match code:

- the first accepted occurrence creates one valid Run;
- equivalent replays reuse that Run and do not award additional XP;
- materially conflicting evidence must not create a second valid Run and is
  routed to maintainer handling.

File hashes or similarity signals may assist evidence handling but do not define
gameplay identity.

### Required facts and correction

A Verified Run retains the normalized facts needed by its consumers, including
the exact Gameplay Revision, canonical map and difficulty, match code,
applicable game/layout provenance, and reliable settlement statistics.

Administrators may correct recognized gameplay facts when the source evidence
supports the correction. The platform records the before/after audit and then
recalculates affected projections and Challenge results from the corrected Run.
Administrators do not manually patch XP, mastery, ranking, and Challenge state
independently.

Invalidation and restoration remain auditable and idempotent. Invalidated Runs
stop contributing to derived projections; restoration contributes exactly once.

## XP and mastery

XP represents value from the verified gameplay run itself.

Challenge completion does not directly add Mastery XP. The existing
`challengeBonus` concept is removed from the target product contract.

The XP rule may use approved Verified Run facts such as difficulty, map factor,
and reliable performance fields. It remains deterministic, centralized,
versioned, explainable, and reproducible from stored inputs.

Mastery is a projection over valid Verified Runs and is scoped to
`(Player, Map, Gameplay Revision)`.

Aggregated mastery state must remain rebuildable from the Run ledger. Cached or
materialized projections are performance mechanisms, not independent sources of
truth.

A new Gameplay Revision starts a new current mastery scope. Old Runs and their
historical XP remain retained but do not contribute to the new Revision's
current mastery.

## Leaderboards and seasons

Leaderboards are projections over valid Verified Runs, not independent scoring
facts.

The product may expose multiple dimensions, including:

- mastery XP;
- verified completion count;
- high-difficulty depth;
- personal-best dimensions;
- map-specific records;
- overall depth and breadth;
- selected Challenge-derived achievements when their competitive meaning is
  stable and comparable.

Invalidating or restoring a Run changes every affected leaderboard projection
through the same derivation path.

The product supports both long-term and seasonal rankings.

A Season is intentionally small:

- name;
- start time;
- end time;
- `draft | active | archived`;
- public visibility.

A Season does not reset or copy Mastery. Seasonal rankings filter the same
Verified Runs by the Season's time window. A later need for special seasonal
scoring may introduce a versioned ranking rule, but every Season does not
receive a copied scoring system by default.

## Gameplay Revision

Gameplay Revision is the version boundary for map gameplay whose qualification,
mastery, reviews, or competitive meaning is no longer fairly comparable with
the prior version.

Map Challenges that depend on gameplay completion bind to an exact Gameplay
Revision.

A map rework/reset is an explicit release operation, not an accidental side
effect of editing map metadata. The operation:

1. enables/promotes the new Gameplay Revision according to the map lifecycle;
2. archives old Revision-bound Challenges;
3. resets the current ownership state of Titles in the declared reset scope;
4. clears an equipped Title when its ownership is reset;
5. activates the new Revision's applicable Challenges.

Historical Completion and Grant records remain for administrative traceability,
but the player-facing product does not need a dedicated "previously owned"
Title history.

A Revision reset is different from an administrative punitive Grant revocation:

- `revision_reset`: old-version ownership stops being current, but satisfying
  the new Revision's Challenge may automatically grant the Title again;
- administrative revoke: automatic re-grant remains blocked until an
  administrator explicitly restores or clears the block.

When a Title is in the Revision reset scope, the reset applies to its current
ownership state even if the old ownership had another acquisition source.
After reset, a valid manual Challenge may still be used for an explicit
administrator re-grant.

Map player ratings and comments bind to the exact Gameplay Revision. The Map
page defaults to the current Revision's aggregate, so a major rework does not
inherit ratings for materially different gameplay.

## Random Event boundary

The platform owns Random Event:

- stable key;
- public/admin metadata;
- rarity and current weight;
- other build metadata that is genuinely platform-owned.

Bastion owns:

- the event's gameplay effect;
- runtime eligibility;
- hero/map/state filtering;
- mutual exclusion;
- active-event lifecycle;
- cleanup and reset behavior.

Ordinary metadata and weight changes edit the current Event plus Audit; they do
not create an Event Revision.

If a Bastion event rework materially changes Challenge difficulty or semantics,
the product change may update platform Event metadata and Bastion gameplay
together, while affected Challenges are archived and recreated as needed. Do
not copy Bastion implementation history into the platform merely to version the
Event.

## Map and Event lifecycle

Map and Random Event use the same minimal content lifecycle:

- `draft`;
- `active`;
- `retired`.

Unused draft records may be physically deleted when safe. Once a Map or Event is
referenced by durable business facts, retirement preserves historical identity
instead of forcing fact migration.

Ordinary metadata edits do not create revisions. Only a real compatibility or
historical semantics boundary justifies a version entity, such as Gameplay
Revision.

## Player account and authentication

**Player Account** is the stable business subject. Titles, Runs, Completions,
Mastery, rankings, Submissions, and reviews reference the Player, not one
authentication or channel identity.

Identity responsibilities are:

- Passkey: Portal authentication;
- BattleTag: game identity;
- QQ identity: optional channel identity for QQBot and QQ notifications;
- Invitation: temporary first-registration admission and binding credential.

Changing QQ identity, changing BattleTag display data, or adding/replacing a
Passkey does not move business facts to a new Player.

The accepted onboarding direction is:

~~~text
administrator invitation
-> Player Account creation / trusted binding
-> BattleTag binding
-> Passkey registration
~~~

A Player may register multiple Passkeys.

Password and email-login systems are not required for the initial Passkey
introduction. If all Passkeys are lost, the initial recovery path may remain an
administrator-assisted identity verification and Passkey re-registration
workflow rather than a speculative automated recovery system.

Current authorization needs only ordinary Player and administrator boundaries.
Do not introduce general RBAC until distinct real operator roles require it.

## Grants and revocation

Grant is downstream of Challenge Completion. Grant does not prove that a
Challenge was completed.

Two loss-of-ownership semantics must remain distinct:

1. **Completion/Run invalidation**: the qualification evidence was not valid.
   If no valid qualification remains, the dependent current Grant is removed.
   Future valid qualification may grant the Title again.
2. **Administrative Grant revoke**: the qualification may remain historically
   valid, but the product intentionally removes current ownership. Automatic
   re-grant remains blocked until administrator action restores eligibility.

Revision reset is a third explicit lifecycle reason as described above.

If an inactive/revoked/reset Title is currently equipped, the equipped
preference is cleared rather than silently selecting another Title.

## Public player profile and privacy

Public ranking may expose only privacy-safe competitive facts such as:

- player display identity suitable for public use;
- ranking position;
- XP/mastery;
- verified completion counts;
- approved personal-best values;
- currently public Titles and achievements.

Private evidence and operational data never become public ranking/profile
fields, including:

- Submission screenshots;
- match codes;
- QQ identifiers;
- OCR raw output;
- review/audit detail;
- internal risk signals;
- private storage references.

A Player may have one simple public-profile visibility setting. Disabling the
profile does not change competitive eligibility or historical ranking facts; a
public leaderboard may anonymize the Player rather than changing the scoring
result.

Title public visibility reuses the Title's own visibility field rather than
adding profile-specific title visibility.

## Player reviews

A player review binds to `(Player, Gameplay Revision)` for maps so ratings
reflect the version actually played. Random Event reviews bind to the stable
Event because the platform does not create Event Revisions. The same versioned
principle applies to any future review target that introduces a real experience
version boundary.

One Player keeps at most one current review per target/version and edits that
record rather than creating rating spam.

Moderation stays intentionally small:

- hide comment;
- restore comment;
- inspect context when needed.

Review rows remain auditable. Avoid a generic moderation workflow engine,
mandatory reasons, or tagging/state complexity without a demonstrated product
need.

## Annotation and dataset flow

Routine Submission review should produce training-quality correction data when
the administrator corrects complete OCR evidence. The desired flow is:

~~~text
Submission review
-> corrected structured OCR evidence
-> reviewed annotation
-> dataset candidate
-> immutable dataset snapshot when selected
-> OCRKit training/evaluation
~~~

Administrators should not have to review the same screenshot a second time in a
separate annotation workflow merely to make the correction usable.

Standalone Annotation UI is therefore a secondary QA/query/exception tool, not
the normal path.

Reviewed annotations are eligible dataset candidates by default; maintainers
may exclude anomalies. The platform may freeze immutable dataset snapshots with
provenance for reproducible consumption.

OCRKit owns train/validation/test splitting, augmentation, hyperparameters,
training, evaluation, checkpoints, model publication, and rollback. The
platform does not become a second ML model registry.

Player OCR feedback may create a candidate correction but does not enter a
training dataset without administrator review.

## Agents API and cross-repository ownership

The platform is authoritative for current platform-owned metadata and state.
Bastion consumes the minimum current build projection through the Agents API.

The Agents API is a consumer projection, not a general platform CRUD model. It
must not expose draft/admin-only fields, Audit, private evidence, or irrelevant
database structure merely because those fields exist internally.

Normal propagation is:

~~~text
platform metadata edit
-> current Agents projection
-> next normal Bastion build/release consumes projection
~~~

Do not add:

- platform-to-Bastion push synchronization;
- copied repository JSON as a second authority;
- runtime Workshop requests to the platform;
- a synchronization state machine without a concrete requirement.

Cross-repository product changes may modify multiple owners together, but each
repository changes only the facts it owns.

## QQBot and notification boundary

QQBot is a channel adapter. It may perform ingress, commands, replies,
notifications, deduplication, and short-lived delivery state, but it does not
own long-lived Player, binding, Title, Submission, OCR, review, or Grant truth.

The platform decides that a business event happened and who should be notified.
QQBot decides how to deliver that notification through QQ.

A dedicated event bus is not required merely to express this separation. The
current business workflow may call a notification adapter directly until scale
or delivery guarantees justify a more persistent mechanism.

## Editorial content

Blog, changelog, and similar editorial content are Git-backed Markdown rendered
by Nuxt. The administrator product does not need a parallel CMS/Studio editing
surface.

Business-object copy belongs to the object that owns it:

- Map description on Map;
- Event description on Event;
- Title description on Title.

Do not introduce a generic page-content management system. A future global
announcement may use a small dedicated Announcement model if a real workflow
requires it.

## Administrator information architecture

Top-level administrator navigation should represent frequent operational work,
not every table.

The accepted top-level areas are:

- Titles;
- Challenges;
- Maps;
- Random Events;
- Players;
- Invitations;
- Screenshot Review;
- OCR;
- Reviews / Moderation.

Secondary or contextual tools include:

- Grants;
- Verified Runs;
- Mastery;
- Seasons;
- Leaderboards;
- Audit;
- Annotation;
- Dataset;
- OCR Feedback.

Blog/Studio/changelog editing does not belong in the core admin application.

Standalone CRUD pages may be removed when their capability is fully represented
inside the coherent workflow. Do not preserve empty or duplicate admin surfaces
solely for compatibility with the old information architecture.

### Title-centered operations

Creating and maintaining acquisition should read as one continuous workflow:

~~~text
Title
-> Challenge
-> map/event/revision/other conditions
-> evidence evaluability
-> activation
~~~

Map and Event pages maintain their own data and may show reverse links to
Challenges that reference them. They do not become alternate editors for the
same reward relationship.

### Screenshot-centered review

Screenshot review is a top-level exception queue because it is the human
intervention point in an otherwise automated path.

The reviewer should primarily:

- inspect the original evidence;
- inspect structured OCR output;
- correct recognized fields;
- review Challenges matched from the corrected evidence;
- approve the evidence or reject it.

Approval should then create/recalculate the appropriate Verified Run,
Completion, Grant, mastery, and ranking outcomes automatically.

## Audit

Audit records meaningful writes to business facts, including lifecycle,
qualification, review, correction, binding, issuance, revocation, reset, and
annotation decisions.

Normal reads and page views are not business Audit events.

Object detail pages should expose relevant Audit history in context. A global
Audit page is a secondary query tool rather than a primary workflow.

## Simplicity constraints

Implementation work based on this contract should prefer deletion and
convergence over compatibility layers.

In particular, do not introduce new persistent concepts merely to preserve
pre-convergence names or UI boundaries when existing accepted facts can express
the requirement.

Before adding a new state, entity, rule object, configuration flag, or
cross-repository contract, show the current requirement that cannot be
satisfied by:

- Submission evidence;
- Verified Run facts;
- Challenge Conditions;
- Challenge Completion;
- Grant;
- Gameplay Revision;
- existing identity bindings;
- a rebuildable projection.

The implementation sequence and migration details belong in follow-up Issues
and PRs, not in this product contract.
