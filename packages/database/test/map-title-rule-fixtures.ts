import type { DatabaseSync } from "node:sqlite";
import type { AgentSpatialConfig } from "@owbastion/contracts";
import { createVerifiedRunEvidenceCompatibilityV1, legacyGameplayRevisionId } from "@owbastion/domain";
import { createD1, createOcrDifficultyResponse, fakeEvidenceBucket, installSchema, seedMap, seedRevisionAssignment, seedTitle } from "../src/ocr-test-harness";

export { createD1, createOcrDifficultyResponse, fakeEvidenceBucket, installSchema, seedMap, seedRevisionAssignment, seedTitle };
export { legacyGameplayRevisionId };

export const now = Date.now();
export const localVerifiedRunEvidenceCompatibility = createVerifiedRunEvidenceCompatibilityV1({
  minimumGameVersion: "99.0101.1",
  supportedOcrLayoutVersions: ["test-layout-v1", "1280x720-v6"],
});

export const synchronizeConcurrentBatches = (database: D1Database, callers: number): D1Database => {
  let arrivals = 0;
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
  let previousBatch = Promise.resolve();
  const synchronized = Object.create(database) as D1Database;
  synchronized.batch = async (statements) => {
    arrivals += 1;
    if (arrivals === callers) releaseBarrier();
    if (arrivals <= callers) await barrier;

    const previous = previousBatch;
    let release!: () => void;
    previousBatch = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await database.batch(statements);
    } finally {
      release();
    }
  };
  return synchronized;
};

export const createTestDatabase = (mapId?: string) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  if (mapId) seedMap(sqlite, mapId);
  return { database, sqlite };
};
/** Seed helpers */

export const seedClassicGameplayRevision = (sqlite: DatabaseSync, mapId: string) => {
  sqlite.prepare(
    "INSERT OR IGNORE INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'selectable', 'classic', ?, NULL, '2026.07.15', ?, ?)",
  ).run(legacyGameplayRevisionId(mapId), mapId, null, now, now);
};

export const seedSelectableGameplayRevision = (sqlite: DatabaseSync, mapId: string, suffix = "rework") => {
  const id = `revision:${mapId}:${suffix}`;
  sqlite.prepare(
    "INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'selectable', NULL, ?, 'revision test', '2026.08.10', ?, ?)",
  ).run(id, mapId, `revision:${mapId}:initial`, now, now);
  return id;
};

export const seedAgentSpatialConfig = (sqlite: DatabaseSync, gameplayRevisionId: string, overrides: Record<string, unknown> = {}) => {
  const spatialConfig = {
    bastionPositions: [[1, 2, 3]],
    resetPosition: [4, 5, 6],
    endPosition: [7, 8, 9],
    thirdPersonPosition: [10, 11, 12],
    creditsPosition: [13, 14, 15],
    control: null,
    portalPositions: [],
    springboardPositions: [],
    ...overrides,
  };
  sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run(JSON.stringify(spatialConfig), gameplayRevisionId);
};

export const compositeSpatialConfig = (): AgentSpatialConfig => {
  const stage = (stageId: string, offset: number, setupDetection?: { position: [number, number, number]; radius: number }) => ({
    stageId,
    ...(setupDetection ? { setupDetection } : {}),
    bastionPositions: [[offset, offset + 1, offset + 2]],
    resetPosition: [offset + 3, offset + 4, offset + 5],
    endPosition: [offset + 6, offset + 7, offset + 8],
    thirdPersonPosition: [offset + 9, offset + 10, offset + 11],
    creditsPosition: [offset + 12, offset + 13, offset + 14],
    control: null,
    portalPositions: [],
    springboardPositions: [],
  });
  return {
    composition: {
      selectionCount: 2,
      firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
      remainingStageSelection: "random_unique",
    },
    stages: [
      stage("laboratory", 30, { position: [40, 41, 42], radius: 30 }),
      stage("base", 1),
      stage("icebreaker", 10, { position: [20, 21, 22], radius: 30 }),
    ],
  } as AgentSpatialConfig;
};

export const sharedCompositeSpatialConfig = (): AgentSpatialConfig => ({
  resetPosition: [4, 5, 6],
  endPosition: [7, 8, 9],
  thirdPersonPosition: [10, 11, 12],
  creditsPosition: [13, 14, 15],
  control: { respawnAxis: "x", respawnAxisThreshold: 40 },
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
    remainingStageSelection: "random_unique",
  },
  stages: [
    { stageId: "laboratory", setupDetection: { position: [40, 41, 42], radius: 30 }, bastionPositions: [[30, 31, 32]], control: { centerPositions: [], jumpPositions: [[31, 32, 33]], respawnPositions: [[34, 35, 36]] }, portalPositions: [], springboardPositions: [] },
    { stageId: "base", bastionPositions: [[1, 2, 3]], control: { centerPositions: [], jumpPositions: [[16, 17, 18]], respawnPositions: [[19, 20, 21]] }, portalPositions: [], springboardPositions: [] },
    { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, bastionPositions: [[10, 11, 12]], control: { centerPositions: [], jumpPositions: [[19, 20, 21]], respawnPositions: [[22, 23, 24]] }, portalPositions: [[25, 26, 27]], springboardPositions: [] },
  ],
});



export const seedRule = (
  sqlite: DatabaseSync,
  ruleId: string,
  titleKey: string,
  kind: string,
  opts: { slot?: string; mapVariant?: string; defaultScope?: string; status?: string } = {},
) => {
  sqlite.prepare(
    "INSERT INTO map_title_rules (id, title_key, kind, condition, evidence_rule, submission_mode, display_kind, slot, map_variant, default_scope, status, introduced_version, created_at, updated_at) VALUES (?, ?, ?, '完成地图', '上传截图', 'manual', 'map_name_suffix', ?, ?, ?, ?, '2026.07.15', ?, ?)",
  ).run(ruleId, titleKey, kind, opts.slot ?? null, opts.mapVariant ?? null, opts.defaultScope ?? "all_active", opts.status ?? "active", now, now);
  if (opts.status === "inactive" || opts.defaultScope === "explicit" || kind.toLocaleLowerCase() === "pioneer") return;
  const maps = sqlite.prepare("SELECT id FROM maps WHERE status = 'active'").all() as Array<{ id: string }>;
  for (const map of maps) {
    if (opts.mapVariant === "classic") {
      seedClassicGameplayRevision(sqlite, map.id);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: legacyGameplayRevisionId(map.id), mapId: map.id, challengeFamily: "map_title_rule", challengeId: ruleId });
    } else {
      seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${map.id}:initial`, mapId: map.id, challengeFamily: "map_title_rule", challengeId: ruleId });
    }
  }
};

export const seedMapTitleChallenge = (sqlite: DatabaseSync, challengeId: string, titleKey: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES (?, ?, '完成经典版地图', '上传截图', 'manual', '2026.07.15', 'active', '2026.07.15', 'map', ?, ?)",
  ).run(challengeId, titleKey, now, now);
  sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES (?, ?)").run(challengeId, mapId);
  seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "title_challenge", challengeId });
};

export const seedException = (
  sqlite: DatabaseSync,
  id: string,
  ruleId: string,
  mapId: string,
  opts: { enabled?: number; condition?: string; evidenceRule?: string; slot?: string; startsAt?: number | null; endsAt?: number | null } = {},
) => {
  sqlite.prepare(
    "INSERT INTO map_title_rule_exceptions (id, rule_id, map_id, enabled, condition, evidence_rule, submission_mode, slot, starts_at, ends_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)",
  ).run(id, ruleId, mapId, opts.enabled ?? 1, opts.condition ?? null, opts.evidenceRule ?? null, opts.slot ?? null, opts.startsAt ?? null, opts.endsAt ?? null, now, now);
  const rule = sqlite.prepare("SELECT map_variant FROM map_title_rules WHERE id = ?").get(ruleId) as { map_variant: string | null };
  const gameplayRevisionId = rule.map_variant === "classic"
    ? (seedClassicGameplayRevision(sqlite, mapId), legacyGameplayRevisionId(mapId))
    : `revision:${mapId}:initial`;
  seedRevisionAssignment(sqlite, {
    gameplayRevisionId,
    mapId,
    challengeFamily: "map_title_rule",
    challengeId: ruleId,
    enabled: opts.enabled ?? 1,
    condition: opts.condition ?? null,
    evidenceRule: opts.evidenceRule ?? null,
    slot: opts.slot ?? null,
  });
};

export const seedCompat = (sqlite: DatabaseSync, legacyId: string, ruleId: string, mapId: string, isStandard = 1) => {
  sqlite.prepare(
    "INSERT INTO map_title_rule_compat (legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(legacyId, ruleId, mapId, isStandard, now);
};

export const seedLegacyMapChallenge = (sqlite: DatabaseSync, challengeId: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, 'difficulty_completion', '旧称号挑战', '传奇', '旧条件', '旧截图规则', 'manual', 'CONQUEROR', '2026.07.15', 'active', '2026.07.15', ?, ?)",
  ).run(challengeId, mapId, now, now);
  seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "map_challenge", challengeId });
};

export const uploadHash = async (body: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};
export const seedMasteryPlayer = (sqlite: DatabaseSync, playerId: string, bindingId: string, playerName: string) => {
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?)").run(playerId, playerId, playerName, playerName.toLocaleLowerCase(), now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
};

export const seedMasterySubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string, playerName: string, withAttachment = true) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, difficulty, player_name, review_reason, grant_id, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_pending', 'unknown', NULL, NULL, '成就挑战', NULL, ?, NULL, NULL, 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, playerName, `message.${submissionId}`, now, now);
  if (withAttachment) sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)").run(`attachment.${submissionId}`, submissionId, `external.${submissionId}`, `evidence/${submissionId}.png`, now);
};

export const masteryOcr = (overrides: { viewerPlayer?: string | null; difficulty?: string; matchCode?: string | null; durationSeconds?: number; layoutVersion?: string; version?: string; mapVariant?: "classic" | null } = {}) => {
  const matchCode = overrides.matchCode === undefined ? "1234-5678-9012" : overrides.matchCode;
  return {
    schema_version: "1",
    ok: true,
    layout_version: overrides.layoutVersion ?? "test-layout-v1",
    fields: {
      challenge_completed: { status: "ok", confidence: 0.99 },
      ...(overrides.viewerPlayer === null ? {} : { viewer_player: { status: "ok", confidence: 0.99 } }),
      map_name: { status: "ok", confidence: 0.99 },
      difficulty: { status: "ok", confidence: 0.99 },
      version: { status: "ok", confidence: 0.99 },
      duration_seconds: { status: "ok", confidence: 0.99 },
      deaths: { status: "ok", confidence: 0.99 },
      skips: { status: "ok", confidence: 0.99 },
      ...(matchCode === null ? {} : { run_code: { status: "ok", confidence: 0.99 } }),
      ...(overrides.mapVariant === "classic" ? { map_variant: { status: "ok", confidence: 0.99 } } : {}),
    },
    data: {
      challenge_completed: true,
      ...(overrides.viewerPlayer === null ? {} : { viewer_player: overrides.viewerPlayer ?? "Tester#1234" }),
      map_name: "地图 map.mastery",
      difficulty: overrides.difficulty ?? "困难",
      version: overrides.version ?? "99.0101.1",
      run_code: matchCode,
      duration_seconds: overrides.durationSeconds ?? 600,
      deaths: 1,
      skips: 0,
      ...(overrides.mapVariant === undefined ? {} : { map_variant: overrides.mapVariant }),
    },
  };
};
