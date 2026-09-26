# ADR 0003: Converge gameplay evidence, title acquisition, and progression on shared facts

- Status: Accepted
- Date: 2026-09-24
- Decision owners: OWBastion maintainers
- Scope: `OWBastion/owbastion.com`, with consumer/producer boundaries for
  Bastion, OCRKit, and QQBot

## Context

The platform accumulated several correct but overlapping mechanisms as features
were added independently:

- title issuance through direct Grants, title challenges, and map-title rules;
- screenshot processing that could require player/admin challenge selection in
  addition to OCR evidence;
- a `Verified Run` whose accepted gameplay facts are useful beyond
  Mastery;
- OCR matching rules that can duplicate Challenge qualification rules;
- standalone admin CRUD surfaces for low-frequency or derived concepts;
- progression, ranking, title acquisition, and review flows that all need the
  same underlying gameplay facts but can drift when modeled separately.

The operational result is too many administrator entry points and too many
places where a product rule can be represented.

The product review that led to this ADR confirmed that the platform's main
responsibilities are title issuance, authoritative metadata maintenance,
screenshot evidence processing, and making repeated verified play valuable
through progression and ranking.

The complete accepted product contract is maintained in
[platform-domain-model.md](../product-rules/platform-domain-model.md). Capability
status remains in
[feature-status.md](../product-rules/feature-status.md).

## Decision

Converge the platform on the smallest shared fact graph:

~~~text
Submission
  -> Verified Run
       -> XP / Mastery / Leaderboards
       -> Challenge
            -> Challenge Completion
                 -> Grant
~~~

The consequences of this decision are:

1. Generalize the existing `Verified Mastery Run` concept to **Verified Run**
   rather than creating another gameplay ledger.
2. Treat Challenge Conditions as the single qualification rule. OCR provides
   structured evidence; the platform evaluates that evidence against the
   Challenge instead of maintaining a parallel Challenge-specific OCR rule.
3. Require all Title acquisition, including administrator-led issuance, to flow
   through Challenge Completion before Grant. Manual issuance uses a simple
   manual Challenge and may still have a compact batch UI.
4. Treat Mastery, XP, personal bests, long-term rankings, and seasonal rankings
   as rebuildable projections over valid Verified Runs.
5. Remove Challenge-derived XP bonuses from the target progression contract;
   XP describes the verified run itself.
6. Use Gameplay Revision as the explicit compatibility/reset boundary for map
   gameplay, qualification, mastery, and map reviews. Do not introduce Event
   Revision merely to mirror Bastion implementation changes.
7. Keep lifecycle models small and derive availability instead of persisting
   redundant enablement states.
8. Organize the administrator product around frequent workflows rather than
   persistence entities, and allow duplicate CRUD surfaces to be removed once
   their capability is represented by the unified workflow.
9. Keep Player Account as the stable business subject; Passkey, BattleTag, QQ,
   and Invitation each serve a narrower authentication, game identity, channel,
   or admission purpose.
10. Preserve repository ownership: the platform owns business metadata/state,
    Bastion owns gameplay implementation, OCRKit owns recognition/model
    lifecycle, and QQBot owns QQ channel adaptation.

## Lifecycle decisions

The accepted minimal lifecycles are:

- Title: `draft | active | retired`;
- Challenge: `draft | active | archived`;
- Map/Event: `draft | active | retired`;
- Season: `draft | active | archived`.

Public visibility and time windows are orthogonal fields where needed.
"Obtainable", "available", and similar states are derived rather than stored as
additional business states.

A material Challenge rule change creates a new Challenge. A map rework creates
or promotes a new default Gameplay Revision, establishing a new qualification
scope and revision applicability while preserving revision-bound historical
Grants. Historical business records remain auditable.

## Alternatives considered

### Keep the current specialized models and only simplify navigation

Rejected. Hiding old pages would reduce visible clutter but retain multiple rule
systems and duplicated business state. New features would continue to choose
between map-title rules, title challenges, direct Grants, Verified Run facts, and
OCR-specific matching rules.

### Create a new generic rules engine

Rejected. The confirmed product requirements need simple Challenge Conditions,
not a reusable arbitrary expression/workflow platform. A generic engine would
add state and abstraction before a real requirement justifies it.

### Make Submission the durable gameplay fact

Rejected. Submission is evidence/workflow state. One accepted gameplay fact may
be re-reviewed, corrected, invalidated, or reused independently of the upload
workflow, and a Submission can produce title and progression outcomes without
those outcomes becoming Submission state.

### Keep Verified Run as a Mastery-owned ledger and add another run model later

Rejected. The same accepted run facts are already required by Challenges,
Mastery, XP, personal bests, and leaderboards. A second run ledger would create
parallel truth and duplicate invalidation/deduplication semantics.

### Version every mutable catalog object

Rejected. Ordinary Title/Event/Map metadata edits need Audit, not a permanent
revision entity. Gameplay Revision exists because map gameplay can cross a real
comparability and reset boundary. Event implementation remains Bastion-owned;
material event reworks create new affected Challenges without copying gameplay
implementation history into the platform.

## Consequences

### Positive

- one gameplay fact can feed progression, ranking, and title qualification;
- one Title issuance chain works for automated and manual acquisition;
- OCR correction can recalculate downstream outcomes instead of requiring
  separate manual edits;
- administrator navigation can remove low-frequency duplicate CRUD surfaces;
- rankings and mastery remain rebuildable and auditable;
- cross-repository ownership stays explicit;
- new product features have fewer states and authorities to coordinate.

### Costs and migration risk

- current map-title rules, direct manual Grant paths, Challenge lifecycle states,
  Submission confirmation behavior, and Mastery-specific run naming may need
  migration or replacement;
- existing APIs and Portal pages may expose transitional concepts that cannot be
  removed until consumers are migrated;
- Gameplay Revision reset introduces a new default qualification scope and
  updates revision applicability, requiring explicit, auditable operational
  design;
- correcting a Verified Run can affect XP, mastery, Challenge Completion, Grant,
  and leaderboard projections and must therefore be transactionally coherent or
  safely reconcilable;
- the Passkey direction is accepted product design but remains separate
  implementation work.

## Implementation guidance

Follow-up work must be split into reviewable slices. Do not implement this ADR
as one large migration.

Each slice should:

1. identify the current source of truth it replaces or generalizes;
2. preserve historical provenance and idempotency;
3. avoid creating a compatibility layer unless an active consumer requires it;
4. update the feature-status matrix only for capability state actually achieved;
5. perform correctness validation and a separate necessity/ablation pass.

The intended dependency order is roughly:

1. generalize Verified Run;
2. converge Challenge -> Completion -> Grant;
3. evaluate OCR evidence directly against Challenge Conditions;
4. implement explicit Gameplay Revision reset lifecycle;
5. align Mastery/leaderboard/Season projections;
6. simplify identity/authentication around Player Account and Passkey;
7. consolidate administrator information architecture and remove superseded
   surfaces.

The exact issue breakdown may differ when code inspection reveals a smaller
safe sequence.

## Revisit conditions

Revisit this decision if a confirmed product requirement cannot be represented
without one of the following:

- a second durable gameplay fact ledger;
- nested or reusable generic condition expressions;
- a separate Event Revision entity;
- independent Challenge-specific OCR rules;
- a richer authorization model than Player/Admin;
- a new cross-repository runtime synchronization channel.

Any such proposal must identify the concrete current requirement and why the
existing fact model cannot satisfy it.
