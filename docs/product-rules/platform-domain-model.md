# Platform Domain Model

The accepted product and domain contract. Workflows live in the sibling documents
([index](README.md)); decisions in [ADR 0003](../adr/0003-platform-domain-convergence.md).

The platform exists to: maintain authoritative metadata (titles, challenges, maps,
revisions, events, players); turn screenshot evidence into verified gameplay facts; issue
titles through one qualification path; give repeated play durable value (XP, mastery,
personal bests, leaderboards); keep admin workflows compact. Minimize parallel truth:
downstream projections never copy or redefine a lower-level fact.

## Fact graph

```text
Submission -> OCR evidence / maintainer correction -> Verified Run
  -> XP / mastery -> leaderboards
  -> Challenge evaluation -> Challenge Completion -> Title Grant -> equipped title
```

- **Submission**: evidence and workflow state. **Verified Run**: the durable accepted fact
  from one player's screenshot. **Challenge**: one path to one Title. **Completion**: a
  Player satisfied a Challenge. **Grant**: current ownership of a Title in a qualification
  scope (an exact Gameplay Revision or a non-revision scope). **Mastery, XP, personal bests,
  rankings**: projections over valid Runs. **Equipped title**: a preference over owned Titles.
- A Submission may produce a Run without satisfying a Challenge; one Run may satisfy several.

## Identities

Titles, Maps, and Random Events have stable business keys; display names, descriptions,
icons, and ordering are mutable and never identifiers. A Challenge uses its internal ID
because a material rule change creates a new Challenge.

## Titles

- Lifecycle `draft`/`active`/`retired`; separate public visibility. "Obtainable" is derived
  (at least one currently completable Challenge), never stored. Retiring stops new
  Completions; Grants stay valid until explicitly revoked.
- Category/tags are display metadata only; every Title uses the same
  Challenge -> Completion -> Grant chain.
- Ownership is per qualification scope, not global `Player x Title`: at most one active
  ownership per Title per scope. Holding it skips that scope's other Challenges for the same
  Title (repeat play still updates Run projections). Different Revisions are independent:
  an old-revision Grant neither satisfies nor blocks the new revision's Challenge. Several
  active Challenges may award one Title in a scope as separate paths. A Player may equip a
  Title with any active Grant in a valid scope.

## Challenges

- One acquisition condition for exactly one Title; not a generic rules engine.
- Lifecycle `draft`/`active`/`archived`, optional `startsAt`/`endsAt`, and a
  public-condition visibility field. No `enabled`, `paused`, `scheduled`, `retired` states;
  legacy fields map into these during the adapter period.
- Currently completable only if all hold: status `active`; now inside the window; Title not
  retired; Player holds no active ownership of that Title in the scope; no administrative
  block on automatic re-grant. Expired Challenges stop producing Completions; existing
  records stay immutable.
- Conditions are embedded, one list with one top-level `AND`/`OR`; no nested trees until a
  confirmed need. Aggregate progress stays derivable from Runs (no counters or workflow
  engine). A material change (difficulty, counts, events, map/revision scope) creates a new
  Challenge and archives the old; presentation-only edits update in place.
- A higher Challenge may explicitly `satisfies` a lower one: ordinary completion of the lower,
  then its own Grant if not owned in scope. It is Challenge semantics, not Grant inheritance.
- Manual acquisition (special, community, developer, compensation, appeal) uses the same
  chain through a Title's one optional active manual Challenge: choose Title, Players,
  optional note, confirm. Each Player gets an independent Completion and Grant. Without a
  manual Challenge, admins cannot insert a Grant directly.

## Submissions and evidence

- Player-facing states: `processing`, `needs_review`, `completed`, `rejected`; internal
  Queue/OCR/review states never leak. Later invalidation of a Run, Completion, or Grant never
  rewrites a processed Submission to `rejected`.
- A Submission belongs to the authenticated account that created it and is never transferred.
  BattleTag is the game-identity binding, not an OCR field.
- Retain evidence that supports a Run, Completion, Grant, or finalized screenshot-set member;
  players cannot delete it. Evidence with no accepted fact (e.g. rejected) may be deleted per
  retention policy. No complex retention system until needed.
- OCRKit owns recognition and the model lifecycle; its output is structured evidence, never a
  decision. The platform owns business fields and normalization, confidence policy,
  Bastion HUD/layout/version gates, Challenge evaluation, correction, review, and all
  resulting facts. Challenge Conditions are the only business rules; there are no
  Challenge-specific OCR thresholds or duplicated "OCR rule" objects. Complete evidence at
  policy may decide automatically; otherwise `needs_review`. Admins correct evidence, not
  rewards; the platform reruns matching and recalculates.

## Verified Run

- It generalizes "Verified Mastery Run"; Mastery is one consumer. No second gameplay ledger.
- Duplicate boundary: `(playerAccountId, mapId, gameVersion, matchCode)`. Different players
  in one room may share a code. The first accepted occurrence creates one valid Run; an
  equivalent replay reuses it with no XP; materially conflicting evidence never makes a second
  valid Run and goes to a maintainer. Hashes or similarity may assist but never define
  identity.
- A Run keeps normalized facts: exact Gameplay Revision, canonical map and difficulty, match
  code, game/layout provenance, reliable settlement stats. Admins may correct recognized
  facts when evidence supports it; before/after is audited and XP and Mastery recompute from
  the same Run (source Submission, decision, and lifecycle stay attached). Admins never patch
  XP, mastery, ranking, or Challenge state independently.
- Invalidate and restore are auditable and idempotent: invalidated Runs stop contributing;
  restored Runs contribute exactly once.

## XP and mastery

- XP v3: only Legend (传奇, 450) and Hell (地狱, 600) earn XP; lower runs record 0. Bonuses
  add as percentages of base: +5% per Challenge confirmed on the Submission, +10% for the
  Player's first XP-earning clear of the Beijing day (decided when recorded; not reassigned
  when an earlier Run is invalidated), and a map-rating bonus (T0 +20%, T1 +16%, T2 +12%,
  T3 +8%, T4 +4%, T5/unrated 0).
- v1/v2 snapshots stay historical; a legacy Run keeps its rule on correction, a v3 Run keeps
  its Challenge count and re-derives rating and daily-first. Corrections record the prior
  snapshot. The rule is deterministic, centralized, versioned, and reproducible.
- Mastery is a projection scoped to `(Player, Map, Gameplay Revision)`, rebuildable from the
  ledger; caches are never truth. A new revision starts a new current scope; old Runs and XP
  remain but do not count there.

## Leaderboards and seasons

- Projections over valid Runs (XP, completion count, depth, personal bests, map records,
  stable comparable Challenge achievements), long-term and seasonal. Invalidating or
  restoring a Run flows through the same derivation.
- A Season is only name, start, end, `draft | active | archived`, and public visibility. It
  never resets or copies Mastery; seasonal boards filter the same Runs by window. A versioned
  ranking rule is introduced only if special scoring is needed.

## Gameplay Revision

The version boundary for map gameplay whose qualification, mastery, reviews, or competitive
meaning is no longer fairly comparable. Map Challenges bind to an exact revision.

- States: `preparing` (not yet consumed by Bastion), `default` (the single enabled default),
  `selectable` (enabled alternative such as `CLASSIC`), `historical` (archived).
- An enabled revision recognizes its own challenges, completions, and Grants. A revision
  re-enabled as `selectable` recognizes its own prior progress again without leaking to others.
  A `historical` revision stops producing completions, but its records stay immutable and
  valid; lifecycle changes never flip a valid Grant between current and non-current.
- A rework/reset is an explicit release: promote the new revision to `default`; keep the old
  as `selectable` or make it `historical`; activate the new revision's Challenges with fresh
  progression (never copied); keep old Challenges and Grants intact. An equipped Title
  clears only if no active Grant remains in any enabled or non-revision scope.
- Revision transitions differ from revocation: they change which scopes apply and never
  mutate or revoke Grants. Administrative revoke removes one Grant and blocks automatic
  re-grant until an admin clears the block.
- The regular `随机事件` mode is the only permanent mode; others are limited-time Standalone
  Modes (see [catalog-and-challenges.md](catalog-and-challenges.md)).

## Grants and revocation

A Grant follows a Completion and does not prove one. Two losses stay distinct: (1)
Completion/Run invalidation (evidence invalid): if no valid qualification remains in scope,
the dependent Grant is removed and a future valid qualification may grant again; (2)
administrative revoke: qualification may stay valid but ownership is removed and automatic
re-grant stays blocked until an admin restores eligibility. When a Player no longer holds any
active Grant for a Title in an enabled scope, the equipped preference is cleared, never
silently replaced.

## Events and maps

- The platform owns an event's stable key, public/admin metadata, current weight and derived
  rarity (`<= 0.4` SSR, `<= 0.8` SR, `<= 1.2` R, else N), and other build metadata.
  Bastion owns gameplay effect, runtime eligibility, filtering, mutual exclusion, active
  lifecycle, and cleanup. Metadata and weight edits change the current Event plus Audit;
  there are no Event Revisions, and Bastion implementation history is not copied in. A
  rework that changes Challenge semantics updates both owners and archives and recreates
  affected Challenges.
- Map and Event share `draft`/`active`/`retired`. Unused drafts may be deleted; once
  referenced by durable facts, retirement preserves identity. Metadata edits never create
  revisions; only a real compatibility or historical boundary (Gameplay Revision) does.

## Players and authentication

- A Player Account is the stable subject; titles, Runs, Completions, mastery, rankings,
  Submissions, and reviews reference it. Passkey = Portal authentication; BattleTag = game
  identity; QQ identity = optional channel identity; Invitation = temporary first
  admission. Changing QQ, BattleTag display, or Passkeys never moves facts.
- Onboarding: admin invitation, verified QQ binding for the invited BattleTag, account
  creation, then QQ login or authenticated Passkey registration. Multiple Passkeys are
  allowed. No password or email login. If all Passkeys are lost, recovery stays
  admin-assisted. Only Player and admin boundaries; no RBAC until real distinct roles exist.

## Profile and privacy

Public ranking may show only privacy-safe facts: public display identity, rank, XP and
mastery, completion counts, approved personal bests, public Titles. Never screenshots,
match codes, QQ identifiers, raw OCR, review/audit detail, risk signals, or storage
references. One simple public-profile visibility setting; disabling it anonymizes the
Player on boards without changing scores or eligibility. Title visibility reuses the Title's
own field.

## Reviews

See [reviews.md](reviews.md). A review binds to `(Player, Gameplay Revision)` for maps and
to the stable Event for events; one current review per target and version. Moderation is
only hide comment, restore comment, and inspect; rows stay auditable; no generic workflow
engine or mandatory reasons.

## Boundaries

- **OCR/annotation**: review yields business corrections only; no training labels derive
  from it. The platform keeps one accuracy mark per OCR result (a sampling hint) and supplies
  immutable screenshot sets ([ocr.md](ocr.md)). OCRKit owns splits, training, evaluation,
  checkpoints, and publication; the platform is no ML registry.
- **Agents API**: a minimal consumer projection, not CRUD; it exposes no drafts, audit,
  private evidence, or internal structure. Flow: metadata edit, current projection, next
  normal Bastion build. No push sync, copied JSON authority, runtime Workshop calls, or sync
  state machine without a concrete need.
- **QQBot**: ingress, commands, replies, notifications, dedup, short-lived delivery state;
  never long-lived Player, binding, Title, Submission, OCR, review, or Grant truth. The
  platform decides what happened and whom to notify; QQBot decides delivery. Direct calls to a
  notification adapter are fine until scale demands more.
- **Editorial**: Git Markdown rendered by Nuxt; no CMS. Object copy lives on its owner (Map,
  Event, Title). No generic page-content system; a future announcement may get a small model.

## Admin information architecture

- Top level (frequent work): Titles, Challenges, Maps, Random Events, Players, Invitations,
  Screenshot Review, Reviews/Moderation. Contextual: Grants, Verified Runs, Mastery, Seasons,
  Leaderboards, Audit, OCR Feedback. No blog/changelog editing. Remove standalone CRUD once a
  workflow covers it; keep no empty or duplicate surfaces for compatibility.
- Acquisition is one flow: Title, Challenge, conditions, evidence evaluability, activation.
  Map and Event pages keep their own data and show reverse links, not alternate reward
  editors.
- Screenshot review is the human exception queue: inspect evidence and OCR output, correct
  fields, review matched Challenges, approve or reject; approval then creates or recalculates
  Run, Completion, Grant, mastery, and ranking automatically.
- Audit records meaningful writes (lifecycle, qualification, review, correction, binding,
  issuance, revocation, reset), not reads. Object pages show their audit in context; a global
  page is a secondary tool.

## Simplicity

Prefer deletion and convergence over compatibility layers; add no persistent concept just to
keep a pre-convergence name or UI boundary. Before adding a state, entity, rule object, flag,
or cross-repo contract, show the requirement that Submission evidence, Run facts, Challenge
Conditions, Completion, Grant, Gameplay Revision, existing bindings, or a rebuildable
projection cannot meet. Sequencing belongs in Issues and PRs.
