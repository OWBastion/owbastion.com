# Agents API

`/v1/agents/*` is a read-only build projection for Bastion: current event, map,
achievement, and title metadata, plus title-holding facts for the in-game title
database. Bastion reads it at build/release; the platform imports no Bastion snapshot
and pushes nothing. Privacy limits: [data-and-security.md](../dev-rules/data-and-security.md).

## Titles and grants

- Global title list, detail, and search are one projection of stable definitions. A title
  may appear before its challenge is released (`gameVersion: null`) without becoming
  visible, earnable, or equippable to players.
- Global active grants: `/v1/agents/player-title-grants` (never revision-scoped map
  grants). Map holders: `/v1/agents/map-title-holders?mapId=...`, each item carrying
  `gameplayRevisionId`. Map holders omit players whose `wearMapTitles` preference is off. Both read D1, never expose historical or revoked grants, and use
  the same readiness filter as maps.
- An active map whose enabled revision projection is incomplete returns
  `503 AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE`, never a trustworthy-looking empty page;
  a projectable map with no holders returns an ordinary empty 200.
- Optional HTTP caching lives at the HTTP boundary and never alters service reads or
  becomes a second catalog truth. Submission-status reads are never cached.
- Achievement responses include rule-derived map-title instances with their source rule and
  an explicit `dynamic: true` slot descriptor; do not infer dynamic meaning from a null slot.

## Maps and revisions

`/v1/agents/maps` and `/maps/:mapId` expose `gameplayRevisions`: only enabled `default`
and `selectable` revisions with `isDefault`/`isSelectable`, `gameplayRevisionId`, optional
`mapVariant: "classic"` marker (separate from identity), `gameVersion`, and a validated
`spatialConfig`. `challengeRefs` are references only; full definitions come from
`/v1/agents/achievements`, joined by revision ID plus challenge family/ID.

- A map is build-projectable only with exactly one enabled default revision with valid
  spatial data and every enabled assignment resolving to a current public challenge.
  Preparing, historical-only, malformed, incomplete, duplicate-default, or mis-assigned
  revisions never appear. An active map with no projectable default is listed with an empty
  array (not mistaken for retired). Historical progression stays attributable by stored
  revision ID but cannot inflate the build projection or holder list. A challenge lookup
  shared by several revisions must include `gameplayRevisionId`; nothing is inferred from
  labels, order, or absence. These fields are additive under contractVersion `1`.

## spatialConfig

- Finite 3-vectors: `bastionPositions`, `resetPosition`, `endPosition`,
  `thirdPersonPosition`, `creditsPosition`. Optional control center/jump/respawn vectors with
  a paired axis/threshold (an axis needs at least one respawn vector; cardinality is
  validated by the consuming Bastion map). Deterministic portal/springboard arrays.
  Control roles appear only when that map implementation uses them.
- `alternateStages` (multi-stage maps): each has a stable non-localized `stageId`, a
  platform-owned finite `setupDetection` position with positive radius, and its full role
  set. Bastion evaluates the selector once at setup. Not free-form.
- Composed revisions use `spatialConfig.composition` plus one `stages` entry per atomic
  stage. The route root owns once-only shared points (reset, end, third-person, credits,
  respawn axis; one scalar axis/threshold for all stages); each stage owns its spawn points,
  control centers, one paired jump/respawn point, portals, springboards, and optional setup
  detector. Shared points are never copied per stage, and the platform stores no
  per-route resolved coordinates; Bastion assembles stage arrays in its selected order.
- A stage may override `resetPosition`/`thirdPersonPosition`/`creditsPosition` when it is the
  route's first stage, and `endPosition` when last; absent values inherit the root.
- `composition.selectionCount` is the number of stages per game. The first selection is
  `setup_detection` (explicit fallback stage ID; a detector on every non-fallback stage,
  none on the fallback) or `random` (no detectors); the rest are `random_unique`. Stage IDs
  are unique, stable, and emitted in ID order; per-game selection is never stored. Keep a
  composed revision `preparing` until Bastion accepts this shape.
