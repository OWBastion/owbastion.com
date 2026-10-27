# Catalog, Challenges, and Maps

Platform-owned metadata and its authoring rules. Lifecycle semantics:
[platform-domain-model.md](platform-domain-model.md).

## Titles and Challenges

- The admin surface shows the full Title catalog (global and map-scoped) with
  Challenges. A Title is `draft`/`active` with independent public
  visibility; visibility never gates whether a Challenge can produce a Completion.
- A Title is obtainable if at least one Challenge is currently completable. A Title
  ends when every acquisition path ends (Challenge archived or window lapsed);
  holders keep it and a maintainer may still issue it manually. Ending a Title in
  Portal ends each of its open Challenges.
- A Challenge awards exactly one Title; `draft`/`active`/`archived`, optional start/end,
  and a condition-visibility flag that never gates evaluation. Conditions are one
  top-level AND/OR list. A material qualification change creates a new Challenge and
  archives the old, linking it to its replacement without changing old Completions or
  Grants. Copy-only edits may update in place or create a replacement, as chosen by the
  maintainer. Title creation is independent of Challenge creation; a Title may have no
  Challenge or multiple acquisition Challenges. Challenge scope belongs to its Title.
- Legacy authoring and projection routes still expose schedule/release fields while
  records are adapted to Challenge -> Completion -> Grant.
- Every new qualification is a Completion before its Grant. An already-owned Title is
  skipped across its acquisition Challenges in the same scope; explicit `satisfies` links
  may record lower Completions and Grants when not already owned.
- Admin changes need maintainer authorization, an idempotency key, and an audit record.
  Retirement archives the Title's non-archived Challenges and map title rules atomically;
  its response retains their prior lifecycle/window state. Reopening may restore those
  owned rows in the same batch, making retirement reversible. Manual-grant Challenges
  are not ordinary acquisition rows or counts in the Title workspace.

## Manual and historical issuance

- Single, bounded batch (`/v1/admin/title-grants/manual/batch`, a players x titles
  product), and historical migration each record a manual or migration Completion, then
  the linked Grant. Batch uses the Title's manual Challenge, created or reused.
- Global Titles have no map context; map Titles need a map title rule, Challenge, or
  reward association; a lapsed or disabled Pioneer window still counts — the window
  gates submissions, not manual issuance. Retired Titles are issuable only explicitly.
  Historical migration
  `/bulk` is separate.
- A maintainer can migrate one historical holder snapshot, or all its unclaimed records,
  to an account, and revoke any Grant with a recorded reason. Names are never matched
  automatically. See [accounts-and-qq.md](accounts-and-qq.md) for invitation-based migration.
- Equipped titles: ordinary players may own any number of active eligible Grants but may
  equip only global ones, max ten in the Agents projection. Map-scoped Grants apply by
  map/revision and use no slot. The developer/all-title capability is stored apart from
  equipped rows and projects `allTitles: true`, so new global titles arrive
  automatically. If legacy migration leaves a player over ten with none equipped,
  Portal prompts an idempotent selection (maintainers may manage the equipped set);
  both paths replace only the equipped selection after the same active-global
  validation.
- Map-title wear: each player has one account-level preference, `wearMapTitles` (default
  on; no stored row means on). Turning it off omits the player from the Agents
  `map-title-holders` projection, so Bastion stops showing their map titles from the next
  build. It never changes Grants, achievement counts, leaderboards, or public profiles.
- Player title reads keep active Grants of ended definitions visible; ended
  definitions stay out of ordinary acquisition and review issuance, but remain equippable
  when active and global.
- Maintainers can rename a player's BattleTag display name (idempotent, audited, numeric
  ID unchanged, rejecting a normalized-name conflict on the same numeric ID).

## Map title rules

CONQUEROR, DOMINATOR, and PIONEER are governed by `map_title_rules` (one row per kind)
instead of per-map challenge duplicates. A rule owns condition, evidence rule,
submission mode, display strategy (`map_name_suffix`, `map_pioneer`, `fixed`), default
reward slot, and lifecycle.

- PIONEER is exception-only: default scope is always `explicit`. A maintainer enables a
  map exception for a limited rework/launch window with start and end (Portal defaults to
  24 hours) and disables it afterward. The submission must be created inside the window;
  the resolved window is stored in the rule snapshot. API, service, and projection all
  reject or ignore `all_active` Pioneer and expired exceptions. CONQUEROR and DOMINATOR
  keep their default scope.
- Admins manage rules on the dedicated surface; the map-completion screen is a read-only
  projection linking back. Applicability belongs to the exact Gameplay Revision: only an
  enabled assignment on a `default` or `selectable` revision projects the challenge.
  `all_active` rules materialize assignments on eligible revisions; `explicit` rules need
  one. Per-map management writes only permitted overrides and the Pioneer window. The map
  editor also writes that window with the revision assignment, atomically.

Resolution for `(ruleId, mapId, gameplayRevisionId)`:

1. An inactive map or rule projects nothing.
2. A missing or disabled revision assignment projects nothing (exception `enabled` never
   assigns).
3. PIONEER also needs an explicit-scope rule and an enabled, bounded exception whose window
   contains the submission time.
4. An enabled exception may override `condition`, `evidence_rule`, `submission_mode`, and
   `slot`, taking precedence over assignment overrides and rule defaults. `title_key` and
   `display_kind` stay rule-level. A disabled exception contributes nothing.

- `map_title_rule_compat` keeps legacy `map.<mapId>.<kind>` IDs stable, linking each to
  its rule and map (`is_standard_instance` marks template projections).
- At upload-session creation the projection is stored as immutable
  `submissions.rule_snapshot_json` (`ruleId`, `ruleRevision`, `mapId`, `titleKey`,
  `mapVariant`, `slot`, `displayKind`, `condition`, `evidenceRule`, `submissionMode`,
  `defaultScope`, `exceptionId`). Review and grants read it, never live rules.
- `map_title_rewards` is a read-only compatibility layer for Agents and grant display
  until retired; new rules do not write to it. Map-only titles stay scoped to their map,
  never global, and keep Bastion's pioneer display prefixes in map-filtered catalogs.

## Gameplay Revisions

- A stable map has revisions `preparing`/`default`/`selectable`/`historical`; exactly one
  default (DB-enforced). Default is current progression; selectable can be restored for its
  own progression; historical stays readable. IDs are machine IDs; the legacy marker lives
  in `legacyMapVariant`, and its historical revision uses the reserved `v0` sequence.
- A rework creates a `preparing` revision and keeps the default until promotion. Promotion
  atomically demotes the old default to the admin-chosen `selectable` or `historical`;
  player progress is never copied, and no duplicate or missing default is observable.
- Map-title rules, direct map challenges, map-scoped title challenges, and legacy
  `CLASSIC`/`PIONEER` projections all use revision-aware assignment. Each projected map
  challenge exposes its exact `gameplayRevisionId`; the revision is an immutable snapshot
  on Submission, Grant, and Verified Run. `/v1/me/mastery` defaults to the default
  revision; an explicit revision query reads another revision's profile.
- Map reviews bind to the exact revision ID (see [reviews.md](reviews.md)).
- Standalone Mode (for example 2026镜中回响): a limited-time build reusing map names,
  configured with its maps, owned event pools, and run-code event-weight total. Saving
  gives each listed map the mode's own selectable revision (no spatial config) and retires
  a dropped map's revision to historical. Evidence with the mode label resolves to that
  revision; an unconfigured label goes to maintainer review. A mode revision is never the
  default or classic. A progress rule may follow every map of a mode and reconciles on
  change.

## Random events

- The public Portal lists implemented and removed events with metadata and open linked
  challenges. Maintainers create, edit, archive, and link events in the Portal.
- CSV preview-and-confirm import validates all rows before an atomic write, records source
  hash and audit, and never stores the CSV. A batch (max 100, listed fields only, all or
  nothing, one audit event; undo is another batch) excludes Challenge links.
- A whole game version can be suspended or restored (idempotent operational state):
  events, balancing, and admin visibility are unchanged, but the version's events leave
  `/v1/agents/events` from the next Bastion build; the platform triggers nothing.
- `eventGroup` is an optional display and search label (editor or trailing `事件组` CSV
  column; omitting it in an update keeps the value). It never affects eligibility or
  probability and is separate from Bastion's eligibility groups.
- Default projection covers implemented and removed; `status` selects one `releaseStatus`
  (`development`, `implemented`, `removed`) for list, detail, and search.
