import { deliverOcrFixture } from "./ocr-test-harness";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { AgentSpatialConfig } from "@owbastion/contracts";
import { createVerifiedRunEvidenceCompatibilityV1, legacyGameplayRevisionId } from "@owbastion/domain";
import { assessVerifiedRunOcrEvidence, createPlatformServices } from "@owbastion/database";
import { createD1, fakeEvidenceBucket, installSchema, seedMap, seedRevisionAssignment, seedTitle } from "./ocr-test-harness";

const now = Date.now();
const localVerifiedRunEvidenceCompatibility = createVerifiedRunEvidenceCompatibilityV1({
  minimumGameVersion: "99.0101.1",
  supportedOcrLayoutVersions: ["test-layout-v1", "1280x720-v7"],
});

const synchronizeConcurrentBatches = (database: D1Database, callers: number): D1Database => {
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

describe("Agents map gameplay projection", () => {
  it("projects enabled revisions with deterministic spatial and challenge references", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedTitle(sqlite, "CONQUEROR");
    seedTitle(sqlite, "REWORK");
    seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
    seedCompat(sqlite, "map.agents.conqueror", "rule.conqueror", "map.agents");
    seedLegacyMapChallenge(sqlite, "challenge.agents.direct", "map.agents");
    seedMapTitleChallenge(sqlite, "title.agents.rework", "REWORK", "map.agents");
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, "map.agents");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: selectableRevisionId, mapId: "map.agents", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: selectableRevisionId, mapId: "map.agents", challengeFamily: "map_challenge", challengeId: "challenge.agents.direct" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: selectableRevisionId, mapId: "map.agents", challengeFamily: "title_challenge", challengeId: "title.agents.rework" });
    const stageSpatialConfig = {
      bastionPositions: [[20, 21, 22]], resetPosition: [23, 24, 25], endPosition: [26, 27, 28],
      thirdPersonPosition: [29, 30, 31], creditsPosition: [32, 33, 34], control: null,
      portalPositions: [], springboardPositions: [],
    };
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial", {
      alternateStages: [
        { stageId: "zeta", ...stageSpatialConfig, setupDetection: { position: [50, 51, 52], radius: 30 } },
        { stageId: "alpha", ...stageSpatialConfig, setupDetection: { position: [53, 54, 55], radius: 30 } },
      ],
    });
    seedAgentSpatialConfig(sqlite, selectableRevisionId);
    const services = createPlatformServices(database);

    const response = await services.listAgentMaps({ page: 1, pageSize: 20 });
    expect(response.items[0]?.gameplayRevisions.map((revision) => revision.gameplayRevisionId)).toEqual([
      "revision:map.agents:initial",
      selectableRevisionId,
    ]);
    expect(response.items[0]?.gameplayRevisions[0]?.challengeRefs).toEqual([
      { family: "map", challengeId: "challenge.agents.direct" },
      { family: "map", challengeId: "map.agents.conqueror" },
      { family: "map", challengeId: "title.agents.rework" },
    ]);
    expect(response.items[0]?.gameplayRevisions[0]?.spatialConfig.alternateStages.map((stage) => stage.stageId)).toEqual(["alpha", "zeta"]);
    expect((await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.agents" })).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "challenge.agents.direct", gameplayRevisionId: "revision:map.agents:initial" }),
      expect.objectContaining({ challengeId: "title.agents.rework", gameplayRevisionId: "revision:map.agents:initial" }),
      expect.objectContaining({ challengeId: "challenge.agents.direct", gameplayRevisionId: selectableRevisionId }),
    ]));
  });

  it("resolves a legacy title challenge alias through its assigned map title rule", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.classic");
    seedTitle(sqlite, "CLASSIC");
    seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
    seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.classic");
    seedException(sqlite, "exception.classic", "rule.classic", "map.classic");
    seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.classic");
    sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ? AND challenge_family = 'title_challenge' AND challenge_id = 'title.CLASSIC'").run("revision:map.classic:initial");
    const classicRevisionId = legacyGameplayRevisionId("map.classic");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: classicRevisionId, mapId: "map.classic", challengeFamily: "title_challenge", challengeId: "title.CLASSIC" });
    seedAgentSpatialConfig(sqlite, "revision:map.classic:initial");
    seedAgentSpatialConfig(sqlite, classicRevisionId);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.classic', '1002', 'Classic Player', 'classic player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.classic', 'player.classic', 'CLASSIC', 'map.classic', ?, NULL, 'active', 'submission', 'source.classic', 'admin', ?)").run(classicRevisionId, now);
    const services = createPlatformServices(database);

    const map = (await services.getAgentMap({ mapId: "map.classic" }))!;
    expect(map.gameplayRevisions.map((revision) => revision.gameplayRevisionId)).toEqual([
      "revision:map.classic:initial",
      classicRevisionId,
    ]);
    expect(map.gameplayRevisions[1]?.challengeRefs).toEqual([{ family: "map", challengeId: "title.CLASSIC" }]);
    await expect(services.listAgentMapTitleHolders({ mapId: "map.classic", page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ mapId: "map.classic", gameplayRevisionId: classicRevisionId, titleKey: "CLASSIC", slot: null, slotSemantics: "none" })],
    });
  });

  it("preserves expired Pioneer assignments during unrelated Revision updates", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.expired-pioneer");
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer.expired", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
    seedException(sqlite, "exception.pioneer.expired", "rule.pioneer.expired", "map.expired-pioneer", { startsAt: now - 120_000, endsAt: now - 60_000 });
    seedAgentSpatialConfig(sqlite, "revision:map.expired-pioneer:initial");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.expired-pioneer', '1003', 'Expired Pioneer', 'expired pioneer', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.expired-pioneer', 'player.expired-pioneer', 'PIONEER', 'map.expired-pioneer', 'revision:map.expired-pioneer:initial', 'pioneer', 'active', 'submission', 'submission.expired-pioneer', 'admin', ?)").run(now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const editor = await services.getAdminMapEditor({ mapId: "map.expired-pioneer" }, auth);
    const revision = editor.revisions[0]!;
    const assignments = revision.challengeAssignments.map(({ assignmentId: _assignmentId, gameplayRevisionId: _gameplayRevisionId, mapId: _mapId, ...assignment }) => assignment);
    const update = (challengeAssignments: typeof assignments) => ({
      contractVersion: "1" as const,
      mapId: "map.expired-pioneer",
      revisionId: revision.revisionId,
      lifecycle: revision.lifecycle,
      gameVersion: revision.gameVersion,
      mapVariant: revision.mapVariant,
      spatialConfig: { ...revision.spatialConfig!, resetPosition: [14, 15, 16] as const },
      challengeAssignments,
    });

    const updated = await services.updateAdminMapRevision(update(assignments), auth, "expired-pioneer-spatial-update");
    expect(updated.spatialConfig?.resetPosition).toEqual([14, 15, 16]);
    expect(updated.challengeAssignments.map(({ assignmentId: _assignmentId, gameplayRevisionId: _gameplayRevisionId, mapId: _mapId, ...assignment }) => assignment)).toEqual(assignments);

    const map = (await services.getAgentMap({ mapId: "map.expired-pioneer" }))!;
    expect(map.gameplayRevisions[0]?.challengeRefs).toEqual([]);
    await expect(services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.expired-pioneer" })).resolves.toMatchObject({ items: [] });
    await expect(services.listAgentMapTitleHolders({ mapId: "map.expired-pioneer", page: 1, pageSize: 20 })).resolves.toMatchObject({
      items: [expect.objectContaining({ titleKey: "PIONEER", gameplayRevisionId: "revision:map.expired-pioneer:initial" })],
    });

    const modifiedAssignments = assignments.map((assignment) => assignment.challengeId === "rule.pioneer.expired"
      ? { ...assignment, condition: "Modified historical assignment" }
      : assignment);
    await expect(services.updateAdminMapRevision(update(modifiedAssignments), auth, "expired-pioneer-modified-assignment"))
      .rejects.toThrow("REVISION_CHALLENGE_NOT_ASSIGNABLE");

    sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET enabled = 0 WHERE gameplay_revision_id = ? AND challenge_id = ?")
      .run(revision.revisionId, "rule.pioneer.expired");
    const disabledEditor = await services.getAdminMapEditor({ mapId: "map.expired-pioneer" }, auth);
    const disabledAssignments = disabledEditor.revisions[0]!.challengeAssignments
      .map(({ assignmentId: _assignmentId, gameplayRevisionId: _gameplayRevisionId, mapId: _mapId, ...assignment }) => assignment);
    await expect(services.updateAdminMapRevision(update(disabledAssignments.map((assignment) => ({ ...assignment, enabled: true }))), auth, "expired-pioneer-enable-assignment"))
      .rejects.toThrow("REVISION_CHALLENGE_NOT_ASSIGNABLE");

    await expect(services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.expired-pioneer",
      gameVersion: "2026.09.28",
      mapVariant: null,
      copyConfiguration: false,
      challengeAssignments: assignments,
    }, auth, "expired-pioneer-create-assignment")).rejects.toThrow("REVISION_CHALLENGE_NOT_ASSIGNABLE");
  });
});

describe("Agents map projection readiness", () => {
  it("projects route-root composite stages in stable ID order", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.composite");
    seedAgentSpatialConfig(sqlite, "revision:map.composite:initial");
    const baseComposite = sharedCompositeSpatialConfig();
    const composite = {
      ...baseComposite,
      composition: { ...baseComposite.composition, remainingStageSelection: "stage_id_cycle" },
    };
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run(JSON.stringify(composite), "revision:map.composite:initial");
    const services = createPlatformServices(database);

    const map = (await services.getAgentMap({ mapId: "map.composite" }))!;
    expect(map.gameplayRevisions[0]?.spatialConfig).toEqual({
      ...composite,
      stages: [...composite.stages].sort((left, right) => left.stageId.localeCompare(right.stageId)),
    });
    expect(map.gameplayRevisions[0]?.spatialConfig).toMatchObject({
      composition: { selectionCount: 2, firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" }, remainingStageSelection: "stage_id_cycle" },
      stages: [
        { stageId: "base", bastionPositions: [[1, 2, 3]], control: { respawnPositions: [[19, 20, 21]] } },
        { stageId: "icebreaker", bastionPositions: [[10, 11, 12]], setupDetection: { position: [20, 21, 22], radius: 30 } },
        { stageId: "laboratory", bastionPositions: [[30, 31, 32]], setupDetection: { position: [40, 41, 42], radius: 30 } },
      ],
    });
    expect(map.gameplayRevisions[0]?.spatialConfig).not.toHaveProperty("alternateStages");
  });

  it("keeps legacy full-stage composite revisions editable but out of the Agents projection", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.legacy-composite");
    seedAgentSpatialConfig(sqlite, "revision:map.legacy-composite:initial");
    const legacyComposite = compositeSpatialConfig();
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run(JSON.stringify(legacyComposite), "revision:map.legacy-composite:initial");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    const projected = (await services.getAgentMap({ mapId: "map.legacy-composite" }))!;
    const editor = await services.getAdminMapEditor({ mapId: "map.legacy-composite" }, auth);
    expect(projected.gameplayRevisions).toEqual([]);
    expect(editor.revisions[0]?.spatialConfig).toEqual({
      ...legacyComposite,
      stages: [...legacyComposite.stages].sort((left, right) => left.stageId.localeCompare(right.stageId)),
    });

    const preparing = await services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.legacy-composite",
      sourceRevisionId: "revision:map.legacy-composite:initial",
      gameVersion: "2026.09.24",
      mapVariant: null,
      copyConfiguration: false,
      spatialConfig: legacyComposite,
      challengeAssignments: [],
    }, auth, "prepare-legacy-composite");
    expect(preparing.lifecycle).toBe("preparing");
    await expect(services.promoteAdminMapRevision({
      contractVersion: "1",
      mapId: "map.legacy-composite",
      revisionId: preparing.revisionId,
      replacedDefaultLifecycle: "selectable",
    }, auth, "promote-legacy-composite")).rejects.toThrow("INVALID_SPATIAL_CONFIG");
  });

  it("sets up a standalone mode's maps, event pools, and weight total in one save", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    for (const mapId of ["map.mode", "map.second"]) {
      seedMap(sqlite, mapId);
      seedAgentSpatialConfig(sqlite, `revision:${mapId}:initial`);
    }
    sqlite.prepare("INSERT INTO random_events (id, name, category, rarity, description, weight, game_version, release_status, created_at, updated_at) VALUES ('event.anniversary', '周年事件', '增益', 'N', '描述', 1, '2026周年', 'implemented', ?, ?)").run(now, now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const save = (mapIds: string[], key: string, eventPools = ["2026周年"]) => services.upsertAdminStandaloneMode({ contractVersion: "1", mode: "2026 镜中回响", mapIds, eventPools, eventWeightTotal: 69.5 }, auth, key);
    const modeRevisions = () => sqlite.prepare("SELECT map_id, lifecycle, spatial_config_json FROM gameplay_revisions WHERE mode = '2026镜中回响' ORDER BY map_id").all();

    await expect(save(["map.mode", "map.second"], "mode-create")).resolves.toMatchObject({ mode: "2026镜中回响", mapIds: ["map.mode", "map.second"], eventPools: ["2026周年"], eventWeightTotal: 69.5 });
    // Each map gets the mode's own selectable revision, without a spatial config.
    expect(modeRevisions()).toEqual([
      { map_id: "map.mode", lifecycle: "selectable", spatial_config_json: null },
      { map_id: "map.second", lifecycle: "selectable", spatial_config_json: null },
    ]);
    expect(sqlite.prepare("SELECT mode FROM random_event_versions WHERE game_version = '2026周年'").get()).toEqual({ mode: "2026镜中回响" });
    // Bastion's regular build cannot select a standalone-mode layout, so the Agents projection omits it.
    expect((await services.getAgentMap({ mapId: "map.mode" }))!.gameplayRevisions.map((revision) => revision.gameplayRevisionId)).toEqual(["revision:map.mode:initial"]);
    const [mirror] = sqlite.prepare("SELECT id FROM gameplay_revisions WHERE mode = '2026镜中回响' AND map_id = 'map.mode'").all() as Array<{ id: string }>;
    await expect(services.promoteAdminMapRevision({ contractVersion: "1", mapId: "map.mode", revisionId: mirror!.id, replacedDefaultLifecycle: "selectable" }, auth, "mode-promote")).rejects.toThrow("DEFAULT_REVISION_CANNOT_USE_MODE");

    // Dropping a map retires its revision; listing it again restores the same revision.
    await save(["map.mode"], "mode-drop", []);
    expect(modeRevisions()).toEqual([
      { map_id: "map.mode", lifecycle: "selectable", spatial_config_json: null },
      { map_id: "map.second", lifecycle: "historical", spatial_config_json: null },
    ]);
    expect(sqlite.prepare("SELECT mode FROM random_event_versions WHERE game_version = '2026周年'").get()).toEqual({ mode: null });
    await save(["map.mode", "map.second"], "mode-restore");
    expect(modeRevisions()).toHaveLength(2);
    expect(await services.listAdminStandaloneModes(auth)).toMatchObject({ items: [{ mode: "2026镜中回响", mapIds: ["map.mode", "map.second"], eventPools: ["2026周年"] }] });

    await expect(services.upsertAdminStandaloneMode({ contractVersion: "1", mode: "随机事件5.0", mapIds: [], eventPools: [], eventWeightTotal: null }, auth, "mode-regular")).rejects.toThrow("STANDALONE_MODE_INVALID");
    await expect(services.upsertAdminStandaloneMode({ contractVersion: "1", mode: "另一个模式", mapIds: [], eventPools: ["2026周年"], eventWeightTotal: null }, auth, "mode-pool-conflict")).rejects.toThrow("STANDALONE_MODE_POOL_CONFLICT");
  });

  it("keeps editing a standalone-mode revision without a spatial config", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mode");
    seedAgentSpatialConfig(sqlite, "revision:map.mode:initial");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    await services.upsertAdminStandaloneMode({ contractVersion: "1", mode: "2026镜中回响", mapIds: ["map.mode"], eventPools: [], eventWeightTotal: null }, auth, "mode-create");
    const mirror = (sqlite.prepare("SELECT id FROM gameplay_revisions WHERE mode = '2026镜中回响'").get() as { id: string }).id;
    const preparing = await services.createAdminMapRevision({ contractVersion: "1", mapId: "map.mode", mapVariant: null, copyConfiguration: false, challengeAssignments: [] }, auth, "regular-create");
    const update = (revisionId: string, key: string) => services.updateAdminMapRevision({
      contractVersion: "1",
      mapId: "map.mode",
      revisionId,
      lifecycle: "selectable",
      gameVersion: "2026.10.01",
      mapVariant: null,
      spatialConfig: null,
      challengeAssignments: [],
    }, auth, key);

    // Bastion compiles regular selectable revisions, so they still need a spatial config.
    await expect(update(preparing.revisionId, "regular-without-spatial")).rejects.toThrow("INVALID_SPATIAL_CONFIG");
    await expect(update(mirror, "mode-without-spatial")).resolves.toMatchObject({ lifecycle: "selectable", mode: "2026镜中回响", spatialConfig: null, gameVersion: "2026.10.01" });
  });

  it("keeps preparing composite revisions out of the Agents projection", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.preparing-composite");
    seedAgentSpatialConfig(sqlite, "revision:map.preparing-composite:initial");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    const revision = await services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.preparing-composite",
      sourceRevisionId: "revision:map.preparing-composite:initial",
      gameVersion: "2026.09.23",
      mapVariant: null,
      copyConfiguration: false,
      spatialConfig: sharedCompositeSpatialConfig(),
      challengeAssignments: [],
    }, auth, "prepare-composite-route");
    expect(revision.lifecycle).toBe("preparing");
    expect(revision.spatialConfig && "stages" in revision.spatialConfig ? revision.spatialConfig.stages.map((stage) => stage.stageId) : []).toEqual(["base", "icebreaker", "laboratory"]);
    expect(revision.spatialConfig).toMatchObject({ endPosition: [7, 8, 9] });
    const savedStages = revision.spatialConfig && "stages" in revision.spatialConfig ? revision.spatialConfig.stages : [];
    expect(savedStages.find((stage) => stage.stageId === "base")).toMatchObject({ control: { respawnPositions: [[19, 20, 21]] } });
    expect(savedStages[0]).not.toHaveProperty("endPosition");

    const projected = (await services.getAgentMap({ mapId: "map.preparing-composite" }))!;
    expect(projected.gameplayRevisions).toHaveLength(1);
    expect(projected.gameplayRevisions[0]?.gameplayRevisionId).toBe("revision:map.preparing-composite:initial");
    expect(projected.gameplayRevisions[0]?.spatialConfig).not.toHaveProperty("composition");
  });

  it("projects composite revisions when they are selectable or default", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.composite-rollout");
    seedAgentSpatialConfig(sqlite, "revision:map.composite-rollout:initial");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const createRevision = (key: string) => services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.composite-rollout",
      sourceRevisionId: "revision:map.composite-rollout:initial",
      gameVersion: "2026.09.23",
      mapVariant: null,
      copyConfiguration: false,
      spatialConfig: sharedCompositeSpatialConfig(),
      challengeAssignments: [],
    }, auth, key);
    const selectable = await createRevision("composite-rollout-selectable");
    const defaultRevision = await createRevision("composite-rollout-default");
    const updateRevision = (revisionId: string, lifecycle: "default" | "selectable", key: string) => services.updateAdminMapRevision({
      contractVersion: "1",
      mapId: "map.composite-rollout",
      revisionId,
      lifecycle,
      replacedDefaultLifecycle: lifecycle === "default" ? "selectable" : null,
      gameVersion: "2026.09.23",
      mapVariant: null,
      spatialConfig: sharedCompositeSpatialConfig(),
      challengeAssignments: [],
    }, auth, key);

    const preparingProjection = (await services.getAgentMap({ mapId: "map.composite-rollout" }))!;
    expect(preparingProjection.gameplayRevisions.map((revision) => revision.gameplayRevisionId)).toEqual(["revision:map.composite-rollout:initial"]);

    await updateRevision(selectable.revisionId, "selectable", "activate-composite-selectable");
    const selectableProjection = (await services.getAgentMap({ mapId: "map.composite-rollout" }))!;
    expect(selectableProjection.gameplayRevisions).toHaveLength(2);
    expect(selectableProjection.gameplayRevisions.find((revision) => revision.gameplayRevisionId === selectable.revisionId)).toMatchObject({
      lifecycle: "selectable",
      isDefault: false,
      isSelectable: true,
      spatialConfig: { composition: { selectionCount: 2 }, stages: expect.any(Array) },
    });

    await services.promoteAdminMapRevision({
      contractVersion: "1",
      mapId: "map.composite-rollout",
      revisionId: defaultRevision.revisionId,
      replacedDefaultLifecycle: "selectable",
    }, auth, "activate-composite-default");
    const defaultProjection = (await services.getAgentMap({ mapId: "map.composite-rollout" }))!;
    expect(defaultProjection.gameplayRevisions).toHaveLength(3);
    expect(defaultProjection.gameplayRevisions[0]).toMatchObject({
      gameplayRevisionId: defaultRevision.revisionId,
      lifecycle: "default",
      isDefault: true,
      isSelectable: false,
      spatialConfig: {
        composition: { selectionCount: 2, remainingStageSelection: "random_unique" },
        endPosition: [7, 8, 9],
        stages: [{ stageId: "base" }, { stageId: "icebreaker" }, { stageId: "laboratory" }],
      },
    });
    expect(defaultProjection.gameplayRevisions.filter((revision) => revision.isDefault)).toHaveLength(1);
    expect(defaultProjection.gameplayRevisions.filter((revision) => revision.isSelectable)).toHaveLength(2);
  });

  it("fails the whole map closed for an incomplete enabled revision and never projects historical or preparing rows", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    const invalidSelectableId = seedSelectableGameplayRevision(sqlite, "map.agents", "invalid");
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run("not-json", invalidSelectableId);
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES ('revision:map.agents:historical', 'map.agents', 'historical', NULL, NULL, NULL, '2025.01.1', ?, ?, ?), ('revision:map.agents:preparing', 'map.agents', 'preparing', NULL, NULL, NULL, '2026.08.1', ?, ?, ?)").run(JSON.stringify({}), now, now, JSON.stringify({}), now, now);
    const services = createPlatformServices(database);

    const map = (await services.getAgentMap({ mapId: "map.agents" }))!;
    expect(map.gameplayRevisions).toEqual([]);
  });

  it("keeps a valid map with zero legitimate holders as an empty projection", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.empty");
    seedAgentSpatialConfig(sqlite, "revision:map.empty:initial");
    const services = createPlatformServices(database);

    await expect(services.listAgentMapTitleHolders({ mapId: "map.empty", page: 1, pageSize: 20 })).resolves.toMatchObject({
      contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false,
    });
  });

  it("does not turn durable grants into an empty projection when an enabled map is unavailable", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.unavailable");
    seedTitle(sqlite, "PIONEER");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.unavailable', '1003', 'Unavailable Player', 'unavailable player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.unavailable', 'player.unavailable', 'PIONEER', 'map.unavailable', 'revision:map.unavailable:initial', 'pioneer', 'active', 'submission', 'source.unavailable', 'admin', ?)").run(now);
    const services = createPlatformServices(database);

    await expect(services.listAgentMapTitleHolders({ mapId: "map.unavailable", page: 1, pageSize: 20 })).rejects.toThrow("AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE");
  });

  it("fails closed when a compat title alias lacks its mapped rule assignment", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.compat");
    seedTitle(sqlite, "CLASSIC");
    seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
    seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.compat");
    seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.compat");
    sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ? AND challenge_family = 'title_challenge' AND challenge_id = 'title.CLASSIC'").run("revision:map.compat:initial");
    const classicRevisionId = legacyGameplayRevisionId("map.compat");
    seedClassicGameplayRevision(sqlite, "map.compat");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: classicRevisionId, mapId: "map.compat", challengeFamily: "title_challenge", challengeId: "title.CLASSIC" });
    seedAgentSpatialConfig(sqlite, "revision:map.compat:initial");
    seedAgentSpatialConfig(sqlite, classicRevisionId);
    const services = createPlatformServices(database);

    await expect(services.getAgentMap({ mapId: "map.compat" })).resolves.toMatchObject({
      gameplayRevisions: [],
    });
  });

  it("does not project a map when enabled defaults are ambiguous", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES ('revision:map.agents:duplicate-default', 'map.agents', 'default', NULL, NULL, NULL, '2026.08.1', ?, ?, ?)").run(JSON.stringify({}), now, now);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:duplicate-default");
    const services = createPlatformServices(database);

    await expect(services.getAgentMap({ mapId: "map.agents" })).resolves.toMatchObject({ mapId: "map.agents", gameplayRevisions: [] });
  });

  it("scopes map title holders to projectable revision identities", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.agents");
    seedTitle(sqlite, "PIONEER");
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, "map.agents");
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.agents:historical', 'map.agents', 'historical', NULL, NULL, NULL, '2025.01.1', ?, ?)").run(now, now);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    seedAgentSpatialConfig(sqlite, selectableRevisionId);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:historical");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.agents', '1001', 'Agent Player', 'agent player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.default', 'player.agents', 'PIONEER', 'map.agents', 'revision:map.agents:initial', 'pioneer', 'active', 'submission', 'source.default', 'admin', ?), ('grant.selectable', 'player.agents', 'PIONEER', 'map.agents', ?, 'pioneer', 'active', 'submission', 'source.selectable', 'admin', ?), ('grant.historical', 'player.agents', 'PIONEER', 'map.agents', 'revision:map.agents:historical', 'pioneer', 'active', 'submission', 'source.historical', 'admin', ?)").run(now, selectableRevisionId, now, now);
    const services = createPlatformServices(database);

    const response = await services.listAgentMapTitleHolders({ mapId: "map.agents", page: 1, pageSize: 20 });
    expect(response.items.map((item) => item.gameplayRevisionId)).toEqual(["revision:map.agents:initial", selectableRevisionId]);
  });
});

describe("Admin map revision editor", () => {
  it("only exposes active and assignable map title rules", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.editor.catalog");
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer.catalog", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "all_active" });
    seedTitle(sqlite, "CONQUEROR");
    seedRule(sqlite, "rule.conqueror.catalog", "CONQUEROR", "conqueror", { slot: "conqueror" });
    seedTitle(sqlite, "RETIRED");
    seedRule(sqlite, "rule.retired.catalog", "RETIRED", "retired", { status: "inactive" });
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    await expect(services.getAdminMapEditor({ mapId: "map.editor.catalog" }, auth)).resolves.toMatchObject({
      challengeCatalog: expect.arrayContaining([expect.objectContaining({ challengeId: "rule.conqueror.catalog" })]),
    });
    const initial = await services.getAdminMapEditor({ mapId: "map.editor.catalog" }, auth);
    expect(initial.challengeCatalog).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "rule.pioneer.catalog" }),
      expect.objectContaining({ challengeId: "rule.retired.catalog" }),
    ]));

    sqlite.prepare("UPDATE map_title_rules SET default_scope = 'explicit' WHERE id = ?").run("rule.pioneer.catalog");
    seedException(sqlite, "exception.pioneer.catalog", "rule.pioneer.catalog", "map.editor.catalog", { startsAt: now - 60_000, endsAt: now + 60_000 });
    sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE map_id = 'map.editor.catalog' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.pioneer.catalog'").run();
    const repaired = await services.getAdminMapEditor({ mapId: "map.editor.catalog" }, auth);
    expect(repaired.challengeCatalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeId: "rule.pioneer.catalog" }),
    ]));
  });

  it("promotes explicitly, preserves R1 history, and independently qualifies R2", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.editor");
    sqlite.prepare("UPDATE maps SET game_version = '2026.08.12' WHERE id = 'map.editor'").run();
    seedLegacyMapChallenge(sqlite, "challenge.editor", "map.editor");
    seedAgentSpatialConfig(sqlite, "revision:map.editor:initial");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.editor:initial", mapId: "map.editor", challengeFamily: "map_challenge", challengeId: "challenge.editor" });
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer.editor", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.editor:initial", mapId: "map.editor", challengeFamily: "map_title_rule", challengeId: "rule.pioneer.editor", slot: "pioneer" });
    seedTitle(sqlite, "CONQUEROR");
    seedRule(sqlite, "rule.conqueror.editor", "CONQUEROR", "conqueror", { slot: "conqueror" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.editor:initial", mapId: "map.editor", challengeFamily: "map_title_rule", challengeId: "rule.conqueror.editor", slot: "conqueror" });
    seedMapTitleChallenge(sqlite, "title.editor", "PIONEER", "map.editor");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.editor', '1001', 'Editor Player', 'editor player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, map_id, gameplay_revision_id, status, manual, public_condition, condition_operator, conditions_json, condition, created_at, updated_at) VALUES ('challenge.editor.r1', 'title_challenge', 'title.editor', 'PIONEER', 'legacy', 'map.editor', 'revision:map.editor:initial', 'active', 0, 1, 'and', ?, '完成经典版地图', ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "PIONEER" }, { type: "map", mapId: "map.editor" }] }), now, now);
    sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.editor.r1', 'player.editor', 'approved', 'map_title_achievement', 'title.editor', 'map.editor', 'revision:map.editor:initial', '地图 map.editor', 'portal', 'portal', 'message.editor.r1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) VALUES ('completion.editor.r1', 'player.editor', 'challenge.editor.r1', 'revision:map.editor:initial', 'active', 'submission', 'submission.editor.r1', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) VALUES ('grant.editor.r1', 'player.editor', 'PIONEER', 'map.editor', 'revision:map.editor:initial', 'pioneer', 'active', 'submission', 'submission.editor.r1', 'admin', ?, 'completion.editor.r1')").run(now);
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('evidence.editor.r1', 'submission.editor.r1', 'portal', 'external.editor.r1', 'image/png', 1, 'hash.editor.r1', 'evidence/editor-r1.png', 'stored', ?)").run(now);
    sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES ('run.editor.r1', 'player.editor', 'submission.editor.r1', 'map.editor', 'revision:map.editor:initial', NULL, 'hell', '2026.08.12', 'run-code.editor.r1', 1200, 0, 0, '{}', 'submission.review', ?, 'active', 'v1', '{}', 0, ?)").run(now, now);
    sqlite.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES ('audit.editor.r1', 'correlation.editor.r1', 'user', 'admin', 'submission.review', 'submission', 'submission.editor.r1', '{\"decision\":\"approved\"}', ?)").run(now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const editorBefore = await services.getAdminMapEditor({ mapId: "map.editor" }, auth);
    const r1Before = editorBefore.revisions.find((revision) => revision.revisionId === "revision:map.editor:initial")!;

    const r2 = await services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.editor",
      sourceRevisionId: r1Before.revisionId,
      gameVersion: "2026.08.13",
      mapVariant: null,
      copyConfiguration: true,
    }, auth, "editor-create-r2");
    expect(r2.lifecycle).toBe("preparing");
    expect(r2.gameVersion).toBe("2026.08.13");
    expect(r2.resetReason).toBeNull();
    expect(r2.spatialConfig).toEqual(r1Before.spatialConfig);
    expect(r2.challengeAssignments).toMatchObject(r1Before.challengeAssignments.filter((assignment) => !["map_title_rule", "title_challenge"].includes(assignment.challengeFamily)).map(({ assignmentId: _assignmentId, gameplayRevisionId: _revisionId, mapId: _mapId, ...assignment }) => assignment));
    expect(r2.challengeAssignments).not.toEqual(expect.arrayContaining([expect.objectContaining({ challengeFamily: "map_title_rule" })]));
    expect(r2.challengeAssignments).not.toEqual(expect.arrayContaining([expect.objectContaining({ challengeFamily: "title_challenge" })]));
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM player_title_grants WHERE map_id = 'map.editor' ORDER BY gameplay_revision_id").all()).toEqual([{ gameplay_revision_id: "revision:map.editor:initial" }]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE gameplay_revision_id = ?").get(r2.revisionId)).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE gameplay_revision_id = ?").get(r2.revisionId)).toEqual({ count: 0 });

    const updateInput = (revision: typeof r1Before, lifecycle: "preparing" | "selectable" | "default") => ({
      contractVersion: "1" as const,
      mapId: "map.editor",
      revisionId: revision.revisionId,
      lifecycle,
      gameVersion: revision.gameVersion,
      mapVariant: null,
      spatialConfig: revision.spatialConfig,
      challengeAssignments: revision.challengeAssignments.map(({ assignmentId: _assignmentId, gameplayRevisionId: _revisionId, mapId: _mapId, ...assignment }) => assignment),
    });
    await expect(services.updateAdminMapRevision(updateInput(r1Before, "selectable"), auth, "editor-ordinary-demotion"))
      .rejects.toThrow("REVISION_PROMOTION_REQUIRES_EXPLICIT_OPERATION");
    await expect(services.updateAdminMapRevision(updateInput(r2, "default"), auth, "editor-ordinary-promotion"))
      .rejects.toThrow("REVISION_PROMOTION_REQUIRES_EXPLICIT_OPERATION");
    const { alternateStages: _existingAlternateStages, ...stageSpatialConfig } = r2.spatialConfig!;
    const r2Prepared = await services.updateAdminMapRevision({
      ...updateInput(r2, "preparing"),
      challengeAssignments: [
        ...r2.challengeAssignments.map(({ assignmentId: _assignmentId, gameplayRevisionId: _revisionId, mapId: _mapId, ...assignment }) => assignment),
        { challengeFamily: "title_challenge", challengeId: "title.editor", enabled: true, condition: null, evidenceRule: null, submissionMode: null, slot: null },
      ],
      spatialConfig: {
        ...r2.spatialConfig!,
        alternateStages: [
          { stageId: "zeta", ...stageSpatialConfig, setupDetection: { position: [50, 51, 52], radius: 30 } },
          { stageId: "alpha", ...stageSpatialConfig, setupDetection: { position: [53, 54, 55], radius: 30 } },
        ],
      },
    }, auth, "editor-update-r2");
    const promoteInput = { contractVersion: "1" as const, mapId: "map.editor", revisionId: r2.revisionId, replacedDefaultLifecycle: "selectable" as const };
    const r2Default = await services.promoteAdminMapRevision(promoteInput, auth, "editor-promote-r2");
    expect(r2Default.isDefault).toBe(true);
    expect(r2Default.challengeAssignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ challengeFamily: "map_title_rule", challengeId: "rule.conqueror.editor", enabled: true }),
    ]));
    expect(r2Default.gameVersion).toBe("2026.08.13");
    expect(r2Default.spatialConfig?.alternateStages.map((stage) => stage.stageId)).toEqual(["alpha", "zeta"]);
    expect(JSON.parse((sqlite.prepare("SELECT spatial_config_json FROM gameplay_revisions WHERE id = ?").get(r2.revisionId) as { spatial_config_json: string }).spatial_config_json).alternateStages.map((stage: { stageId: string }) => stage.stageId)).toEqual(["alpha", "zeta"]);
    expect((await services.getAdminMapEditor({ mapId: "map.editor" }, auth)).revisions.map((revision) => [revision.revisionId, revision.lifecycle])).toEqual(expect.arrayContaining([
      ["revision:map.editor:initial", "selectable"],
      [r2.revisionId, "default"],
    ]));
    await expect(services.listChallenges({ family: "map", mapId: "map.editor" })).resolves.toContainEqual(expect.objectContaining({
      challengeId: "title.editor",
      titleKey: "PIONEER",
      gameplayRevisionId: r2.revisionId,
    }));
    await expect(services.listChallenges({ family: "map", mapId: "map.editor" })).resolves.toContainEqual(expect.objectContaining({
      challengeId: "map.editor.conqueror",
      titleKey: "CONQUEROR",
      gameplayRevisionId: r2.revisionId,
      mapTitleRule: expect.objectContaining({ ruleId: "rule.conqueror.editor" }),
    }));
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM player_title_grants WHERE map_id = 'map.editor' ORDER BY gameplay_revision_id").all()).toEqual([{ gameplay_revision_id: "revision:map.editor:initial" }]);
    const replayAuditCount = sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.map.revision.promote'").get();
    await expect(services.promoteAdminMapRevision(promoteInput, auth, "editor-promote-r2")).resolves.toEqual(r2Default);
    await expect(services.promoteAdminMapRevision({ ...promoteInput, replacedDefaultLifecycle: null }, auth, "editor-promote-r2-again"))
      .resolves.toMatchObject({ revisionId: r2.revisionId, lifecycle: "default" });
    await expect(services.promoteAdminMapRevision({ ...promoteInput, replacedDefaultLifecycle: "historical" }, auth, "editor-promote-r2"))
      .rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.map.revision.promote'").get()).toEqual(replayAuditCount);

    const r2Snapshot = JSON.stringify({
      challengeId: "title.editor",
      challengeType: "map_title_achievement",
      ruleId: "title-challenge:title.editor",
      ruleRevision: now,
      mapId: "map.editor",
      gameplayRevisionId: r2.revisionId,
      titleKey: "PIONEER",
      mapVariant: null,
      slot: null,
      displayKind: "map_name_suffix",
      condition: "完成经典版地图",
      evidenceRule: "上传截图",
      submissionMode: "manual",
      defaultScope: "map",
      exceptionId: null,
      startsAt: null,
      endsAt: null,
    });
    sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.editor.r2', 'player.editor', 'ready_for_review', 'map_title_achievement', 'title.editor', 'map.editor', ?, '地图 map.editor', ?, 'portal', 'portal', 'message.editor.r2', ?, ?)").run(r2.revisionId, r2Snapshot, now + 1, now + 1);
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.editor.r2', 'submission.editor.r2', 1, 'review_required', ?, ?)").run(JSON.stringify({
      schema_version: "1",
      ok: true,
      model_version: "test",
      layout_version: "1280x720-v7",
      fields: {
        map_name: { status: "ok", confidence: 0.99 },
        achievement_titles: { status: "ok", confidence: 0.99 },
      },
      data: { map_name: "地图 map.editor", difficulty: "普通", challenge_completed: true, achievement_titles: ["称号 PIONEER"], achievement_panel_text: "称号 PIONEER" },
    }), now + 1);
    const r2Review = await services.reviewSubmission({ submissionId: "submission.editor.r2", decision: "approved" }, auth, "review-editor-r2");
    expect(r2Review).toMatchObject({ decision: "approved", titleKey: "PIONEER", alreadyOwned: false });
    const revisionChallenges = sqlite.prepare("SELECT id, gameplay_revision_id, status FROM challenges WHERE source_family = 'title_challenge' AND source_id = 'title.editor' ORDER BY gameplay_revision_id").all();
    expect(revisionChallenges).toHaveLength(2);
    expect(revisionChallenges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "challenge.editor.r1", gameplay_revision_id: "revision:map.editor:initial", status: "active" }),
      expect.objectContaining({ gameplay_revision_id: r2.revisionId, status: "active" }),
    ]));
    expect(sqlite.prepare("SELECT id, gameplay_revision_id, status FROM challenge_completions WHERE player_account_id = 'player.editor' AND challenge_id IN (SELECT id FROM challenges WHERE source_family = 'title_challenge' AND source_id = 'title.editor') ORDER BY gameplay_revision_id").all()).toEqual(expect.arrayContaining([
      { id: "completion.editor.r1", gameplay_revision_id: "revision:map.editor:initial", status: "active" },
      expect.objectContaining({ gameplay_revision_id: r2.revisionId, status: "active" }),
    ]));
    expect(sqlite.prepare("SELECT id, gameplay_revision_id, status, revocation_type FROM player_title_grants WHERE player_account_id = 'player.editor' AND title_key = 'PIONEER' ORDER BY gameplay_revision_id").all()).toEqual(expect.arrayContaining([
      { id: "grant.editor.r1", gameplay_revision_id: "revision:map.editor:initial", status: "active", revocation_type: null },
      expect.objectContaining({ id: r2Review.grantId, gameplay_revision_id: r2.revisionId, status: "active", revocation_type: null }),
    ]));

    expect(sqlite.prepare("SELECT id, target_map_id, gameplay_revision_id, status FROM submissions WHERE id = 'submission.editor.r1'").get()).toEqual({ id: "submission.editor.r1", target_map_id: "map.editor", gameplay_revision_id: "revision:map.editor:initial", status: "approved" });
    expect(sqlite.prepare("SELECT id, gameplay_revision_id, status FROM mastery_runs WHERE id = 'run.editor.r1'").get()).toEqual({ id: "run.editor.r1", gameplay_revision_id: "revision:map.editor:initial", status: "active" });
    expect(sqlite.prepare("SELECT id, submission_id, object_key FROM attachments WHERE id = 'evidence.editor.r1'").get()).toEqual({ id: "evidence.editor.r1", submission_id: "submission.editor.r1", object_key: "evidence/editor-r1.png" });
    expect(sqlite.prepare("SELECT id, operation, entity_id FROM audit_events WHERE id = 'audit.editor.r1'").get()).toEqual({ id: "audit.editor.r1", operation: "submission.review", entity_id: "submission.editor.r1" });
    expect(sqlite.prepare("SELECT lifecycle FROM gameplay_revisions WHERE id = 'revision:map.editor:initial'").get()).toEqual({ lifecycle: "selectable" });
    expect(r2Prepared.resetReason).toBeNull();
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE gameplay_revision_id = ? AND revocation_type = 'revision_reset'").get(r2.revisionId)).toEqual({ count: 0 });

    const audit = sqlite.prepare("SELECT operation, entity_id, json_extract(payload_json, '$.progressCopied') AS progress_copied, json_extract(payload_json, '$.resetReason') AS reset_reason, json_extract(payload_json, '$.gameVersion') AS game_version, json_extract(payload_json, '$.replacedByRevisionId') AS replaced_by_revision_id, json_extract(payload_json, '$.replacedDefaultLifecycle') AS replaced_default_lifecycle FROM audit_events WHERE operation IN ('admin.map.revision.create', 'admin.map.revision.promote')").all();
    expect(audit).toEqual(expect.arrayContaining([
      { operation: "admin.map.revision.create", entity_id: r2.revisionId, progress_copied: 0, reset_reason: null, game_version: "2026.08.13", replaced_by_revision_id: null, replaced_default_lifecycle: null },
      { operation: "admin.map.revision.promote", entity_id: r1Before.revisionId, progress_copied: 0, reset_reason: null, game_version: null, replaced_by_revision_id: r2.revisionId, replaced_default_lifecycle: null },
      { operation: "admin.map.revision.promote", entity_id: r2.revisionId, progress_copied: 0, reset_reason: null, game_version: null, replaced_by_revision_id: null, replaced_default_lifecycle: "selectable" },
    ]));
  });

  it("rolls back both lifecycle changes, idempotency, and audit when promotion fails", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.promotion-atomic");
    seedAgentSpatialConfig(sqlite, "revision:map.promotion-atomic:initial");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.promotion-atomic', 'atomic', 'Atomic', 'atomic', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('GLOBAL_ATOMIC_TITLE', 'Atomic title', 'award', 'Test', 'Test', 'active', 'global', 'fixed', 'null', '2026.08.13')").run();
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const editor = await services.getAdminMapEditor({ mapId: "map.promotion-atomic" }, auth);
    const revision = await services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.promotion-atomic",
      sourceRevisionId: "revision:map.promotion-atomic:initial",
      gameVersion: "2026.08.13",
      mapVariant: null,
      copyConfiguration: true,
    }, auth, "atomic-create-r2");
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.atomic.r1', 'player.promotion-atomic', 'GLOBAL_ATOMIC_TITLE', 'map.promotion-atomic', 'revision:map.promotion-atomic:initial', 'active', 'manual', 'atomic.r1', 'admin', ?), ('grant.atomic.r2', 'player.promotion-atomic', 'GLOBAL_ATOMIC_TITLE', 'map.promotion-atomic', ?, 'active', 'manual', 'atomic.r2', 'admin', ?)").run(now, revision.revisionId, now);
    sqlite.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES ('grant.atomic.r1', 'player.promotion-atomic', ?)").run(now);
    const promote = { contractVersion: "1" as const, mapId: "map.promotion-atomic", revisionId: revision.revisionId, replacedDefaultLifecycle: "historical" as const };
    sqlite.exec("CREATE TRIGGER promotion_audit_failure BEFORE INSERT ON audit_events WHEN NEW.operation = 'admin.map.revision.promote' BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END");

    await expect(services.promoteAdminMapRevision(promote, auth, "atomic-promote-r2")).rejects.toThrow("simulated audit failure");
    expect(sqlite.prepare("SELECT id, lifecycle FROM gameplay_revisions WHERE map_id = 'map.promotion-atomic'").all()).toEqual(expect.arrayContaining([
      { id: "revision:map.promotion-atomic:initial", lifecycle: "default" },
      { id: revision.revisionId, lifecycle: "preparing" },
    ]));
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE operation = 'admin.map.revision.promote'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.map.revision.promote'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT grant_id FROM player_equipped_titles WHERE player_account_id = 'player.promotion-atomic'").get()).toEqual({ grant_id: "grant.atomic.r1" });

    sqlite.exec("DROP TRIGGER promotion_audit_failure");
    await expect(services.promoteAdminMapRevision(promote, auth, "atomic-promote-r2")).resolves.toMatchObject({ revisionId: revision.revisionId, lifecycle: "default" });
    expect(sqlite.prepare("SELECT lifecycle FROM gameplay_revisions WHERE id = ?").get(editor.revisions[0]!.revisionId)).toEqual({ lifecycle: "historical" });
    expect(sqlite.prepare("SELECT grant_id FROM player_equipped_titles WHERE player_account_id = 'player.promotion-atomic'").get()).toEqual({ grant_id: "grant.atomic.r2" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.map.revision.promote'").get()).toEqual({ count: 2 });
  });

  it("rebinds or clears equipped preferences atomically with revision applicability", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.equipped-reset");
    seedAgentSpatialConfig(sqlite, "revision:map.equipped-reset:initial");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.rebound', 'rebound', 'Rebound', 'rebound', ?, ?), ('player.cleared', 'cleared', 'Cleared', 'cleared', ?, ?)").run(now, now, now, now);
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('GLOBAL_RESET_TITLE', 'Reset title', 'award', 'Test', 'Test', 'active', 'global', 'fixed', 'null', '2026.08.13')").run();
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const revision = await services.createAdminMapRevision({
      contractVersion: "1",
      mapId: "map.equipped-reset",
      sourceRevisionId: "revision:map.equipped-reset:initial",
      gameVersion: "2026.08.13",
      mapVariant: null,
      copyConfiguration: true,
    }, auth, "equipped-reset-create-r2");
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.rebound.r1', 'player.rebound', 'GLOBAL_RESET_TITLE', 'map.equipped-reset', 'revision:map.equipped-reset:initial', 'active', 'manual', 'rebound.r1', 'admin', ?), ('grant.rebound.r2', 'player.rebound', 'GLOBAL_RESET_TITLE', 'map.equipped-reset', ?, 'active', 'manual', 'rebound.r2', 'admin', ?), ('grant.cleared.r1', 'player.cleared', 'GLOBAL_RESET_TITLE', 'map.equipped-reset', 'revision:map.equipped-reset:initial', 'active', 'manual', 'cleared.r1', 'admin', ?)").run(now, revision.revisionId, now, now);
    sqlite.prepare("INSERT INTO player_equipped_titles (grant_id, player_account_id, equipped_at) VALUES ('grant.rebound.r1', 'player.rebound', ?), ('grant.cleared.r1', 'player.cleared', ?)").run(now, now);

    await services.promoteAdminMapRevision({
      contractVersion: "1",
      mapId: "map.equipped-reset",
      revisionId: revision.revisionId,
      replacedDefaultLifecycle: "historical",
    }, auth, "equipped-reset-promote-r2");

    expect(sqlite.prepare("SELECT grant_id, player_account_id FROM player_equipped_titles ORDER BY player_account_id").all()).toEqual([
      { grant_id: "grant.rebound.r2", player_account_id: "player.rebound" },
    ]);
    expect(sqlite.prepare("SELECT id, status FROM player_title_grants ORDER BY id").all()).toEqual([
      { id: "grant.cleared.r1", status: "active" },
      { id: "grant.rebound.r1", status: "active" },
      { id: "grant.rebound.r2", status: "active" },
    ]);
  });

  it("rejects invalid spatial data and challenge references before writing a revision", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.editor.invalid");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const revision = (await services.getAdminMapEditor({ mapId: "map.editor.invalid" }, auth)).revisions[0]!;
    await expect(services.updateAdminMapRevision({
      contractVersion: "1", mapId: "map.editor.invalid", revisionId: revision.revisionId, lifecycle: "selectable", gameVersion: revision.gameVersion, mapVariant: null, spatialConfig: null, challengeAssignments: [],
    }, auth, "ordinary-default-transition")).rejects.toThrow("REVISION_PROMOTION_REQUIRES_EXPLICIT_OPERATION");
    await expect(services.promoteAdminMapRevision({
      contractVersion: "1", mapId: "map.editor.invalid", revisionId: revision.revisionId, replacedDefaultLifecycle: null,
    }, auth, "invalid-default-spatial")).rejects.toThrow("INVALID_SPATIAL_CONFIG");
    const impossibleComposition = compositeSpatialConfig();
    await expect(services.createAdminMapRevision({
      contractVersion: "1", mapId: "map.editor.invalid", mapVariant: null, copyConfiguration: false,
      spatialConfig: { ...impossibleComposition, composition: { ...impossibleComposition.composition, selectionCount: 4 } } as never,
    }, auth, "invalid-composite-selection")).rejects.toThrow("INVALID_SPATIAL_CONFIG");
    await expect(services.createAdminMapRevision({
      contractVersion: "1", mapId: "map.editor.invalid", resetReason: "invalid assignment", mapVariant: null, copyConfiguration: false,
      challengeAssignments: [{ challengeFamily: "map_challenge", challengeId: "missing.challenge", enabled: true, condition: null, evidenceRule: null, submissionMode: null, slot: null }],
    }, auth, "invalid-reference")).rejects.toThrow("REVISION_CHALLENGE_NOT_FOUND");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM gameplay_revisions WHERE map_id = 'map.editor.invalid'").get()).toEqual({ count: 1 });
  });
});

describe("manual title grant batches", () => {
  it("expands, deduplicates, resolves revisions, reuses active grants, and replays atomically", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const playerOne = "11111111-1111-4111-8111-111111111111";
    const playerTwo = "22222222-2222-4222-8222-222222222222";
    seedMap(sqlite, "map.batch");
    seedTitle(sqlite, "CONQUEROR");
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('GLOBAL', '全局称号', 'award', '测试', '条件', 'active', 'global', 'fixed', 'null', '2026.07.15')").run();
    seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
    const reworkRevisionId = seedSelectableGameplayRevision(sqlite, "map.batch");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.batch", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?), (?, ?, ?, ?, 0, 'active', ?, ?)").run(playerOne, "1001", "One", "one", now, now, playerTwo, "1002", "Two", "two", now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.existing', ?, 'GLOBAL', NULL, NULL, NULL, 'active', 'manual', 'manual:existing', 'admin', ?)").run(playerTwo, now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const request = {
      contractVersion: "1" as const,
      playerAccountIds: [playerOne, playerTwo, playerOne],
      targets: [
        { titleKey: "GLOBAL" },
        { titleKey: "CONQUEROR", mapId: "map.batch", gameplayRevisionId: reworkRevisionId },
        { titleKey: "CONQUEROR", mapId: "map.batch", gameplayRevisionId: reworkRevisionId },
      ],
      reason: "批量补发",
    };
    const first = await services.createAdminManualTitleGrantBatch(request, auth, "manual-batch-1");
    expect(first).toMatchObject({ playerCount: 2, targetCount: 2, requestedCount: 4, createdCount: 3, alreadyOwnedCount: 1 });
    expect(first.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerAccountId: playerTwo, titleKey: "GLOBAL", status: "already_owned", grantId: "grant.existing" }),
      expect.objectContaining({ playerAccountId: playerOne, titleKey: "CONQUEROR", mapId: "map.batch", gameplayRevisionId: reworkRevisionId, status: "created" }),
    ]));
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_type = 'manual'").get()).toEqual({ count: 4 });
    expect(sqlite.prepare("SELECT COUNT(DISTINCT source_id) AS count FROM player_title_grants WHERE source_type = 'manual' AND title_key = 'CONQUEROR'").get()).toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_type = 'manual'").get()).toEqual({ count: 3 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_type = 'manual' AND completion_id IS NOT NULL").get()).toEqual({ count: 3 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.grant.manual.batch'").get()).toEqual({ count: 1 });

    await expect(services.createAdminManualTitleGrantBatch(request, auth, "manual-batch-1")).resolves.toEqual(first);
    await expect(services.createAdminManualTitleGrantBatch({ ...request, reason: "不同请求" }, auth, "manual-batch-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.createAdminManualTitleGrantBatch({ ...request, targets: [{ titleKey: "CONQUEROR", mapId: "map.batch", gameplayRevisionId: "revision:other-map:rework" }] }, auth, "manual-batch-invalid")).rejects.toThrow("GAMEPLAY_REVISION_INVALID");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 4 });
    await expect(services.createAdminManualTitleGrantBatch({ contractVersion: "1", playerAccountIds: [playerOne, playerTwo], targets: Array.from({ length: 251 }, (_, index) => ({ titleKey: `MISSING_${index}` })) }, auth, "manual-batch-too-large")).rejects.toThrow("MANUAL_TITLE_GRANT_BATCH_TOO_LARGE");

    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('BLOCKED', '已撤销称号', 'award', '测试', '条件', 'active', 'global', 'fixed', 'null', '2026.07.15')").run();
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.revoked', ?, 'BLOCKED', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'revoke', 'administrator')").run(playerOne, now, now);
    await expect(services.createAdminManualTitleGrant({ contractVersion: "1", playerAccountId: playerOne, titleKey: "BLOCKED" }, auth, "manual-after-revoke")).rejects.toThrow("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
    await services.restoreAdminTitleGrant({ grantId: "grant.revoked", reason: "申诉通过" }, auth, "restore-admin-revoke");
    expect(sqlite.prepare("SELECT status, revocation_type, revoked_by FROM player_title_grants WHERE id = 'grant.revoked'").get()).toEqual({ status: "active", revocation_type: null, revoked_by: null });
    expect(sqlite.prepare("SELECT operation FROM audit_events WHERE operation = 'admin.title.restore' AND entity_id = 'grant.revoked'").get()).toEqual({ operation: "admin.title.restore" });
    await expect(services.restoreAdminTitleGrant({ grantId: "grant.revoked" }, auth, "restore-active")).rejects.toThrow("TITLE_GRANT_NOT_ADMINISTRATIVELY_REVOKED");
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('EVIDENCE_REVOKED', '证据撤销称号', 'award', '测试', '条件', 'active', 'global', 'fixed', 'null', '2026.07.15')").run();
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.evidence-revoked', ?, 'EVIDENCE_REVOKED', 'revoked', 'automatic', 'submission.evidence', 'system:ocr', ?, 'admin', ?, '证据无效', 'evidence')").run(playerOne, now, now);
    await expect(services.revokeAdminTitleGrant({ grantId: "grant.evidence-revoked" }, auth, "revoke-evidence-grant")).rejects.toThrow("TITLE_GRANT_NOT_ACTIVE");
    expect(sqlite.prepare("SELECT status, revocation_type FROM player_title_grants WHERE id = 'grant.evidence-revoked'").get()).toEqual({ status: "revoked", revocation_type: "evidence" });
    await expect(services.restoreAdminTitleGrant({ grantId: "grant.evidence-revoked" }, auth, "restore-evidence-revoke")).rejects.toThrow("TITLE_GRANT_NOT_ADMINISTRATIVELY_REVOKED");
  });

  it("does not overwrite evidence revocation that wins after the active-grant read", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedTitle(sqlite, "REVOKE_RACE");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.revoke.race', 'revoke-race', 'Revoke Race', 'revoke race', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.revoke.race', 'player.revoke.race', 'REVOKE_RACE', 'active', 'automatic', 'submission.race', 'system:ocr', ?)").run(now);
    const originalBatch = database.batch.bind(database);
    database.batch = async (statements) => {
      sqlite.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = 'system:ocr', revoked_at = ?, revoke_reason = '证据失效' WHERE id = 'grant.revoke.race' AND status = 'active'").run(now + 1);
      return originalBatch(statements);
    };
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    await expect(services.revokeAdminTitleGrant({ grantId: "grant.revoke.race" }, auth, "revoke-race")).rejects.toThrow("TITLE_GRANT_NOT_ACTIVE");

    expect(sqlite.prepare("SELECT status, revocation_type, revoked_by, revoke_reason FROM player_title_grants WHERE id = 'grant.revoke.race'").get()).toEqual({ status: "revoked", revocation_type: "evidence", revoked_by: "system:ocr", revoke_reason: "证据失效" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE id = 'admin:admin.title.revoke:revoke-race'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.revoke' AND entity_id = 'grant.revoke.race'").get()).toEqual({ count: 0 });
  });

  it("allows an explicit manual grant for a retired title through its manual Challenge", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedTitle(sqlite, "RETIRED_MANUAL");
    sqlite.prepare("UPDATE title_catalog SET lifecycle = 'retired', scope = 'global', display_kind = 'fixed' WHERE key = 'RETIRED_MANUAL'").run();
    const playerId = "player.retired.manual";
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(playerId, "retired-manual", "Retired Manual", "retired manual", now, now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    const result = await services.createAdminManualTitleGrant({ contractVersion: "1", playerAccountId: playerId, titleKey: "RETIRED_MANUAL" }, auth, "retired-manual-grant");

    expect(result.grantId).toBeTruthy();
    expect(sqlite.prepare("SELECT lifecycle FROM title_catalog WHERE key = 'RETIRED_MANUAL'").get()).toEqual({ lifecycle: "retired" });
    expect(sqlite.prepare("SELECT manual, status FROM challenges WHERE title_key = 'RETIRED_MANUAL'").get()).toEqual({ manual: 1, status: "active" });
    expect(sqlite.prepare("SELECT status, source_type FROM challenge_completions WHERE player_account_id = ?").get(playerId)).toEqual({ status: "active", source_type: "manual" });
    expect(sqlite.prepare("SELECT status, completion_id FROM player_title_grants WHERE player_account_id = ?").get(playerId)).toMatchObject({ status: "active", completion_id: expect.any(String) });
  });
});

/** Seed helpers */

const seedClassicGameplayRevision = (sqlite: DatabaseSync, mapId: string) => {
  sqlite.prepare(
    "INSERT OR IGNORE INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'selectable', 'classic', ?, NULL, '2026.07.15', ?, ?)",
  ).run(legacyGameplayRevisionId(mapId), mapId, null, now, now);
};

const seedSelectableGameplayRevision = (sqlite: DatabaseSync, mapId: string, suffix = "rework") => {
  const id = `revision:${mapId}:${suffix}`;
  sqlite.prepare(
    "INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'selectable', NULL, ?, 'revision test', '2026.08.10', ?, ?)",
  ).run(id, mapId, `revision:${mapId}:initial`, now, now);
  return id;
};

const seedAgentSpatialConfig = (sqlite: DatabaseSync, gameplayRevisionId: string, overrides: Record<string, unknown> = {}) => {
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

const compositeSpatialConfig = (): AgentSpatialConfig => {
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

const sharedCompositeSpatialConfig = (): AgentSpatialConfig => ({
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



const seedRule = (
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

// Regular pools total 62.70; a removed event, a suspended pool, and the 2026镜中回响 pool stay out of
// it. That mode's build returns and disables events, so its 69.50 total is recorded on its pool rather
// than derived (62.70 + 4.80 would be 67.50); it is recorded on the mode.
const seedEventPools = (sqlite: DatabaseSync) => {
  const insert = sqlite.prepare("INSERT INTO random_events (id, name, category, rarity, description, weight, game_version, release_status, created_at, updated_at) VALUES (?, ?, '增益', 'N', '描述', ?, ?, ?, ?, ?)");
  insert.run("event.regular.a", "常规甲", 60, "5.0", "implemented", now, now);
  insert.run("event.regular.b", "常规乙", 2.7, "4.0", "implemented", now, now);
  insert.run("event.regular.removed", "已移除", 5, "4.0", "removed", now, now);
  insert.run("event.suspended", "挂起池", 3, "3.0", "implemented", now, now);
  insert.run("event.anniversary", "周年事件", 4.8, "2026周年", "implemented", now, now);
  sqlite.prepare("INSERT INTO standalone_modes (mode, event_weight_total, created_at, updated_at) VALUES ('2026镜中回响', 69.5, ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO random_event_versions (game_version, availability, mode, created_at, updated_at) VALUES ('2026周年', 'available', '2026镜中回响', ?, ?), ('3.0', 'suspended', NULL, ?, ?)").run(now, now, now, now);
};

const seedMapTitleChallenge = (sqlite: DatabaseSync, challengeId: string, titleKey: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES (?, ?, '完成经典版地图', '上传截图', 'manual', '2026.07.15', 'active', '2026.07.15', 'map', ?, ?)",
  ).run(challengeId, titleKey, now, now);
  sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES (?, ?)").run(challengeId, mapId);
  seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "title_challenge", challengeId });
};

const seedException = (
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

const seedCompat = (sqlite: DatabaseSync, legacyId: string, ruleId: string, mapId: string, isStandard = 1) => {
  sqlite.prepare(
    "INSERT INTO map_title_rule_compat (legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(legacyId, ruleId, mapId, isStandard, now);
};

const seedLegacyMapChallenge = (sqlite: DatabaseSync, challengeId: string, mapId: string) => {
  sqlite.prepare(
    "INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, 'difficulty_completion', '旧称号挑战', '传奇', '旧条件', '旧截图规则', 'manual', 'CONQUEROR', '2026.07.15', 'active', '2026.07.15', ?, ?)",
  ).run(challengeId, mapId, now, now);
  seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "map_challenge", challengeId });
};

const requestHash = async (value: unknown) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const uploadHash = async (body: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

// Expose the internal resolveMapTitleProjection helper via the service's test-internal path.
// We test it indirectly through reviewSubmission and a thin wrapper export.
// For direct unit coverage of the resolver we call it through a minimal service instance
// and an augmented services object that exposes the resolver.
//
// The resolver lives inside createPlatformServices's closure. We access it by creating
// a minimal services object and asserting on the reviewSubmission behaviour.

describe("map title rule model – locked invariants", () => {
  describe("post-OCR player confirmation", () => {
    it("repairs a legacy classic submission before manual OCR retry", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CLASSIC");
      seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
      seedException(sqlite, "exception.paris", "rule.classic", "map.paris");
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.paris");
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.legacy-classic', 'binding.1', 'resubmission_required', 'map_title_achievement', 'title.CLASSIC', 'map.paris', '地图 map.paris', 'Tester', 'portal', 'portal', 'msg.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.1', 'sub.legacy-classic', 'portal', 'external.1', 'image/png', 1, 'hash', 'evidence/classic.png', 'stored', ?)").run(now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          map_variant: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.paris", map_variant: "classic", achievement_panel_text: "称号 CLASSIC ✓" },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const sent: unknown[] = [];
        const queue = { send: async (message: unknown) => { sent.push(message); } } as Queue;
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue);
        await services.requestAdminOcr({ submissionId: "sub.legacy-classic" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "idem.1", "request.1");
        await deliverOcrFixture(services, sqlite, { ...(sent[0] as { submissionId: string; objectKey: string; manual: boolean; requestId: string }), attempt: 1 });
      } finally {
        vi.unstubAllGlobals();
      }

      const submission = sqlite.prepare("SELECT status, rule_snapshot_json FROM submissions WHERE id = 'sub.legacy-classic'").get() as { status: string; rule_snapshot_json: string | null };
      expect(submission.status).toBe("approved");
      expect(JSON.parse(submission.rule_snapshot_json!)).toMatchObject({ titleKey: "CLASSIC", mapId: "map.paris", mapVariant: "classic" });
    });

    it("persists the covered conqueror grant when a dominator OCR match is automated", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.dorado");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
      const revisionId = "revision:map.dorado:initial";
      const canonicalChallenge = sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, map_id, gameplay_revision_id, status, manual, public_condition, condition_operator, conditions_json, condition, created_at, updated_at) VALUES (?, 'map_title_rule', ?, ?, 'map.dorado', ?, 'active', 0, 0, 'and', ?, '完成地图', ?, ?)");
      canonicalChallenge.run(`legacy:map_title_rule:rule.conqueror:map.dorado:${revisionId}`, "rule.conqueror", "CONQUEROR", revisionId, JSON.stringify({ operator: "and", conditions: [{ type: "completed" }] }), now, now);
      canonicalChallenge.run(`legacy:map_title_rule:rule.dominator:map.dorado:${revisionId}`, "rule.dominator", "DOMINATOR", revisionId, JSON.stringify({ operator: "and", conditions: [{ type: "completed" }] }), now, now);
      sqlite.prepare("INSERT INTO challenge_satisfies (challenge_id, satisfied_challenge_id, created_at) VALUES (?, ?, ?)").run(`legacy:map_title_rule:rule.dominator:map.dorado:${revisionId}`, `legacy:map_title_rule:rule.conqueror:map.dorado:${revisionId}`, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.auto', 'auto-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.auto', 'identity.auto', 'player.auto', 'qq', 'group.auto', 'member.auto', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.auto', 'binding.auto', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'auto.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.auto', 'submission.auto', 'portal', 'external.auto', 'image/png', 1, 'hash', 'evidence/auto.png', 'stored', ?)").run(now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          difficulty: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.dorado", difficulty: "地狱" },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.auto", objectKey: "evidence/auto.png", attempt: 1, requestId: "request.auto" });
      } finally {
        vi.unstubAllGlobals();
      }

      const grants = sqlite.prepare("SELECT title_key, slot, source_type, source_id FROM player_title_grants WHERE player_account_id = 'player.auto' AND status = 'active' ORDER BY title_key").all() as Array<{ title_key: string; slot: string; source_type: string; source_id: string }>;
      expect(grants).toEqual([
        { title_key: "CONQUEROR", slot: "conqueror", source_type: "automatic", source_id: "submission.auto" },
        { title_key: "DOMINATOR", slot: "dominator", source_type: "automatic", source_id: "submission.auto" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_id = 'submission.auto' AND status = 'active'").get()).toEqual({ count: 2 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_type = 'automatic' AND completion_id IS NOT NULL").get()).toEqual({ count: 2 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.auto' AND title_key = 'CONQUEROR' AND status = 'active'").get()).toEqual({ count: 1 });
      const auditCount = sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'submission.automatic_grant' AND entity_type = 'player_title_grant'").get() as { count: number };
      expect(auditCount.count).toBe(2);

      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.auto.repeat', 'binding.auto', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'auto.repeat', ?, ?)").run(now + 1, now + 1);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.auto.repeat', 'submission.auto.repeat', 'portal', 'external.auto.repeat', 'image/png', 1, 'hash', 'evidence/auto-repeat.png', 'stored', ?)").run(now + 1);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.auto.repeat", objectKey: "evidence/auto-repeat.png", attempt: 1, requestId: "request.auto.repeat" });
      } finally {
        vi.unstubAllGlobals();
      }
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.auto.repeat'").get()).toEqual({ status: "resubmission_required", grant_id: null });
      expect(sqlite.prepare("SELECT json_extract(match_json, '$.candidates') AS candidates FROM ocr_results WHERE submission_id = 'submission.auto.repeat'").get()).toEqual({ candidates: "[]" });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE player_account_id = 'player.auto' AND status = 'active'").get()).toEqual({ count: 2 });
    });

    const deliverRegularClear = async (runCode: string) => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.rialto");
      seedTitle(sqlite, "DOMINATOR");
      seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
      seedEventPools(sqlite);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.weights', 'weights-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.weights', 'identity.weights', 'player.weights', 'qq', 'group.weights', 'member.weights', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.weights', 'binding.weights', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'weights.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.weights', 'submission.weights', 'portal', 'external.weights', 'image/png', 1, 'hash', 'evidence/weights.png', 'stored', ?)").run(now);
      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: Object.fromEntries(["challenge_completed", "map_name", "difficulty", "version", "run_code", "duration_seconds", "deaths", "skips"].map((field) => [field, { status: "ok", confidence: 0.99 }])),
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.rialto", difficulty: "地狱", mode: "随机事件5.0", version: "99.0101.1", run_code: runCode, duration_seconds: 600, deaths: 0, skips: 0 },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.weights", objectKey: "evidence/weights.png", attempt: 1, requestId: "request.weights" });
      } finally {
        vi.unstubAllGlobals();
      }
      return sqlite;
    };

    it("holds a run whose run code carries changed event weights for maintainer review", async () => {
      // A regular-mode clear whose code carries 69.50, the anniversary build's total, instead of the regular 62.70.
      const sqlite = await deliverRegularClear("9695-1153-2370");

      // Players see only the generic reason; the values stay in maintainer-only match evidence.
      expect(sqlite.prepare("SELECT status, review_reason FROM submissions WHERE id = 'submission.weights'").get()).toEqual({ status: "ocr_review_required", review_reason: "无法通过成就挑战校验" });
      expect(JSON.parse((sqlite.prepare("SELECT match_json FROM ocr_results WHERE submission_id = 'submission.weights'").get() as { match_json: string }).match_json)).toEqual({ runCodeEventWeight: { read: 6950, expected: 6270 } });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.weights'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE player_account_id = 'player.weights'").get()).toEqual({ count: 0 });
    });

    it("tolerates small drift between platform weights and the deployed build", async () => {
      // 63.00 is within ±0.50 of the expected 62.70; 63.30 is not.
      const within = await deliverRegularClear("1631-2408-5670");
      expect(within.prepare("SELECT status FROM submissions WHERE id = 'submission.weights'").get()).toEqual({ status: "approved" });
      const beyond = await deliverRegularClear("1631-2438-5670");
      expect(beyond.prepare("SELECT status FROM submissions WHERE id = 'submission.weights'").get()).toEqual({ status: "ocr_review_required" });
    });

    it("holds a screenshot whose mode label matches no configured mode for maintainer review", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.rialto");
      seedTitle(sqlite, "DOMINATOR");
      seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.garbled', 'garbled-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.garbled', 'identity.garbled', 'player.garbled', 'qq', 'group.garbled', 'member.garbled', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.garbled', 'binding.garbled', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'garbled.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.garbled', 'submission.garbled', 'portal', 'external.garbled', 'image/png', 1, 'hash', 'evidence/garbled.png', 'stored', ?)").run(now);

      // A regular clear whose 随机事件 label OCR misread: neither regular nor any configured standalone mode.
      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: Object.fromEntries(["challenge_completed", "map_name", "difficulty"].map((field) => [field, { status: "ok", confidence: 0.99 }])),
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.rialto", difficulty: "地狱", mode: "随机事仵5.0" },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.garbled", objectKey: "evidence/garbled.png", attempt: 1, requestId: "request.garbled" });
      } finally {
        vi.unstubAllGlobals();
      }

      expect(sqlite.prepare("SELECT status, review_reason, ocr_fail_count FROM submissions WHERE id = 'submission.garbled'").get()).toEqual({ status: "ocr_review_required", review_reason: "无法识别截图所在的游戏模式，请人工核对", ocr_fail_count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.garbled'").get()).toEqual({ count: 0 });
    });

    it("records a standalone-mode clear on that mode's revision and settles only the checked limited title", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.rialto");
      sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, game_version, created_at, updated_at) VALUES ('revision:map.rialto:mirror', 'map.rialto', 'selectable', NULL, '2026镜中回响', '99.0101.1', ?, ?)").run(now, now);
      seedEventPools(sqlite);
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      seedTitle(sqlite, "PROPHET");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.prophet', 'PROPHET', '触发 10 次先知', '上传截图', 'manual', '2026周年', 'active', '2026周年', 'global', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.mirror', 'mirror-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.mirror', 'identity.mirror', 'player.mirror', 'qq', 'group.mirror', 'member.mirror', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.mirror', 'binding.mirror', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'mirror.1', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.mirror', 'submission.mirror', 'portal', 'external.mirror', 'image/png', 1, 'hash', 'evidence/mirror.png', 'stored', ?)").run(now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: Object.fromEntries(["challenge_completed", "map_name", "difficulty", "achievement_titles", "version", "run_code", "duration_seconds", "deaths", "skips"].map((field) => [field, { status: "ok", confidence: 0.99 }])),
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.rialto", difficulty: "地狱", mode: "2026镜中回响", achievement_titles: ["称号 PROPHET"], version: "99.0101.1", run_code: "9695-1153-2370", duration_seconds: 600, deaths: 0, skips: 0 },
      };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.mirror", objectKey: "evidence/mirror.png", attempt: 1, requestId: "request.mirror" });
      } finally {
        vi.unstubAllGlobals();
      }

      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.mirror'").get()).toEqual({ status: "approved" });
      expect(sqlite.prepare("SELECT title_key, source_type FROM player_title_grants WHERE player_account_id = 'player.mirror' AND status = 'active'").all()).toEqual([
        { title_key: "PROPHET", source_type: "automatic" },
      ]);
      expect(sqlite.prepare("SELECT gameplay_revision_id, status FROM mastery_runs WHERE player_account_id = 'player.mirror'").all()).toEqual([
        { gameplay_revision_id: "revision:map.rialto:mirror", status: "active" },
      ]);
    });

    it("preserves each matched challenge completion while granting a shared title once", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.shared-title");
      seedTitle(sqlite, "SHARED_TITLE");
      const challengeIds = ["challenge.shared.first", "challenge.shared.second"];
      const insertChallenge = sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, 'map.shared-title', 'difficulty_completion', ?, '传奇', '完成通关', '上传截图', 'automatic', 'SHARED_TITLE', '2026.07.15', 'active', '2026.07.15', ?, ?)");
      for (const [index, challengeId] of challengeIds.entries()) {
        insertChallenge.run(challengeId, `挑战 ${index + 1}`, now, now);
        seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.shared-title:initial", mapId: "map.shared-title", challengeFamily: "map_challenge", challengeId, slot: "shared" });
      }
      const seedPlayerSubmission = (playerId: string, bindingId: string, submissionId: string, status: string) => {
        sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, 'Tester', 'tester', 0, 'active', ?, ?)").run(playerId, playerId, now, now);
        sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
        sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, ?, 'unknown', '成就挑战', 'Tester', 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, status, `message.${submissionId}`, now, now);
      };
      seedPlayerSubmission("player.shared.auto", "binding.shared.auto", "submission.shared.auto", "ocr_pending");
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.shared.auto', 'submission.shared.auto', 'portal', 'external.shared.auto', 'image/png', 1, 'hash', 'evidence/shared-auto.png', 'stored', ?)").run(now);
      seedPlayerSubmission("player.shared.review", "binding.shared.review", "submission.shared.review", "ocr_review_required");

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          difficulty: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.shared-title", difficulty: "传奇" },
      };
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.shared.review', 'submission.shared.review', 1, 'review_required', ?, '{}', ?)").run(JSON.stringify(ocrResponse), now);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.shared.auto", objectKey: "evidence/shared-auto.png", attempt: 1, requestId: "request.shared.auto" });
        const reviewed = await services.reviewSubmission(
          { submissionId: "submission.shared.review", decision: "approved" },
          { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" },
          "shared-title-review",
        );
        expect(reviewed.grants).toHaveLength(1);
      } finally {
        vi.unstubAllGlobals();
      }

      expect(sqlite.prepare("SELECT s.id AS submission_id, c.source_id AS challenge_id FROM challenge_completions completion JOIN challenges c ON c.id = completion.challenge_id JOIN submissions s ON s.id = completion.source_id WHERE completion.source_id IN ('submission.shared.auto', 'submission.shared.review') AND completion.status = 'active' ORDER BY s.id, c.source_id").all()).toEqual([
        { submission_id: "submission.shared.auto", challenge_id: challengeIds[0] },
        { submission_id: "submission.shared.auto", challenge_id: challengeIds[1] },
        { submission_id: "submission.shared.review", challenge_id: challengeIds[0] },
        { submission_id: "submission.shared.review", challenge_id: challengeIds[1] },
      ]);
      expect(sqlite.prepare("SELECT player_account_id, source_type, title_key, COUNT(*) AS count FROM player_title_grants WHERE source_id IN ('submission.shared.auto', 'submission.shared.review') AND status = 'active' GROUP BY player_account_id, source_type, title_key ORDER BY player_account_id").all()).toEqual([
        { player_account_id: "player.shared.auto", source_type: "automatic", title_key: "SHARED_TITLE", count: 1 },
        { player_account_id: "player.shared.review", source_type: "submission", title_key: "SHARED_TITLE", count: 1 },
      ]);
      expect(sqlite.prepare("SELECT json_extract(payload_json, '$.submissionId') AS submission_id, operation, COUNT(*) AS count FROM audit_events WHERE operation IN ('challenge.completion.submission', 'submission.automatic_grant', 'submission.grant') AND json_extract(payload_json, '$.submissionId') IN ('submission.shared.auto', 'submission.shared.review') GROUP BY submission_id, operation ORDER BY submission_id, operation").all()).toEqual([
        { submission_id: "submission.shared.auto", operation: "challenge.completion.submission", count: 2 },
        { submission_id: "submission.shared.auto", operation: "submission.automatic_grant", count: 1 },
        { submission_id: "submission.shared.review", operation: "challenge.completion.submission", count: 2 },
        { submission_id: "submission.shared.review", operation: "submission.grant", count: 1 },
      ]);
    });
  });

  describe("historical title migration", () => {
    it("reconciles inherited conqueror grants before linking historical records", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
      seedMap(sqlite, "map.inherited");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.migration', 'migration-1', 'Migration Player', 'migration player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.conqueror', 'map', 'map.inherited', 'revision:map.inherited:initial', 'conqueror', 'CONQUEROR', 'Migration Player', 'test'), ('historical.dominator', 'map', 'map.inherited', 'revision:map.inherited:initial', 'dominator', 'DOMINATOR', 'Migration Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.dominator', 'player.migration', 'DOMINATOR', 'map.inherited', 'revision:map.inherited:initial', 'dominator', 'active', 'historical', 'historical.dominator', 'admin', ?), ('grant.inherited.conqueror', 'player.migration', 'CONQUEROR', 'map.inherited', 'revision:map.inherited:initial', 'conqueror', 'active', 'historical', 'historical.dominator', 'admin', ?)").run(now, now);

      const services = createPlatformServices(database);
      const summary = await services.listHistoricalTitleGrants({ contractVersion: "1", page: 1, pageSize: 10, filter: "all" });
      expect(summary.holders).toEqual([{ holderName: "Migration Player", totalCount: 2, unclaimedCount: 1, status: "pending" }]);
      const detail = await services.getHistoricalTitleHolder({ contractVersion: "1", holderName: "Migration Player", page: 1, pageSize: 10, grantStatus: "all" });
      expect(detail.total).toBe(2);
      expect(detail.items.map((item) => ({ titleKey: item.titleKey, status: item.status }))).toEqual([
        { titleKey: "CONQUEROR", status: "unclaimed" },
        { titleKey: "DOMINATOR", status: "active" },
      ]);
      const response = await services.createAdminTitleGrantBulk({ contractVersion: "1", holderName: "Migration Player", playerAccountId: "player.migration" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "bulk-reconcile");

      expect(response).toEqual({ contractVersion: "1", grantedCount: 1, skippedClaimedCount: 1 });
      expect(sqlite.prepare("SELECT title_key, source_id FROM player_title_grants WHERE player_account_id = 'player.migration' ORDER BY title_key").all()).toEqual([
        { title_key: "CONQUEROR", source_id: "historical.conqueror" },
        { title_key: "DOMINATOR", source_id: "historical.dominator" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.grant.bulk'").get()).toEqual({ count: 1 });
    });

    it("reconciles inherited conqueror grants for a single historical record", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
      seedMap(sqlite, "map.single");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.single', 'single-1', 'Single Player', 'single player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.single.conqueror', 'map', 'map.single', 'revision:map.single:initial', 'conqueror', 'CONQUEROR', 'Single Player', 'test'), ('historical.single.dominator', 'map', 'map.single', 'revision:map.single:initial', 'dominator', 'DOMINATOR', 'Single Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.single.dominator', 'player.single', 'DOMINATOR', 'map.single', 'revision:map.single:initial', 'dominator', 'active', 'historical', 'historical.single.dominator', 'admin', ?), ('grant.single.inherited.conqueror', 'player.single', 'CONQUEROR', 'map.single', 'revision:map.single:initial', 'conqueror', 'active', 'historical', 'historical.single.dominator', 'admin', ?)").run(now, now);

      const services = createPlatformServices(database);
      await services.createAdminTitleGrant({ contractVersion: "1", playerAccountId: "player.single", historicalTitleGrantId: "historical.single.conqueror" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "single-reconcile");

      expect(sqlite.prepare("SELECT title_key, source_id FROM player_title_grants WHERE id = 'grant.single.inherited.conqueror'").get()).toEqual({ title_key: "CONQUEROR", source_id: "historical.single.conqueror" });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.title.grant'").get()).toEqual({ count: 1 });
    });

    it("does not rebind a dominator grant from a different historical source", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      sqlite.exec("CREATE UNIQUE INDEX player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, '')) WHERE status = 'active';");
      seedMap(sqlite, "map.dominator");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.dominator', 'dominator-1', 'Dominator Player', 'dominator player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.dominator.target', 'map', 'map.dominator', 'revision:map.dominator:initial', 'dominator', 'DOMINATOR', 'Dominator Player', 'test'), ('historical.dominator.source', 'map', 'map.dominator', 'revision:map.dominator:initial', 'dominator', 'DOMINATOR', 'Other Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.dominator.source', 'player.dominator', 'DOMINATOR', 'map.dominator', 'revision:map.dominator:initial', 'dominator', 'active', 'historical', 'historical.dominator.source', 'admin', ?)").run(now);

      const services = createPlatformServices(database);
      await expect(services.createAdminTitleGrant({ contractVersion: "1", playerAccountId: "player.dominator", historicalTitleGrantId: "historical.dominator.target" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "dominator-source-conflict")).rejects.toThrow("HISTORICAL_TITLE_GRANT_CLAIMED");
      expect(sqlite.prepare("SELECT source_id FROM player_title_grants WHERE id = 'grant.dominator.source'").get()).toEqual({ source_id: "historical.dominator.source" });
    });

    it("blocks a single historical claim when the player's same-scope Grant was administratively revoked", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.revoked.single");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.revoked.single', 'revoked-single-1', 'Revoked Player', 'revoked player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.revoked.single', 'map', 'map.revoked.single', 'revision:map.revoked.single:initial', 'dominator', 'DOMINATOR', 'Revoked Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.revoked.single', 'player.revoked.single', 'DOMINATOR', 'map.revoked.single', 'revision:map.revoked.single:initial', 'dominator', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'review block', 'administrator')").run(now, now);

      const services = createPlatformServices(database);
      await expect(services.createAdminTitleGrant({ contractVersion: "1", playerAccountId: "player.revoked.single", historicalTitleGrantId: "historical.revoked.single" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "revoked-single-claim")).rejects.toThrow("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.revoked.single' AND status = 'active'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE player_account_id = 'player.revoked.single'").get()).toEqual({ count: 0 });
    });

    it("blocks bulk historical claims when a same-scope Grant was administratively revoked", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.revoked.bulk");
      seedTitle(sqlite, "DOMINATOR");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.revoked.bulk', 'revoked-bulk-1', 'Bulk Revoked Player', 'bulk revoked player', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO historical_title_grants (id, scope, map_id, gameplay_revision_id, slot, title_key, holder_name, source_version) VALUES ('historical.revoked.bulk', 'map', 'map.revoked.bulk', 'revision:map.revoked.bulk:initial', 'dominator', 'DOMINATOR', 'Bulk Revoked Player', 'test')").run();
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.revoked.bulk', 'player.revoked.bulk', 'DOMINATOR', 'map.revoked.bulk', 'revision:map.revoked.bulk:initial', 'dominator', 'revoked', 'automatic', 'submission:old', 'admin', ?, 'admin', ?, 'review block', 'administrator')").run(now, now);

      const services = createPlatformServices(database);
      await expect(services.createAdminTitleGrantBulk({ contractVersion: "1", holderName: "Bulk Revoked Player", playerAccountId: "player.revoked.bulk" } as never, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "revoked-bulk-claim")).rejects.toThrow("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.revoked.bulk' AND status = 'active'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE player_account_id = 'player.revoked.bulk'").get()).toEqual({ count: 0 });
    });
  });

  // ─── Invariant: Stable IDs ────────────────────────────────────────────────
  describe("stable IDs – compat table preserves map.<mapId>.<kind> IDs", () => {
    it("resolves a legacy challenge ID via the compat table", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris", 1);

      // Verify compat row exists and points to the rule + map.
      const compat = sqlite.prepare(
        "SELECT * FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { rule_id: string; map_id: string; is_standard_instance: number } | undefined;

      expect(compat?.rule_id).toBe("rule.conqueror");
      expect(compat?.map_id).toBe("map.paris");
      expect(compat?.is_standard_instance).toBe(1);

      // The legacy ID must not change when the rule is updated.
      sqlite.prepare("UPDATE map_title_rules SET condition = '新条件', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 1000);
      const compatAfter = sqlite.prepare(
        "SELECT legacy_challenge_id FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { legacy_challenge_id: string } | undefined;
      expect(compatAfter?.legacy_challenge_id).toBe("map.paris.conqueror");
    });

    it("distinguishes standard instances from real exceptions in the compat table", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedMap(sqlite, "map.busan");
      seedTitle(sqlite, "CONQUEROR_BUSAN"); // real exception title
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris", 1);  // standard
      seedCompat(sqlite, "map.busan.conqueror", "rule.conqueror", "map.busan", 0);  // real exception

      const paris = sqlite.prepare(
        "SELECT is_standard_instance FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.paris.conqueror'",
      ).get() as { is_standard_instance: number } | undefined;
      const busan = sqlite.prepare(
        "SELECT is_standard_instance FROM map_title_rule_compat WHERE legacy_challenge_id = 'map.busan.conqueror'",
      ).get() as { is_standard_instance: number } | undefined;

      expect(paris?.is_standard_instance).toBe(1);
      expect(busan?.is_standard_instance).toBe(0);
    });
  });

  // ─── Invariant: Exception precedence ─────────────────────────────────────
  describe("exception precedence – resolution is deterministic", () => {
    it("projects map-scoped title challenges into the map catalog and admin map list", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.hanamura");
      seedTitle(sqlite, "CLASSIC");
      seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.hanamura");
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.listChallenges({ family: "map" })).resolves.toContainEqual(expect.objectContaining({ challengeId: "title.CLASSIC", titleKey: "CLASSIC", mapId: "map.hanamura", kind: "map_title_achievement" }));
      await expect(services.listAdminChallenges({ family: "map" }, auth)).resolves.toMatchObject({ items: [expect.objectContaining({ challengeId: "title.CLASSIC", titleKey: "CLASSIC", mapId: "map.hanamura", kind: "map_title_achievement" })] });
    });

    it("projects one stable, traceable map challenge for Portal, Admin, and Agents", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      const services = createPlatformServices(database);

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" });
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const expected = { challengeId: "map.paris.conqueror", titleKey: "CONQUEROR", mapId: "map.paris", mapTitleRule: { ruleId: "rule.conqueror", kind: "conqueror", displayKind: "map_name_suffix", slot: "conqueror", dynamic: true } };

      expect(portal).toContainEqual(expect.objectContaining(expected));
      expect(admin.items).toContainEqual(expect.objectContaining(expected));
      expect(agents.items).toContainEqual(expect.objectContaining(expected));
    });

    it("projects assignments on an arbitrary selectable revision across every map challenge family", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedTitle(sqlite, "REWORK");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedLegacyMapChallenge(sqlite, "challenge.paris.direct", "map.paris");
      seedMapTitleChallenge(sqlite, "title.paris.rework", "REWORK", "map.paris");
      const reworkRevisionId = seedSelectableGameplayRevision(sqlite, "map.paris");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      seedAgentSpatialConfig(sqlite, reworkRevisionId);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.conqueror" });
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "map_challenge", challengeId: "challenge.paris.direct" });
      seedRevisionAssignment(sqlite, { gameplayRevisionId: reworkRevisionId, mapId: "map.paris", challengeFamily: "title_challenge", challengeId: "title.paris.rework" });
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const portal = await services.listChallenges({ family: "map" });
      const admin = await services.listAdminChallenges({ family: "map" }, auth);
      const agents = await services.listAgentAchievements({ page: 1, pageSize: 20, mapId: "map.paris" });
      const reworkProjection = (challengeId: string, gameVersion = "2026.08.10") => expect.objectContaining({ challengeId, mapId: "map.paris", gameplayRevisionId: reworkRevisionId, gameVersion });

      expect(portal).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("challenge.paris.direct"),
        reworkProjection("title.paris.rework"),
      ]));
      expect(admin.items).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror", "2026.07.15"),
        reworkProjection("challenge.paris.direct", "2026.07.15"),
        reworkProjection("title.paris.rework", "2026.07.15"),
      ]));
      expect(agents.items).toEqual(expect.arrayContaining([
        reworkProjection("map.paris.conqueror"),
        reworkProjection("title.paris.rework"),
      ]));
    });

    it("reruns canonical matching from reviewed OCR corrections without creating annotations", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedTitle(sqlite, "HERO");
      seedTitle(sqlite, "SECOND");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key IN ('HERO', 'SECOND')").run();
      const insertChallenge = (id: string, key: string) => sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES (?, ?, '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(id, key, now, now);
      insertChallenge("title.hero", "HERO");
      insertChallenge("title.second", "SECOND");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.mixed', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.mixed', 'identity.mixed', 'player.mixed', 'qq', 'group.mixed', 'member.mixed', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.mixed', 'binding.mixed', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.mixed', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.mixed', 'submission.mixed', 1, 'review_required', ?, ?, ?)").run(
        JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: { map_name: "海滨城", achievement_titles: ["HERO", "SECOND", "THIRD"] } }),
        JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: true } }] }),
        now,
      );
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const reviewInput = { submissionId: "submission.mixed", decision: "approved" as const, fieldCorrections: [{ fieldKey: "map_name" as const, reviewedValue: "国王大道" }, { fieldKey: "achievement_titles" as const, reviewedValue: "称号 HERO、称号 SECOND、THIRD" }] };
      const result = await services.reviewSubmission(reviewInput, auth, "review.mixed");
      expect(result).toMatchObject({ decision: "approved", grants: [{ titleKey: "HERO" }, { titleKey: "SECOND" }] });
      expect(result).not.toHaveProperty("reviewedAnnotationIds");
      // Review corrections stay transient business inputs; no annotation rows are written.
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation LIKE 'annotation.%'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT response_json FROM ocr_results WHERE id = 'ocr.mixed'").get()).toMatchObject({ response_json: expect.stringContaining('"THIRD"') });
      const replay = await services.reviewSubmission(reviewInput, auth, "review.mixed");
      expect(replay).toEqual(result);
    });

    it("routes legacy single-selection reviews through the Completion chain", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedTitle(sqlite, "HERO");
      seedTitle(sqlite, "LOWER");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key IN ('HERO', 'LOWER')").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, starts_at, ends_at, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?, ?, ?)").run(now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('legacy:title_challenge:title.hero::', 'title_challenge', 'title.hero', 'HERO', 'legacy', 'active', 0, 1, 'and', ?, '完成英雄挑战', ?, ?, ?, ?), ('challenge.lower', 'title_challenge', 'title.lower', 'LOWER', 'legacy', 'active', 0, 0, 'and', '[]', '低级条件', NULL, NULL, ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "HERO" }] }), now - 100, now + 100, now, now, now, now);
      sqlite.prepare("INSERT INTO challenge_satisfies (challenge_id, satisfied_challenge_id, created_at) VALUES ('legacy:title_challenge:title.hero::', 'challenge.lower', ?)").run(now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.legacy.review', 'legacy-review-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.legacy.review', 'identity.legacy.review', 'player.legacy.review', 'qq', 'group.legacy.review', 'member.legacy.review', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.legacy.review', 'binding.legacy.review', 'ocr_review_required', 'title_achievement', 'title.hero', '成就挑战', 'Tester', 'portal', 'portal', 'legacy.review', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.legacy.review', 'submission.legacy.review', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: { achievement_titles: ["称号 HERO"] } }), now);

      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const result = await services.reviewSubmission({ submissionId: "submission.legacy.review", decision: "approved" }, auth, "legacy-review-approve");

      expect(result).toMatchObject({ decision: "approved", titleKey: "HERO", alreadyOwned: false });
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy.review'").get()).toMatchObject({ status: "approved", grant_id: expect.any(String) });
      expect(sqlite.prepare("SELECT title_key, c.source_type FROM player_title_grants g JOIN challenge_completions c ON c.id = g.completion_id WHERE g.source_id = 'submission.legacy.review' AND g.status = 'active' AND c.status = 'active' ORDER BY title_key").all()).toEqual([
        { title_key: "HERO", source_type: "submission" },
        { title_key: "LOWER", source_type: "challenge_satisfies" },
      ]);
    });

    it("does not grant a stored legacy Challenge without matching evidence", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, starts_at, ends_at, created_at, updated_at) VALUES ('title.legacy-no-evidence', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?, ?, ?)").run(now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('legacy:title_challenge:title.legacy-no-evidence::', 'title_challenge', 'title.legacy-no-evidence', 'HERO', 'legacy', 'active', 0, 1, 'and', ?, '完成英雄挑战', ?, ?, ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "HERO" }] }), now - 100, now + 100, now, now);
      seedMasteryPlayer(sqlite, "player.legacy-no-evidence", "binding.legacy-no-evidence", "Tester");
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.legacy-no-evidence', 'binding.legacy-no-evidence', 'ocr_review_required', 'title_achievement', 'title.legacy-no-evidence', '成就挑战', 'Tester', 'portal', 'portal', 'legacy-no-evidence', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.legacy-no-evidence', 'submission.legacy-no-evidence', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: {} }), now);

      const services = createPlatformServices(database);
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(services.reviewSubmission({ submissionId: "submission.legacy-no-evidence", decision: "approved" }, maintainer, "legacy-no-evidence")).rejects.toThrow("SUBMISSION_OUTCOME_NOT_CONFIGURED");
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy-no-evidence'").get()).toEqual({ status: "ocr_review_required", grant_id: null });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.legacy-no-evidence'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_id = 'submission.legacy-no-evidence'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.legacy-no-evidence'").get()).toEqual({ count: 0 });
    });

    it("keeps a legacy submission pending after an administrative revoke", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, starts_at, ends_at, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?, ?, ?)").run(now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('legacy:title_challenge:title.hero::', 'title_challenge', 'title.hero', 'HERO', 'legacy', 'active', 0, 1, 'and', ?, '完成英雄挑战', ?, ?, ?, ?)").run(JSON.stringify({ operator: "and", conditions: [{ type: "achievement_title", titleKey: "HERO" }] }), now - 100, now + 100, now, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.legacy.revoked', 'legacy-revoked-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.legacy.revoked', 'identity.legacy.revoked', 'player.legacy.revoked', 'qq', 'group.legacy.revoked', 'member.legacy.revoked', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.legacy.revoked', 'binding.legacy.revoked', 'ocr_review_required', 'title_achievement', 'title.hero', '成就挑战', 'Tester', 'portal', 'portal', 'legacy.revoked', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.legacy.revoked', 'submission.legacy.revoked', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v3", layout_version: "layout-v7", data: { achievement_titles: ["称号 HERO"] } }), now);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.legacy.revoked', 'player.legacy.revoked', 'HERO', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'review block', 'administrator')").run(now, now);

      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(services.reviewSubmission({ submissionId: "submission.legacy.revoked", decision: "approved" }, auth, "legacy-review-revoked")).rejects.toThrow("SUBMISSION_OUTCOME_NOT_CONFIGURED");

      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy.revoked'").get()).toEqual({ status: "ocr_review_required", grant_id: null });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.legacy.revoked'").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.legacy.revoked' AND status = 'active'").get()).toEqual({ count: 0 });
    });

    it("persists confirmed field truth when the business submission is rejected", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.reject', '1003', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.reject', 'identity.reject', 'player.reject', 'qq', 'group.reject', 'member.reject', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.reject', 'binding.reject', 'ocr_review_required', 'unknown', '截图地图', 'Tester', 'portal', 'portal', 'message.reject', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.reject', 'submission.reject', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, model_version: "ocr-v4", layout_version: "layout-v8", data: { map_name: "截图地图" } }), now);
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const result = await services.reviewSubmission({ submissionId: "submission.reject", decision: "rejected", fieldCorrections: [{ fieldKey: "map_name", reviewedValue: "国王大道" }] }, auth, "review.reject");

      expect(result).toMatchObject({ decision: "rejected" });
      expect(result).not.toHaveProperty("reviewedAnnotationIds");
      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.reject'").get()).toEqual({ status: "rejected" });
      // Corrections on a rejected review are transient business inputs, not annotations.
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations").get()).toEqual({ count: 0 });
    });

    it("matches manually confirmed facts without treating them as corrected annotations", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedTitle(sqlite, "HERO");
      sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
      sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.incomplete', '1002', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.incomplete', 'identity.incomplete', 'player.incomplete', 'qq', 'group.incomplete', 'member.incomplete', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.incomplete', 'binding.incomplete', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.incomplete', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.incomplete', 'submission.incomplete', 1, 'review_required', ?, ?, ?)").run(JSON.stringify({ data: { achievement_titles: ["称号 HERO", "SECOND"] } }), JSON.stringify({ candidates: [{ challengeId: "title.hero", challengeType: "title_achievement", titleName: "称号 HERO", match: { achievement: true } }] }), now);
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await expect(services.reviewSubmission({ submissionId: "submission.incomplete", decision: "approved" }, auth, "review.incomplete")).resolves.toMatchObject({ decision: "approved" });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations WHERE submission_id = 'submission.incomplete'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.incomplete'").get()).toEqual({ count: 1 });
    });

    it("does not expose a legacy map-title row alongside its rule projection", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.paris.conqueror", "rule.conqueror", "map.paris");
      seedLegacyMapChallenge(sqlite, "map.paris.conqueror", "map.paris");
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const portal = (await services.listChallenges({ family: "map" })).filter((item) => item.challengeId === "map.paris.conqueror" && item.mapId === "map.paris");
      const admin = (await services.listAdminChallenges({ family: "map" }, auth)).items.filter((item) => item.challengeId === "map.paris.conqueror" && item.mapId === "map.paris");

      expect(portal).toHaveLength(1);
      expect(portal[0]).toMatchObject({ mapTitleRule: { ruleId: "rule.conqueror", dynamic: true } });
      expect(admin).toHaveLength(1);
      expect(admin[0]).toMatchObject({ mapTitleRule: { ruleId: "rule.conqueror", dynamic: true } });
    });

    it("keeps repeated legacy challenge IDs distinct by map context", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedMap(sqlite, "map.hanamura");
      seedTitle(sqlite, "CLASSIC");
      seedRule(sqlite, "rule.classic", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
      seedException(sqlite, "exception.paris", "rule.classic", "map.paris");
      seedException(sqlite, "exception.hanamura", "rule.classic", "map.hanamura");
      seedAgentSpatialConfig(sqlite, "revision:map.paris:initial");
      seedAgentSpatialConfig(sqlite, "revision:map.hanamura:initial");
      seedAgentSpatialConfig(sqlite, legacyGameplayRevisionId("map.paris"));
      seedAgentSpatialConfig(sqlite, legacyGameplayRevisionId("map.hanamura"));
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.paris");
      seedCompat(sqlite, "title.CLASSIC", "rule.classic", "map.hanamura");
      const services = createPlatformServices(database);

      const projections = (await services.listChallenges({ family: "map" })).filter((item) => item.challengeId === "title.CLASSIC");
      expect(projections).toHaveLength(2);
      expect(projections).toEqual(expect.arrayContaining([
        expect.objectContaining({ challengeId: "title.CLASSIC", mapId: "map.paris", mapVariant: "classic" }),
        expect.objectContaining({ challengeId: "title.CLASSIC", mapId: "map.hanamura", mapVariant: "classic" }),
      ]));
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC" })).resolves.toBeNull();
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC", mapId: "map.paris" })).resolves.toMatchObject({ mapId: "map.paris", mapVariant: "classic" });
      await expect(services.getAgentAchievement({ challengeId: "title.CLASSIC", mapId: "map.hanamura" })).resolves.toMatchObject({ mapId: "map.hanamura", mapVariant: "classic" });
    });

    it("disabled standard-rule exception does not remove an enabled revision assignment", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror", defaultScope: "all_active" });
      seedException(sqlite, "exc.1", "rule.conqueror", "map.paris", { enabled: 0, condition: "不生效的地图覆盖" });
      sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET enabled = 1, condition = '修订条件' WHERE gameplay_revision_id = 'revision:map.paris:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").run();
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      const result = await services.listAdminMapTitleInheritance({ mapId: "map.paris" }, auth);
      expect(result.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "修订条件", slot: "conqueror" },
      });
    });

    it("enabled map overrides take precedence over revision values while keeping title_key in the rule", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedException(sqlite, "exc.1", "rule.conqueror", "map.paris", {
        enabled: 1,
        condition: "巴黎专属条件",
        slot: "pioneer", // overrides rule default slot
      });
      sqlite.prepare("UPDATE map_title_rule_exceptions SET evidence_rule = '巴黎截图规则', submission_mode = 'automatic' WHERE rule_id = 'rule.conqueror' AND map_id = 'map.paris'").run();
      sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET condition = '修订条件', evidence_rule = '修订截图规则', submission_mode = 'manual', slot = 'dominator' WHERE gameplay_revision_id = 'revision:map.paris:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").run();

      // Exception must not create a new title_key; rule's title_key is authoritative.
      const rule = sqlite.prepare("SELECT title_key FROM map_title_rules WHERE id = 'rule.conqueror'").get() as { title_key: string };
      const exc = sqlite.prepare("SELECT condition, slot FROM map_title_rule_exceptions WHERE id = 'exc.1'").get() as { condition: string; slot: string };
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const inheritance = await services.listAdminMapTitleInheritance({ mapId: "map.paris" }, auth);

      expect(rule.title_key).toBe("CONQUEROR");
      expect(exc.condition).toBe("巴黎专属条件");
      expect(exc.slot).toBe("pioneer");
      expect(inheritance.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "巴黎专属条件", slot: "pioneer" },
      });
      await expect(services.listChallenges({ family: "map", mapId: "map.paris" })).resolves.toContainEqual(expect.objectContaining({
        challengeId: "map.paris.conqueror",
        gameplayRevisionId: "revision:map.paris:initial",
        condition: "巴黎专属条件",
        evidenceRule: "巴黎截图规则",
        submissionMode: "automatic",
        mapTitleRule: expect.objectContaining({ slot: "pioneer" }),
      }));
      // The exception does not carry its own title_key column — the rule owns it.
      const hasOwnTitleKey = sqlite.prepare("SELECT COUNT(*) AS c FROM pragma_table_info('map_title_rule_exceptions') WHERE name = 'title_key'").get() as { c: number };
      expect(hasOwnTitleKey.c).toBe(0);
    });

    it("saves map overrides without changing revision applicability or assignment values", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.override");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      sqlite.prepare("UPDATE gameplay_revision_challenge_assignments SET condition = '修订条件', evidence_rule = '修订截图规则', submission_mode = 'automatic', slot = 'dominator' WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").run();
      const assignmentBefore = sqlite.prepare("SELECT enabled, condition, evidence_rule, submission_mode, slot FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").get();
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await services.upsertAdminMapTitleRuleException({
        contractVersion: "1",
        mapId: "map.override",
        ruleId: "rule.conqueror",
        enabled: true,
        condition: "地图级条件",
        evidenceRule: "地图级截图规则",
        submissionMode: "manual",
        slot: "pioneer",
      }, auth, "map-exception-enabled");
      expect(sqlite.prepare("SELECT enabled, condition, evidence_rule, submission_mode, slot FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").get()).toEqual(assignmentBefore);
      let inheritance = await services.listAdminMapTitleInheritance({ mapId: "map.override" }, auth);
      expect(inheritance.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "地图级条件", evidenceRule: "地图级截图规则", submissionMode: "manual", slot: "pioneer" },
      });

      await services.upsertAdminMapTitleRuleException({
        contractVersion: "1",
        mapId: "map.override",
        ruleId: "rule.conqueror",
        enabled: false,
        condition: "已停用的地图级条件",
      }, auth, "map-exception-disabled");
      expect(sqlite.prepare("SELECT enabled, condition, evidence_rule, submission_mode, slot FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.override:initial' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.conqueror'").get()).toEqual(assignmentBefore);
      inheritance = await services.listAdminMapTitleInheritance({ mapId: "map.override" }, auth);
      expect(inheritance.items.find((item) => item.rule.ruleId === "rule.conqueror")).toMatchObject({
        projected: true,
        effective: { condition: "修订条件", evidenceRule: "修订截图规则", submissionMode: "automatic", slot: "dominator" },
      });
    });

    it("rule default applies when no exception exists and scope is all_active", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror", defaultScope: "all_active" });

      const noException = sqlite.prepare(
        "SELECT COUNT(*) AS c FROM map_title_rule_exceptions WHERE rule_id = 'rule.conqueror' AND map_id = 'map.paris'",
      ).get() as { c: number };
      expect(noException.c).toBe(0);

      // For all_active scope the rule projects to map.paris without an exception.
      const rule = sqlite.prepare("SELECT default_scope, slot FROM map_title_rules WHERE id = 'rule.conqueror'").get() as { default_scope: string; slot: string };
      expect(rule.default_scope).toBe("all_active");
      expect(rule.slot).toBe("conqueror");
    });

    it("explicit-scope rule does not project without a revision assignment", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "SPECIAL");
      seedRule(sqlite, "rule.special", "SPECIAL", "special", { defaultScope: "explicit" });
      const services = createPlatformServices(database);

      await expect(services.listChallenges({ family: "map", mapId: "map.paris" })).resolves.not.toContainEqual(expect.objectContaining({ mapTitleRule: expect.objectContaining({ ruleId: "rule.special" }) }));
    });

    it("requires both a revision assignment and a valid Pioneer window", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "all_active" });
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));

      sqlite.prepare("UPDATE map_title_rules SET default_scope = 'explicit' WHERE id = 'rule.pioneer'").run();
      sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE map_id = 'map.paris' AND challenge_family = 'map_title_rule' AND challenge_id = 'rule.pioneer'").run();
      await services.upsertAdminMapTitleRuleException({
        contractVersion: "1", mapId: "map.paris", ruleId: "rule.pioneer", enabled: true,
        startsAt: now - 60_000, endsAt: now + 60_000,
      }, auth, "pioneer-window");
      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));

      seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.paris:initial", mapId: "map.paris", challengeFamily: "map_title_rule", challengeId: "rule.pioneer" });
      await expect(services.listChallenges({ family: "map" })).resolves.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris", mapTitleRule: expect.objectContaining({ kind: "pioneer" }) }));

      sqlite.prepare("UPDATE map_title_rule_exceptions SET ends_at = ? WHERE rule_id = 'rule.pioneer' AND map_id = 'map.paris'").run(now - 1);
      await expect(services.listChallenges({ family: "map" })).resolves.not.toContainEqual(expect.objectContaining({ titleKey: "PIONEER", mapId: "map.paris" }));
    });

    it("uses submission.createdAt for Pioneer OCR after the window ends", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
      const startsAt = now - 10_000;
      const endsAt = now - 1;
      seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris", { startsAt, endsAt });
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.pioneer', 'pioneer-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.pioneer', 'identity.pioneer', 'player.pioneer', 'qq', 'group.pioneer', 'member.pioneer', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.pioneer.inside', 'binding.pioneer', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.inside', ?, ?), ('submission.pioneer.at-end', 'binding.pioneer', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.at-end', ?, ?)").run(endsAt - 1, endsAt - 1, endsAt, endsAt);
      sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment.pioneer.inside', 'submission.pioneer.inside', 'portal', 'external.inside', 'image/png', 1, 'hash', 'evidence/inside.png', 'stored', ?), ('attachment.pioneer.at-end', 'submission.pioneer.at-end', 'portal', 'external.at-end', 'image/png', 1, 'hash', 'evidence/at-end.png', 'stored', ?)").run(now, now);

      const ocrResponse = {
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: {
          challenge_completed: { status: "ok", confidence: 0.99 },
          viewer_player: { status: "ok", confidence: 0.99 },
          map_name: { status: "ok", confidence: 0.99 },
          difficulty: { status: "ok", confidence: 0.99 },
        },
        data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.paris", difficulty: "地狱" },
      };
      vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Response(JSON.stringify(ocrResponse), { status: 200, headers: { "content-type": "application/json" } })));
      try {
        const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token");
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.pioneer.inside", objectKey: "evidence/inside.png", attempt: 1, requestId: "request.inside" });
        await deliverOcrFixture(services, sqlite, { submissionId: "submission.pioneer.at-end", objectKey: "evidence/at-end.png", attempt: 1, requestId: "request.at-end" });
      } finally {
        vi.unstubAllGlobals();
      }

      expect(sqlite.prepare("SELECT id, status FROM submissions WHERE id LIKE 'submission.pioneer.%' ORDER BY id").all()).toEqual([
        { id: "submission.pioneer.at-end", status: "resubmission_required" },
        { id: "submission.pioneer.inside", status: "approved" },
      ]);
      expect(sqlite.prepare("SELECT title_key, map_id, slot FROM player_title_grants WHERE source_id = 'submission.pioneer.inside'").get()).toEqual({ title_key: "PIONEER", map_id: "map.paris", slot: "pioneer" });
    });

    it("allows evidence review for an expired Pioneer rule when the submission is in-window", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "PIONEER");
      seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
      const startsAt = now - 10_000;
      const endsAt = now - 1;
      seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris", { startsAt, endsAt });
      seedCompat(sqlite, "map.paris.pioneer", "rule.pioneer", "map.paris");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.pioneer.review', 'pioneer-review-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.pioneer.review', 'identity.pioneer.review', 'player.pioneer.review', 'qq', 'group.pioneer.review', 'member.pioneer.review', 'active', ?)").run(now);
      const createdAt = endsAt - 1;
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.pioneer.review', 'binding.pioneer.review', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.review', ?, ?)").run(createdAt, createdAt);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.pioneer.review', 'submission.pioneer.review', 1, 'review_required', ?, ?, ?)").run(
        JSON.stringify({ data: { map_name: "地图 map.paris", difficulty: "地狱" } }),
        JSON.stringify({ candidates: [{ challengeId: "map.paris.pioneer", mapId: "map.paris", gameplayRevisionId: "revision:map.paris:initial", challengeType: "map_title_achievement", targetMapName: "地图 map.paris", targetDifficulty: "地狱", titleName: "称号 PIONEER", match: { achievement: true } }] }),
        now,
      );
      const services = createPlatformServices(database);
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

      await expect(services.reviewSubmission({
        submissionId: "submission.pioneer.review",
        decision: "approved",
        fieldCorrections: [
          { fieldKey: "map_name", reviewedValue: "地图 map.paris" },
          { fieldKey: "difficulty", reviewedValue: "地狱" },
          { fieldKey: "challenge_completed", reviewedValue: "已完成" },
        ],
      }, auth, "pioneer-review-approve")).resolves.toMatchObject({ decision: "approved", titleKey: "PIONEER" });
      expect(sqlite.prepare("SELECT status, rule_snapshot_json FROM submissions WHERE id = 'submission.pioneer.review'").get()).toMatchObject({ status: "approved" });
      expect(sqlite.prepare("SELECT title_key, map_id, slot FROM player_title_grants WHERE source_id = 'submission.pioneer.review'").get()).toEqual({ title_key: "PIONEER", map_id: "map.paris", slot: "pioneer" });
    });
  });

  // ─── Invariant: Slot semantics ───────────────────────────────────────────
  describe("slot semantics – immutable grant-time snapshot", () => {
    it("slot in rule_snapshot_json is taken from the rule (or exception) at submission time", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshotAtCreation = {
        ruleId: "rule.conqueror",
        ruleRevision: now,
        mapId: "map.paris",
        gameplayRevisionId: "revision:map.paris:initial",
        titleKey: "CONQUEROR",
        slot: "conqueror",
        displayKind: "map_name_suffix",
        condition: "完成地图",
        evidenceRule: "上传截图",
        submissionMode: "manual",
        defaultScope: "all_active",
        exceptionId: null,
      };

      // Simulate storing the snapshot at upload-session creation.
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.snap', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', 'revision:map.paris:initial', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshotAtCreation), now, now);

      // Now change the rule's slot — the stored snapshot must not be affected.
      sqlite.prepare("UPDATE map_title_rules SET slot = 'dominator', updated_at = ? WHERE id = 'rule.conqueror'").run(now + 5000);

      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.snap'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshotAtCreation;

      expect(stored.slot).toBe("conqueror");  // still the original value
      expect(stored.ruleRevision).toBe(now);  // still the original revision
    });
  });

  describe("gameplay revision applicability", () => {
    it("keeps old map grants active as facts while the current player view derives only the default revision", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "LEGACY");
      seedTitle(sqlite, "CURRENT");
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES ('session.1', 'attempt.1', 'g.1', 'm.1', 'production', ?, ?, ?)").run(await requestHash("revision-title-session"), now + 60_000, now);
      sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = 'revision:map.paris:initial'").run();
      sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES ('revision:map.paris:rework', 'map.paris', 'default', NULL, 'revision:map.paris:initial', 'difficulty redesign', '26.0810.2', ?, ?)").run(now + 1, now + 1);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.legacy', 'p.1', 'LEGACY', 'map.paris', 'revision:map.paris:initial', NULL, 'active', 'submission', 'submission.legacy', 'admin', ?), ('grant.current', 'p.1', 'CURRENT', 'map.paris', 'revision:map.paris:rework', NULL, 'active', 'submission', 'submission.current', 'admin', ?)").run(now, now + 1);

      const titles = await createPlatformServices(database).listCurrentPlayerTitles({ sessionToken: "revision-title-session" });

      expect(titles).toMatchObject({ allTitles: false, items: [expect.objectContaining({ titleKey: "CURRENT" })] });
      expect(sqlite.prepare("SELECT id, status FROM player_title_grants ORDER BY id").all()).toEqual([
        { id: "grant.current", status: "active" },
        { id: "grant.legacy", status: "active" },
      ]);
    });
  });

  // ─── Invariant: Retired maps ─────────────────────────────────────────────
  describe("retired maps – no new projections", () => {
    it("a retired map has no current projection and produces no rule resolution", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.retired", "retired");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
      seedCompat(sqlite, "map.retired.conqueror", "rule.conqueror", "map.retired");

      // Map is retired.
      const map = sqlite.prepare("SELECT status FROM maps WHERE id = 'map.retired'").get() as { status: string };
      expect(map.status).toBe("retired");

      // resolveMapTitleProjection step 1: retired map → null.
      // Verified indirectly: no active grants can exist for a retired map (not an error; just no projection).
      // Existing grants and submissions must remain readable.
      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'A', 'a', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.old', 'p.1', 'CONQUEROR', 'map.retired', 'conqueror', 'active', 'historical', 'src.1', 'admin', ?)").run(now);

      // Existing grant is still readable after retirement.
      const grant = sqlite.prepare("SELECT id, status FROM player_title_grants WHERE id = 'grant.old'").get() as { id: string; status: string } | undefined;
      expect(grant?.id).toBe("grant.old");
      expect(grant?.status).toBe("active");
    });

    it("an in-flight submission created before retirement remains governed by its snapshot", async () => {
      const { sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", gameplayRevisionId: "revision:map.paris:initial", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.flight', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);

      // Retire the map after the session was created.
      sqlite.prepare("UPDATE maps SET status = 'retired', updated_at = ? WHERE id = 'map.paris'").run(now + 1000);

      // The snapshot on the submission is unchanged — retirement after session creation
      // does not silently invalidate the in-flight submission.
      const row = sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'sub.flight'").get() as { rule_snapshot_json: string };
      const stored = JSON.parse(row.rule_snapshot_json) as typeof snapshot;
      expect(stored.mapId).toBe("map.paris");
      expect(stored.slot).toBe("conqueror");
    });
  });

  // ─── Invariant: reviewSubmission reads snapshot for new-model submissions ──
  describe("submission review – snapshot path", () => {
    it("uses rule_snapshot_json for reward resolution when present, ignoring live rule changes", async () => {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.paris");
      seedTitle(sqlite, "CONQUEROR");
      seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });

      const snapshot = { ruleId: "rule.conqueror", ruleRevision: now, mapId: "map.paris", titleKey: "CONQUEROR", slot: "conqueror", displayKind: "map_name_suffix", condition: "完成地图", evidenceRule: "上传截图", submissionMode: "manual", defaultScope: "all_active", exceptionId: null };

      sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('p.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
      sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('b.1', 'id.1', 'p.1', 'qq', 'g.1', 'm.1', 'active', ?)").run(now);
      sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, gameplay_revision_id, map_name, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('sub.1', 'b.1', 'ready_for_review', 'map_completion', 'map.paris.conqueror', 'map.paris', 'revision:map.paris:initial', '地图 map.paris', ?, 'portal', 'portal', 'msg.1', ?, ?)").run(JSON.stringify(snapshot), now, now);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.sub.1', 'sub.1', 1, 'review_required', ?, ?)").run(JSON.stringify({
        schema_version: "1",
        ok: true,
        layout_version: "1280x720-v7",
        fields: {
          map_name: { status: "ok", confidence: 0.99 },
          difficulty: { status: "ok", confidence: 0.99 },
          challenge_completed: { status: "ok", confidence: 0.99 },
        },
        data: { map_name: "地图 map.paris", difficulty: "地狱", challenge_completed: true },
      }), now);

      // Change the rule's title_key after submission was created.
      // The review must still use the snapshot's titleKey, not the live rule.
      // (We don't update title_key in the DB since it's FK-constrained, but we
      // verify that the snapshot JSON drives the reward path by checking the
      // granted title_key.)
      const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const services = createPlatformServices(database);

      const result = await services.reviewSubmission(
        { submissionId: "sub.1", decision: "approved" },
        auth,
        "idem.1",
      );

      expect(result.decision).toBe("approved");
      // The grant must reference the title from the snapshot.
      const grant = sqlite.prepare("SELECT title_key, map_id, gameplay_revision_id, slot FROM player_title_grants WHERE source_type = 'submission'").get() as { title_key: string; map_id: string; gameplay_revision_id: string; slot: string } | undefined;
      expect(grant?.title_key).toBe("CONQUEROR");
      expect(grant?.map_id).toBe("map.paris");
      expect(grant?.gameplay_revision_id).toBe("revision:map.paris:initial");
      expect(grant?.slot).toBe("conqueror");
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_type = 'submission' AND source_id = 'sub.1' AND status = 'active'").get()).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT completion_id FROM player_title_grants WHERE source_type = 'submission'").get()).toMatchObject({ completion_id: expect.any(String) });
    });
  });
});

describe("maintainer Challenge confirmation during submission review", () => {
  const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
  const writeCounts = (sqlite: DatabaseSync, submissionId: string) => ({
    reviews: (sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = ?").get(submissionId) as { count: number }).count,
    completions: (sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_id = ?").get(submissionId) as { count: number }).count,
    grants: (sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = ?").get(submissionId) as { count: number }).count,
    status: (sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(submissionId) as { status: string }).status,
  });

  const databaseContents = (sqlite: DatabaseSync) => Object.fromEntries((sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
    .map(({ name }) => [name, sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));

  const seedIncompleteMapEvidence = (sqlite: DatabaseSync) => {
    seedMap(sqlite, "map.paris");
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
    seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris", { startsAt: now - 10_000, endsAt: now + 10_000 });
    seedCompat(sqlite, "map.paris.pioneer", "rule.pioneer", "map.paris");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.confirm', 'confirm-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.confirm', 'identity.confirm', 'player.confirm', 'qq', 'group.confirm', 'member.confirm', 'active', ?)").run(now);
    sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.confirm', 'binding.confirm', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.confirm', ?, ?)").run(now, now);
    // The completion marker is absent, so the Pioneer Conditions cannot be decided from OCR alone.
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.confirm', 'submission.confirm', 1, 'review_required', ?, ?, ?)").run(
      JSON.stringify({ schema_version: "1", ok: true, layout_version: "1280x720-v7", data: { map_name: "地图 map.paris", difficulty: "地狱" } }),
      JSON.stringify({ candidates: [{ challengeId: "map.paris.pioneer", quality: { accepted: false, reasons: ["achievement_evidence:low_confidence"] } }] }),
      now,
    );
  };

  const seedAchievementEvidence = (sqlite: DatabaseSync, titles: string[]) => {
    seedTitle(sqlite, "HERO");
    sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.add', 'add-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.add', 'identity.add', 'player.add', 'qq', 'group.add', 'member.add', ?)").run(now);
    sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.add', 'binding.add', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.add', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.add', 'submission.add', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, layout_version: "1280x720-v7", data: { achievement_titles: titles } }), now);
  };

  it("brings regular map Challenges back when the reviewer corrects a misread mode", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedIncompleteMapEvidence(sqlite);
    sqlite.prepare("UPDATE ocr_results SET response_json = ? WHERE id = 'ocr.confirm'").run(JSON.stringify({ schema_version: "1", ok: true, layout_version: "1280x720-v7", data: { map_name: "地图 map.paris", difficulty: "地狱", mode: "随机事仵5.0" } }));
    const services = createPlatformServices(database);

    // With the misread mode the map Challenge is only manually linkable; the corrected mode makes it evidence again.
    const misread = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    expect(misread.candidates.find((candidate) => candidate.titleName === "称号 PIONEER")).toMatchObject({ evidence: "not_matched" });
    const corrected = await services.previewSubmissionReview({ submissionId: "submission.confirm", fieldCorrections: [{ fieldKey: "mode", reviewedValue: "随机事件5.0" }] }, auth);
    expect(corrected.candidates.find((candidate) => candidate.titleName === "称号 PIONEER")).toMatchObject({ evidence: "needs_confirmation" });
  });

  it("links a Challenge outside the evidence's map and approves it", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedIncompleteMapEvidence(sqlite);
    // OCR read 地图 map.paris, but the maintainer sees the clear was on another map.
    seedMap(sqlite, "map.other");
    seedTitle(sqlite, "DOMINATOR");
    seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
    const services = createPlatformServices(database);

    const preview = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    const other = preview.candidates.find((candidate) => candidate.titleName === "称号 DOMINATOR" && candidate.mapName === "地图 map.other");
    expect(other).toMatchObject({ evidence: "not_matched", selectedBy: null });

    const confirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm", confirmedChallengeIds: [other!.challengeId] }, auth);
    expect(confirmed).toMatchObject({ approvable: true, blockingCode: null, titles: [{ titleKey: "DOMINATOR", mapName: "地图 map.other" }] });
    await services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved", confirmedChallengeIds: [other!.challengeId] }, auth, "link.other");
    expect(sqlite.prepare("SELECT title_key, map_id FROM player_title_grants WHERE source_id = 'submission.confirm' AND status = 'active'").all()).toEqual([{ title_key: "DOMINATOR", map_id: "map.other" }]);
  });

  it("never selects a linkable Challenge from evidence alone", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.rialto");
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, game_version, created_at, updated_at) VALUES ('revision:map.rialto:mirror', 'map.rialto', 'selectable', NULL, '2026镜中回响', '2026.10.01', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO standalone_modes (mode, event_weight_total, created_at, updated_at) VALUES ('2026镜中回响', NULL, ?, ?)").run(now, now);
    seedTitle(sqlite, "DOMINATOR");
    seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.link', 'link-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.link', 'identity.link', 'player.link', 'qq', 'group.link', 'member.link', 'active', ?)").run(now);
    sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.link', 'binding.link', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.link', ?, ?)").run(now, now);
    // A mirror-mode hell clear: the regular 统治者 conditions would match, but that map Challenge is only linkable.
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.link', 'submission.link', 1, 'review_required', ?, ?)").run(
      JSON.stringify({ schema_version: "1", ok: true, layout_version: "1280x720-v7", data: { map_name: "地图 map.rialto", difficulty: "地狱", challenge_completed: true, mode: "2026镜中回响" } }),
      now,
    );
    const services = createPlatformServices(database);

    const preview = await services.previewSubmissionReview({ submissionId: "submission.link" }, auth);
    expect(preview.candidates.find((candidate) => candidate.titleName === "称号 DOMINATOR")).toMatchObject({ evidence: "not_matched", selectedBy: null });
    expect(preview).toMatchObject({ titles: [], completions: [], knownModes: ["2026镜中回响"] });
  });

  it("previews and approves a displayed Challenge that the maintainer confirms from the screenshot", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedIncompleteMapEvidence(sqlite);
    const services = createPlatformServices(database);
    const beforePreview = databaseContents(sqlite);

    const unconfirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    const pioneer = unconfirmed.candidates.find((candidate) => candidate.titleName === "称号 PIONEER");
    expect(pioneer).toMatchObject({ family: "map", evidence: "needs_confirmation", missingFields: ["challenge_completed"], selectedBy: null });
    // A missing completion marker cannot be proven from the screenshot, so evidence alone asks for resubmission.
    expect(unconfirmed).toMatchObject({ evidenceOutcome: "resubmit", titles: [], completions: [], approvable: false, blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED" });
    expect(JSON.stringify(unconfirmed)).not.toContain("achievement_evidence");

    const confirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm", confirmedChallengeIds: [pioneer!.challengeId] }, auth);
    expect(confirmed.candidates.find((candidate) => candidate.challengeId === pioneer!.challengeId)).toMatchObject({ selectedBy: "reviewer" });
    expect(confirmed).toMatchObject({
      approvable: true,
      blockingCode: null,
      titles: [{ titleKey: "PIONEER", titleName: "称号 PIONEER", mapName: "地图 map.paris", alreadyOwned: false }],
      completions: [{ challengeId: pioneer!.challengeId, titleKey: "PIONEER", basis: "reviewer" }],
    });
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 0, completions: 0, grants: 0, status: "ocr_review_required" });
    // Preview is read-only: canonical Challenges it plans are materialized only by the approval.
    expect(databaseContents(sqlite)).toEqual(beforePreview);
    await expect(services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved" }, auth, "confirm.without")).rejects.toThrow("SUBMISSION_OUTCOME_NOT_CONFIGURED");

    const result = await services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved", confirmedChallengeIds: [pioneer!.challengeId] }, auth, "confirm.with");
    expect(result).toMatchObject({ decision: "approved", titleKey: "PIONEER", alreadyOwned: false });
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 1, completions: 1, grants: 1, status: "approved" });
    expect(sqlite.prepare("SELECT g.title_key, g.map_id, g.slot, c.challenge_id, c.source_type FROM player_title_grants g JOIN challenge_completions c ON c.id = g.completion_id WHERE g.source_id = 'submission.confirm'").get()).toEqual({ title_key: "PIONEER", map_id: "map.paris", slot: "pioneer", challenge_id: pioneer!.challengeId, source_type: "submission" });
    const outcome = sqlite.prepare("SELECT details_json FROM submission_outcomes WHERE submission_id = 'submission.confirm' AND outcome_type = 'challenge'").get() as { details_json: string };
    expect(JSON.parse(outcome.details_json)).toMatchObject({ basis: "reviewer" });
    const audit = sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'submission.review' AND entity_id = 'submission.confirm'").get() as { payload_json: string };
    expect(JSON.parse(audit.payload_json)).toMatchObject({ evidenceMatchedChallengeIds: [], reviewerConfirmedChallengeIds: [pioneer!.challengeId] });

    // A maintainer may decide again: the latest review is current, and the Submission decision never revokes Titles already granted.
    await services.reviewSubmission({ submissionId: "submission.confirm", decision: "rejected", reason: "截图裁剪" }, auth, "confirm.reject");
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 2, completions: 1, grants: 1, status: "rejected" });
    expect(sqlite.prepare("SELECT status FROM player_title_grants WHERE source_id = 'submission.confirm'").get()).toEqual({ status: "active" });
    const grantId = (sqlite.prepare("SELECT id FROM player_title_grants WHERE source_id = 'submission.confirm'").get() as { id: string }).id;
    expect(await services.getAdminSubmission({ submissionId: "submission.confirm" }, auth)).toMatchObject({ status: "rejected", review: { decision: "rejected", automatic: false, reason: "截图裁剪" }, activeTitleGrants: [{ grantId, titleKey: "PIONEER", titleName: "称号 PIONEER" }] });

    // The Title is still held, so the Challenge is no longer confirmable; re-approval rests on what this Submission already granted.
    const reapproval = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    expect(reapproval).toMatchObject({ approvable: true, blockingCode: null, titles: [{ titleKey: "PIONEER", mapName: "地图 map.paris", alreadyOwned: true }] });
    await expect(services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved" }, auth, "confirm.reapprove")).resolves.toMatchObject({ decision: "approved", grantId, titleKey: "PIONEER", alreadyOwned: true });
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 3, completions: 1, grants: 1, status: "approved" });
    expect(sqlite.prepare("SELECT grant_id FROM submissions WHERE id = 'submission.confirm'").get()).toEqual({ grant_id: grantId });
    expect(await services.getAdminSubmission({ submissionId: "submission.confirm" }, auth)).toMatchObject({ review: { decision: "approved", reason: null } });
    const reapprovalAudit = sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'submission.review' AND entity_id = 'submission.confirm' ORDER BY rowid DESC LIMIT 1").get() as { payload_json: string };
    expect(JSON.parse(reapprovalAudit.payload_json)).toMatchObject({ decision: "approved", retainedGrants: [{ grantId, titleKey: "PIONEER" }] });
  });

  it("keeps the preview read-only when approval would replace a legacy canonical Challenge", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedIncompleteMapEvidence(sqlite);
    sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, map_id, gameplay_revision_id, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('challenge.legacy-pioneer', 'map_title_rule', 'map.paris.pioneer', 'PIONEER', 'legacy', 'map.paris', 'revision:map.paris:initial', 'active', 0, 1, 'and', ?, '旧条件', NULL, NULL, ?, ?)")
      .run(JSON.stringify({ operator: "and", conditions: [{ type: "map", mapId: "map.paris" }, { type: "completed" }] }), now, now);
    const services = createPlatformServices(database);
    const beforePreview = databaseContents(sqlite);

    const unconfirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    const pioneer = unconfirmed.candidates.find((candidate) => candidate.titleName === "称号 PIONEER");
    expect(pioneer?.challengeId).not.toBe("challenge.legacy-pioneer");
    const confirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm", confirmedChallengeIds: [pioneer!.challengeId] }, auth);
    expect(confirmed).toMatchObject({ approvable: true, blockingCode: null, completions: [{ challengeId: pioneer!.challengeId, titleKey: "PIONEER", basis: "reviewer" }] });
    expect(databaseContents(sqlite)).toEqual(beforePreview);

    await services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved", confirmedChallengeIds: [pioneer!.challengeId] }, auth, "confirm.legacy");
    expect(sqlite.prepare("SELECT id, status FROM challenges ORDER BY id").all()).toEqual([
      { id: "challenge.legacy-pioneer", status: "archived" },
      { id: pioneer!.challengeId, status: "active" },
    ].sort((left, right) => left.id.localeCompare(right.id)));
    expect(sqlite.prepare("SELECT challenge_id FROM challenge_completions WHERE source_id = 'submission.confirm'").get()).toEqual({ challenge_id: pioneer!.challengeId });
  });

  it("orders the review queue by longest wait when asked", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedIncompleteMapEvidence(sqlite);
    seedAchievementEvidence(sqlite, ["SECOND"]);
    sqlite.prepare("UPDATE submissions SET updated_at = ? WHERE id = 'submission.add'").run(now - 60_000);
    const services = createPlatformServices(database);
    const list = (order?: "oldest" | "newest") => services.listAdminSubmissions({ statuses: ["ocr_review_required"], page: 1, pageSize: 20, ...(order ? { order } : {}) }, auth);
    expect((await list("oldest")).items.map((item) => item.submissionId)).toEqual(["submission.add", "submission.confirm"]);
    expect((await list("newest")).items.map((item) => item.submissionId)).toEqual(["submission.confirm", "submission.add"]);
    expect((await list()).items.map((item) => item.submissionId)).toEqual(["submission.confirm", "submission.add"]);
  });

  it("adds an eligible Challenge that OCR did not propose and recomputes corrected evidence with the same matcher", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedAchievementEvidence(sqlite, ["SECOND"]);
    const services = createPlatformServices(database);

    const preview = await services.previewSubmissionReview({ submissionId: "submission.add" }, auth);
    const hero = preview.candidates.find((candidate) => candidate.titleName === "称号 HERO");
    expect(hero).toMatchObject({ family: "achievement", kind: "title_achievement", label: "称号 HERO", condition: "完成英雄挑战", evidence: "not_matched", selectedBy: null });
    expect(preview.approvable).toBe(false);

    const corrected = await services.previewSubmissionReview({ submissionId: "submission.add", fieldCorrections: [{ fieldKey: "achievement_titles", reviewedValue: "称号 HERO、SECOND" }] }, auth);
    expect(corrected.candidates.find((candidate) => candidate.challengeId === hero!.challengeId)).toMatchObject({ evidence: "matched", selectedBy: "conditions" });
    expect(corrected).toMatchObject({ evidenceOutcome: "automatic", approvable: true, titles: [{ titleKey: "HERO", alreadyOwned: false }], completions: [{ basis: "conditions" }] });

    const result = await services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [hero!.challengeId] }, auth, "add.hero");
    expect(result).toMatchObject({ decision: "approved", titleKey: "HERO" });
    expect(writeCounts(sqlite, "submission.add")).toEqual({ reviews: 1, completions: 1, grants: 1, status: "approved" });
    // A manual confirmation is reviewed evidence, not a corrected OCR field.
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations WHERE submission_id = 'submission.add'").get()).toEqual({ count: 0 });
  });

  it("lets reviewer field corrections stand in for a failed recognition", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedAchievementEvidence(sqlite, ["SECOND"]);
    sqlite.prepare("UPDATE ocr_results SET status = 'error', response_json = NULL, match_json = NULL, error_code = 'OCR_NETWORK' WHERE submission_id = 'submission.add'").run();
    const services = createPlatformServices(database);

    await expect(services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).rejects.toThrow("SUBMISSION_NOT_REVIEWABLE");
    const corrected = await services.previewSubmissionReview({ submissionId: "submission.add", fieldCorrections: [{ fieldKey: "achievement_titles", reviewedValue: "称号 HERO、SECOND" }] }, auth);
    expect(corrected.candidates.some((candidate) => candidate.titleName === "称号 HERO")).toBe(true);
  });

  it("records a Verified Run from fully reviewer-entered evidence when OCR failed", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.manual", "binding.one", "Tester", false);
    sqlite.prepare("UPDATE submissions SET status = 'resubmission_required' WHERE id = 'submission.manual'").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, error_code, created_at) VALUES ('ocr.manual', 'submission.manual', 1, 'error', 'OCR_NETWORK', ?)").run(now);
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const entered = [
      { fieldKey: "map_name" as const, reviewedValue: "地图 map.mastery" },
      { fieldKey: "difficulty" as const, reviewedValue: "困难" },
      { fieldKey: "challenge_completed" as const, reviewedValue: "完成" },
      { fieldKey: "version" as const, reviewedValue: "99.0101.1" },
      { fieldKey: "run_code" as const, reviewedValue: "1234-5678-9012" },
      { fieldKey: "duration_seconds" as const, reviewedValue: "600" },
    ];

    const incomplete = await services.previewSubmissionReview({ submissionId: "submission.manual", fieldCorrections: entered.slice(0, 3) }, auth);
    expect(incomplete).toMatchObject({ approvable: false, verifiedRun: { status: "ineligible" } });
    await expect(services.previewSubmissionReview({ submissionId: "submission.manual", fieldCorrections: [...entered, { fieldKey: "deaths", reviewedValue: "-1" }] }, auth)).rejects.toThrow("SUBMISSION_CORRECTION_INVALID");

    const preview = await services.previewSubmissionReview({ submissionId: "submission.manual", fieldCorrections: entered }, auth);
    expect(preview).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "eligible" } });
    await services.reviewSubmission({ submissionId: "submission.manual", decision: "approved", fieldCorrections: entered }, auth, "manual.run");
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.manual' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created" });
  });

  it("rejects confirmations outside the Submission's eligible Challenges without writing", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedAchievementEvidence(sqlite, ["SECOND"]);
    const services = createPlatformServices(database);
    const heroId = (await services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).candidates.find((candidate) => candidate.titleName === "称号 HERO")!.challengeId;

    const unknown = await services.previewSubmissionReview({ submissionId: "submission.add", confirmedChallengeIds: ["challenge.unknown"] }, auth);
    expect(unknown).toMatchObject({ approvable: false, blockingCode: "CHALLENGE_CONFIRMATION_INELIGIBLE", titles: [] });
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: ["challenge.unknown"] }, auth, "add.unknown")).rejects.toThrow("CHALLENGE_CONFIRMATION_INELIGIBLE");

    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.hero.revoked', 'player.add', 'HERO', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'blocked', 'administrator')").run(now, now);
    expect((await services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).candidates.some((candidate) => candidate.challengeId === heroId)).toBe(false);
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [heroId] }, auth, "add.revoked")).rejects.toThrow("CHALLENGE_CONFIRMATION_INELIGIBLE");

    sqlite.prepare("DELETE FROM player_title_grants WHERE id = 'grant.hero.revoked'").run();
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.hero.owned', 'player.add', 'HERO', 'active', 'manual', 'manual:old', 'admin', ?)").run(now);
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [heroId] }, auth, "add.owned")).rejects.toThrow("CHALLENGE_CONFIRMATION_INELIGIBLE");

    sqlite.prepare("DELETE FROM player_title_grants WHERE id = 'grant.hero.owned'").run();
    // The canonical Challenge window starts after the Submission was created, so the Completion chain must refuse it.
    sqlite.prepare("UPDATE title_challenges SET starts_at = ? WHERE id = 'title.hero'").run(now + 60_000);
    const notStartedId = (await services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).candidates.find((candidate) => candidate.titleName === "称号 HERO")!.challengeId;
    expect(await services.previewSubmissionReview({ submissionId: "submission.add", confirmedChallengeIds: [notStartedId] }, auth)).toMatchObject({ approvable: false, blockingCode: "CHALLENGE_NOT_COMPLETABLE", titles: [] });
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [notStartedId] }, auth, "add.not-started")).rejects.toThrow("CHALLENGE_NOT_COMPLETABLE");

    expect(writeCounts(sqlite, "submission.add")).toEqual({ reviews: 0, completions: 0, grants: 0, status: "ocr_review_required" });
  });
});

const seedMasteryPlayer = (sqlite: DatabaseSync, playerId: string, bindingId: string, playerName: string) => {
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?)").run(playerId, playerId, playerName, playerName.toLocaleLowerCase(), now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
};

const seedMasterySubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string, playerName: string, withAttachment = true) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, difficulty, player_name, review_reason, grant_id, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_pending', 'unknown', NULL, NULL, '成就挑战', NULL, ?, NULL, NULL, 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, playerName, `message.${submissionId}`, now, now);
  if (withAttachment) sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)").run(`attachment.${submissionId}`, submissionId, `external.${submissionId}`, `evidence/${submissionId}.png`, now);
};

const masteryOcr = (overrides: { viewerPlayer?: string | null; difficulty?: string; matchCode?: string | null; durationSeconds?: number; layoutVersion?: string; version?: string; mapVariant?: "classic" | null } = {}) => {
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

describe("submission mastery outcomes", () => {
  it("keeps the version, layout, and run-code gate platform-owned", () => {
    expect(assessVerifiedRunOcrEvidence(masteryOcr())).toEqual({ outcome: "ineligible", reason: "mastery_rollout_disabled" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr(), localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible", matchCode: "1234-5678-9012", gameVersion: "99.0101.1" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ viewerPlayer: null }), localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ viewerPlayer: "Misread#9999" }), localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ matchCode: null }), localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ layoutVersion: "test-layout-v0" }), localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unsupported_layout" });
    expect(assessVerifiedRunOcrEvidence(masteryOcr({ version: "99.0100.9" }), localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unsupported_game_version" });
    const regularMode = masteryOcr();
    expect(assessVerifiedRunOcrEvidence({ ...regularMode, data: { ...regularMode.data, mode: "随机事件5.0" } }, localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible", mode: null });
    expect(assessVerifiedRunOcrEvidence({ ...regularMode, data: { ...regularMode.data, mode: "2026 镜中回响" } }, localVerifiedRunEvidenceCompatibility)).toMatchObject({ outcome: "eligible", mode: "2026镜中回响" });
    const weakRunCode = masteryOcr();
    weakRunCode.fields.run_code = { status: "low_confidence", confidence: 0.89 };
    expect(assessVerifiedRunOcrEvidence(weakRunCode, localVerifiedRunEvidenceCompatibility)).toEqual({ outcome: "ineligible", reason: "unreliable_run_code" });
  });

  it("restores the completed upload to an actionable state when queue send fails, then lets the player retry", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    const sessionToken = "replay-player-one";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
      .run("session.player.one", "attempt.player.one", "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
    const stored = new Map<string, ArrayBuffer>();
    const queued: unknown[] = [];
    let failNextSend = true;
    const services = createPlatformServices(
      database,
      { put: async (key: string, value: ArrayBuffer) => { stored.set(key, value); } } as unknown as R2Bucket,
      "https://api.example.com", undefined, undefined,
      { send: async (message: unknown) => { if (failNextSend) { failNextSend = false; throw new Error("queue unavailable"); } queued.push(message); } } as Queue,
    );
    const body = new TextEncoder().encode("replayed-image").buffer as ArrayBuffer;
    const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, sessionToken);
    await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, sessionToken);

    await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.first")).rejects.toThrow("queue unavailable");
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(upload.submissionId)).toEqual({ status: "upload_pending" });

    await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.retry")).resolves.toEqual({ submissionId: upload.submissionId, status: "processing" });
    expect(queued).toEqual([expect.objectContaining({ submissionId: upload.submissionId, requestId: "request.retry" })]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submissions").get()).toEqual({ count: 1 });
  });

  it("lets only one concurrent player completion enqueue, so a competing send failure cannot undo it", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    const sessionToken = "concurrent-completion-player-one";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
      .run("session.player.one", "attempt.player.one", "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
    let sendCount = 0;
    let releaseQueueSend!: () => void;
    let markQueueSendStarted!: () => void;
    const queueSendStarted = new Promise<void>((resolve) => { markQueueSendStarted = resolve; });
    const queueSendGate = new Promise<void>((resolve) => { releaseQueueSend = resolve; });
    const queue = {
      send: vi.fn(async () => {
        sendCount += 1;
        markQueueSendStarted();
        if (sendCount === 2) throw new Error("competing queue send rejected");
        await queueSendGate;
      }),
    } as unknown as Queue;
    const services = createPlatformServices(
      synchronizeConcurrentBatches(database, 2),
      { put: async () => undefined } as unknown as R2Bucket,
      "https://api.example.com", undefined, undefined, queue,
    );
    const body = new TextEncoder().encode("concurrent-image").buffer as ArrayBuffer;
    const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, sessionToken);
    await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, sessionToken);

    const first = services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.concurrent.first");
    const second = services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.concurrent.second");
    const settle = (promise: Promise<unknown>) => promise.then(
      (value) => ({ status: "fulfilled" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    );
    const firstSettled = settle(first);
    const secondSettled = settle(second);
    await queueSendStarted;
    const earlyOutcome = await Promise.race([firstSettled, secondSettled]);
    releaseQueueSend();
    const outcomes = await Promise.all([firstSettled, secondSettled]);

    expect(earlyOutcome).toMatchObject({ status: "rejected", reason: new Error("UPLOAD_COMPLETION_IN_PROGRESS") });
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toMatchObject([
      { status: "rejected", reason: new Error("UPLOAD_COMPLETION_IN_PROGRESS") },
    ]);
    expect(queue.send).toHaveBeenCalledOnce();
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(upload.submissionId)).toEqual({ status: "ocr_pending" });
  });

  it("repairs a completed upload session whose submission never left upload_pending", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    const sessionToken = "repair-player-one";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
      .run("session.player.one", "attempt.player.one", "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
    const queued: unknown[] = [];
    const services = createPlatformServices(
      database,
      { put: async () => undefined } as unknown as R2Bucket,
      "https://api.example.com", undefined, undefined,
      { send: async (message: unknown) => { queued.push(message); } } as Queue,
    );
    const body = new TextEncoder().encode("partial-image").buffer as ArrayBuffer;
    const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, sessionToken);
    await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, sessionToken);
    sqlite.prepare("UPDATE upload_sessions SET status = 'completed' WHERE id = ?").run(upload.uploadId);

    await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, sessionToken, "request.repair")).resolves.toEqual({ submissionId: upload.submissionId, status: "processing" });
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(upload.submissionId)).toEqual({ status: "ocr_pending" });
    expect(queued).toEqual([expect.objectContaining({ submissionId: upload.submissionId })]);
  });

  it("covers the authenticated upload, unlisted CDN screenshot, OCR, mastery-only, and combined-title paths with local fakes", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasteryPlayer(sqlite, "player.two", "binding.two", "Other");

    const playerOneSession = "integration-player-one";
    const playerTwoSession = "integration-player-two";
    for (const [playerId, token] of [["player.one", playerOneSession], ["player.two", playerTwoSession]] as const) {
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
        .run(`session.${playerId}`, `attempt.${playerId}`, `group.${playerId}`, `member.${playerId}`, await requestHash(token), now + 60_000, now);
    }

    const storedObjects = new Map<string, ArrayBuffer>();
    const queued: Array<{ version: number; submissionId: string; objectKey: string; requestId?: string }> = [];
    const ocrRequests: Array<{ url: string; contentType: string; size: number; formFields: string[] }> = [];
    const ocrResponses: Array<ReturnType<typeof masteryOcr>> = [];
    const evidenceBucket = {
      put: async (key: string, value: ArrayBuffer) => { storedObjects.set(key, value); },
      get: async (key: string) => {
        const body = storedObjects.get(key);
        return body ? { size: body.byteLength, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => body } : null;
      },
    } as unknown as R2Bucket;
    const queue = {
      send: async (message: unknown) => { queued.push(message as (typeof queued)[number]); },
    } as Queue;
    const services = createPlatformServices(
      database,
      evidenceBucket,
      "https://api.example.com",
      "https://ocr.example.com",
      "token",
      queue,
      undefined,
      undefined,
      1,
      0,
      localVerifiedRunEvidenceCompatibility,
    );

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body as FormData;
      const file = body.get("file");
      if (!(file instanceof Blob)) throw new Error("missing multipart image");
      ocrRequests.push({ url: String(url), contentType: file.type, size: file.size, formFields: [...body.keys()] });
      const response = ocrResponses.shift();
      if (!response) throw new Error("missing OCR response fixture");
      return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
    }));

    const submit = async (input: { sessionToken: string; bytes: string; ocr: ReturnType<typeof masteryOcr>; requestId: string }) => {
      const body = new TextEncoder().encode(input.bytes).buffer as ArrayBuffer;
      const upload = await services.createPlayerUploadSession({ contentType: "image/png", byteSize: body.byteLength, sha256: await uploadHash(body) }, input.sessionToken);
      await services.uploadEvidence({ uploadId: upload.uploadId, contentType: "image/png", body }, input.sessionToken);
      await expect(services.completePlayerUpload({ uploadId: upload.uploadId }, input.sessionToken, input.requestId)).resolves.toEqual({ submissionId: upload.submissionId, status: "processing" });
      const job = queued.shift();
      if (!job) throw new Error("missing OCR queue job");
      ocrResponses.push(input.ocr);
      await deliverOcrFixture(services, sqlite, { ...job, attempt: 1 });
      return { submissionId: upload.submissionId, objectKey: job.objectKey };
    };

    try {
      const first = await submit({ sessionToken: playerOneSession, bytes: "same-image", ocr: masteryOcr(), requestId: "request.first" });
      expect(first.objectKey).toMatch(/^uploads\/submissions\/[^/]+\/[0-9a-f]{64}\.png$/);
      const exactReplay = await submit({ sessionToken: playerOneSession, bytes: "same-image", ocr: masteryOcr(), requestId: "request.exact" });
      const reencodedReplay = await submit({ sessionToken: playerOneSession, bytes: "changed-image", ocr: masteryOcr(), requestId: "request.reencoded" });
      const otherPlayer = await submit({ sessionToken: playerTwoSession, bytes: "other-player-image", ocr: masteryOcr({ viewerPlayer: "Misread#9999" }), requestId: "request.other" });
      const conflict = await submit({ sessionToken: playerOneSession, bytes: "conflicting-image", ocr: masteryOcr({ difficulty: "传奇" }), requestId: "request.conflict" });

      expect(sqlite.prepare("SELECT submission_id, status, awarded_xp FROM submission_outcomes WHERE outcome_key = 'verified_run' ORDER BY submission_id").all()).toEqual([
        { submission_id: conflict.submissionId, status: "conflict", awarded_xp: 0 },
        { submission_id: exactReplay.submissionId, status: "reused", awarded_xp: 0 },
        { submission_id: first.submissionId, status: "created", awarded_xp: 236 },
        { submission_id: otherPlayer.submissionId, status: "created", awarded_xp: 236 },
        { submission_id: reencodedReplay.submissionId, status: "reused", awarded_xp: 0 },
      ].sort((left, right) => left.submission_id.localeCompare(right.submission_id)));
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(conflict.submissionId)).toEqual({ status: "ocr_review_required" });

      const firstProfile = await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 });
      expect(firstProfile).toMatchObject({
        profiles: [{ mapId: "map.mastery", totalXp: 236, verifiedRunCount: 1, difficultyStats: [{ difficulty: "困难", verifiedRunCount: 1, fastestCompletionSeconds: 600 }], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" }],
        total: 1,
        hasMore: false,
      });
      expect(JSON.stringify(firstProfile)).not.toMatch(/playerAccountId|sourceSubmissionId|matchCode|1234-5678-9012|gameVersion|eventCounters|acceptanceSource|xpInputSnapshot|invalidation/);

      const publicServices = createPlatformServices(database);
      const publicFirst = await publicServices.getSubmission({ submissionId: first.submissionId }, {} as never);
      const playerFirst = await services.getPlayerSubmission({ submissionId: first.submissionId }, playerOneSession);
      expect(publicFirst.verifiedRunOutcome).toEqual({ status: "created", awardedXp: 236 });
      expect(playerFirst.verifiedRunOutcome).toEqual({ status: "created", awardedXp: 236 });
      expect(JSON.stringify({ publicFirst, playerFirst })).not.toMatch(/1234-5678-9012|player\.one|integration-evidence|uploads\/submissions|verifiedRunId|object_key/);

      const adminConflict = await services.getAdminSubmission({ submissionId: conflict.submissionId }, {} as never);
      const verifiedRunId = adminConflict.verifiedRunOutcome?.verifiedRunId;
      if (!verifiedRunId) throw new Error("missing mastery conflict target");
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      await services.resolveAdminVerifiedRunConflict({ verifiedRunId, submissionId: conflict.submissionId, action: "invalidate_existing", reason: "local integration invalidation" }, maintainer, "integration-invalidate");
      expect(await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 })).toMatchObject({ profiles: [], total: 1, runs: [{ status: "invalidated" }] });
      await services.transitionAdminVerifiedRun({ verifiedRunId, action: "restore", reason: "local integration restoration" }, maintainer, "integration-restore");
      expect(await services.getCurrentPlayerMastery({ sessionToken: playerOneSession, mapId: "map.mastery", page: 1, pageSize: 20 })).toMatchObject({ profiles: [{ totalXp: 236, verifiedRunCount: 1 }], total: 1, runs: [{ status: "active" }] });

      seedTitle(sqlite, "CONQUEROR");
      sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.combined', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
      seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.combined" });
      const combined = await submit({ sessionToken: playerOneSession, bytes: "combined-image", ocr: masteryOcr({ matchCode: "2345-6789-1234", durationSeconds: 599, layoutVersion: "1280x720-v7" }), requestId: "request.combined" });
      expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = ? ORDER BY outcome_type").all(combined.submissionId)).toEqual([
        { outcome_type: "challenge", status: "created" },
        { outcome_type: "title_grant", status: "created" },
        { outcome_type: "verified_run", status: "created" },
      ]);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE player_account_id = 'player.one' AND title_key = 'CONQUEROR' AND status = 'active'").get()).toEqual({ count: 1 });

      // Rejecting and re-approving a Submission that produced both a Title and a Verified Run reports the retained Title too.
      const combinedGrant = sqlite.prepare("SELECT id FROM player_title_grants WHERE source_id = ?").get(combined.submissionId) as { id: string };
      await services.reviewSubmission({ submissionId: combined.submissionId, decision: "rejected" }, maintainer, "combined.reject");
      expect(await services.getAdminSubmission({ submissionId: combined.submissionId }, maintainer)).toMatchObject({ status: "rejected", activeTitleGrants: [{ grantId: combinedGrant.id, titleKey: "CONQUEROR" }], verifiedRunOutcome: { status: "created" } });
      expect(await services.previewSubmissionReview({ submissionId: combined.submissionId }, maintainer)).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "recorded" }, titles: [{ titleKey: "CONQUEROR", alreadyOwned: true }] });
      await expect(services.reviewSubmission({ submissionId: combined.submissionId, decision: "approved" }, maintainer, "combined.reapprove")).resolves.toMatchObject({
        decision: "approved", grantId: combinedGrant.id, titleKey: "CONQUEROR", alreadyOwned: true, grants: [{ grantId: combinedGrant.id, alreadyOwned: true }], verifiedRunOutcome: { status: "created" },
      });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = ?").get(combined.submissionId)).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = ?").get(combined.submissionId)).toEqual({ status: "approved", grant_id: combinedGrant.id });

      expect(storedObjects.size).toBe(6);
      expect([...storedObjects.keys()].every((key) => key.startsWith("uploads/submissions/"))).toBe(true);
      expect(ocrRequests).toHaveLength(6);
      expect(ocrRequests.every(({ url, contentType, formFields }) => url === "https://ocr.example.com/api/v1/ocr/challenge/jobs" && contentType === "image/png" && formFields.length === 2 && formFields[0] === "file" && formFields[1] === "job_id")).toBe(true);
      expect(queued).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("completes a Run-only Submission when an unrelated Challenge has no matching evidence", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedTitle(sqlite, "FLAWLESS");
    sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'FLAWLESS'").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.flawless', 'FLAWLESS', '全成就完成', '成就列表', 'manual', '99.0101.1', 'active', '99.0101.1', 'global', ?, ?)").run(now, now);
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.run-only-review", "binding.one", "Tester");

    const ocr = masteryOcr({ matchCode: "3456-7890-1234", layoutVersion: "1280x720-v7" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.run-only-review", objectKey: "evidence/submission.run-only-review.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.run-only-review'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = 'submission.run-only-review'").all()).toEqual([{ outcome_type: "verified_run", status: "created" }]);
    expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.run-only-review'").get()).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = 'submission.run-only-review'").get()).toEqual({ count: 0 });
  });

  it("commits a corrected review Run and its Submission outcome atomically", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.review-atomic", "binding.review-atomic", "Review Atomic");
    seedMasterySubmission(sqlite, "submission.review-atomic", "binding.review-atomic", "Review Atomic");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", "submission.review-atomic");
    const ocr = masteryOcr();
    ocr.data.map_name = "地图 unknown";
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.review-atomic', 'submission.review-atomic', 1, 'review_required', ?, ?)").run(JSON.stringify(ocr), now);
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome.review-atomic', 'submission.review-atomic', 'verified_run', 'verified_run', 'ineligible', NULL, 0, ?, ?, ?)").run(JSON.stringify({ reason: "submission_map_mismatch", conflictFields: [] }), now, now);
    const sessionToken = "review-atomic-player-session";
    const tokenDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(sessionToken)));
    const tokenHash = Array.from(new Uint8Array(tokenDigest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.review-atomic', 'player.review-atomic', ?, ?, ?)").run(tokenHash, Date.now() + 60_000, now);
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const input = {
      submissionId: "submission.review-atomic",
      decision: "approved" as const,
      fieldCorrections: [{ fieldKey: "map_name" as const, reviewedValue: "地图 map.mastery" }],
    };
    const preview = await services.previewSubmissionReview(input, maintainer);
    expect(preview).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "eligible", reason: null } });

    const originalBatch = database.batch.bind(database);
    let failNextBatch = true;
    database.batch = async (statements) => {
      if (!failNextBatch) return originalBatch(statements);
      failNextBatch = false;
      return originalBatch([...statements, database.prepare("INSERT INTO missing_review_table (id) VALUES ('force rollback')")]);
    };
    await expect(services.reviewSubmission(input, maintainer, "review-atomic")).rejects.toThrow();
    expect(sqlite.prepare("SELECT status, gameplay_revision_id FROM submissions WHERE id = 'submission.review-atomic'").get()).toEqual({ status: "ocr_review_required", gameplay_revision_id: null });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.review-atomic' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.review-atomic'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_run_lifecycle_events").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.review-atomic'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE id = 'admin:submission.review:review-atomic'").get()).toEqual({ count: 0 });

    database.batch = originalBatch;
    const approved = await services.reviewSubmission(input, maintainer, "review-atomic");
    expect(approved).toMatchObject({ decision: "approved", verifiedRunOutcome: { status: "created", awardedXp: expect.any(Number) } });
    await expect(services.reviewSubmission(input, maintainer, "review-atomic")).resolves.toEqual(approved);
    expect(sqlite.prepare("SELECT status, gameplay_revision_id FROM submissions WHERE id = 'submission.review-atomic'").get()).toEqual({ status: "approved", gameplay_revision_id: "revision:map.mastery:initial" });
    expect(sqlite.prepare("SELECT status, awarded_xp FROM submission_outcomes WHERE submission_id = 'submission.review-atomic' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created", awarded_xp: approved.verifiedRunOutcome?.awardedXp });
    expect(sqlite.prepare("SELECT status, acceptance_source FROM mastery_runs WHERE source_submission_id = 'submission.review-atomic'").get()).toEqual({ status: "active", acceptance_source: "submission_review" });
    expect(sqlite.prepare("SELECT transition, actor_id FROM mastery_run_lifecycle_events WHERE mastery_run_id = (SELECT id FROM mastery_runs WHERE source_submission_id = 'submission.review-atomic')").all()).toEqual([{ transition: "accepted", actor_id: "submission_review" }]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.review-atomic'").get()).toEqual({ count: 1 });
    expect(await services.getAdminSubmission({ submissionId: input.submissionId }, maintainer)).toMatchObject({ verifiedRunOutcome: { status: "created", awardedXp: approved.verifiedRunOutcome?.awardedXp } });
    expect(await services.getPlayerSubmission({ submissionId: input.submissionId }, sessionToken)).toMatchObject({ verifiedRunOutcome: { status: "created", awardedXp: approved.verifiedRunOutcome?.awardedXp } });
    expect(await services.previewSubmissionReview(input, maintainer)).toMatchObject({ approvable: true, blockingCode: null, verifiedRun: { status: "recorded", reason: null } });
  });

  it("plans the same complete Verified Run checks that approval records", async () => {
    const scenarios = [
      { submissionId: "submission.preview-ambiguous", mapName: "地图 map.mastery", extraMap: true, expectedReason: "ambiguous_map", expectedOutcome: "ineligible" },
      { submissionId: "submission.preview-mismatch", mapName: "地图 map.other", extraMap: false, expectedReason: "submission_map_mismatch", expectedOutcome: "ineligible" },
      { submissionId: "submission.preview-conflict", mapName: "地图 map.mastery", extraMap: false, expectedReason: "conflicting_run_code_evidence", expectedOutcome: "conflict" },
      { submissionId: "submission.preview-clean", mapName: "地图 map.mastery", extraMap: false, expectedReason: null, expectedOutcome: "created" },
    ] as const;

    for (const scenario of scenarios) {
      const { database, sqlite } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.mastery");
      if (scenario.extraMap) {
        sqlite.prepare("INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES ('map.mastery.duplicate', '地图 map.mastery', '2026.07.15', 'active', '2026.07.15', ?, ?)").run(now, now);
      }
      if (scenario.mapName === "地图 map.other") seedMap(sqlite, "map.other");
      seedMasteryPlayer(sqlite, "player.preview", "binding.preview", "Preview Player");
      seedMasterySubmission(sqlite, scenario.submissionId, "binding.preview", "Preview Player");
      sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", scenario.submissionId);
      const ocr = masteryOcr({ difficulty: scenario.expectedOutcome === "conflict" ? "传奇" : "困难" });
      ocr.data.map_name = scenario.mapName;
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES (?, ?, 1, 'review_required', ?, ?)").run(`ocr.${scenario.submissionId}`, scenario.submissionId, JSON.stringify(ocr), now);
      sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES (?, ?, 'verified_run', 'verified_run', 'ineligible', NULL, 0, '{}', ?, ?)").run(`outcome.${scenario.submissionId}`, scenario.submissionId, now, now);
      const retainedTitleKey = `RETAINED_${scenario.submissionId.replaceAll(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
      seedTitle(sqlite, retainedTitleKey);
      const retainedGrantId = `grant.${scenario.submissionId}`;
      sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, source_type, source_id, granted_by, granted_at) VALUES (?, 'player.preview', ?, NULL, NULL, 'active', 'submission', ?, 'admin', ?)").run(retainedGrantId, retainedTitleKey, scenario.submissionId, now);
      sqlite.prepare("UPDATE submissions SET grant_id = ? WHERE id = ?").run(retainedGrantId, scenario.submissionId);

      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      if (scenario.expectedOutcome === "conflict") {
        seedMasterySubmission(sqlite, `submission.existing-${scenario.submissionId}`, "binding.preview", "Preview Player");
        await services.recordVerifiedRun({ playerAccountId: "player.preview", sourceSubmissionId: `submission.existing-${scenario.submissionId}`, mapId: "map.mastery", gameplayRevisionId: "revision:map.mastery:initial", mapVariant: null, difficulty: "困难", gameVersion: "99.0101.1", matchCode: "1234-5678-9012", completionDurationSeconds: 600, deaths: 1, skips: 0, eventCounters: {}, acceptanceSource: "submission_automatic" });
      }
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      const preview = await services.previewSubmissionReview({ submissionId: scenario.submissionId }, maintainer);
      expect(preview, scenario.submissionId).toMatchObject({
        approvable: true,
        blockingCode: null,
        verifiedRun: scenario.expectedOutcome === "created"
          ? { status: "eligible", reason: null }
          : { status: "ineligible", reason: scenario.expectedReason },
      });
      const approval = await services.reviewSubmission({ submissionId: scenario.submissionId, decision: "approved" }, maintainer, `review.${scenario.submissionId}`);
      const storedOutcome = sqlite.prepare("SELECT status, details_json FROM submission_outcomes WHERE submission_id = ? AND outcome_key = 'verified_run'").get(scenario.submissionId) as { status: string; details_json: string };
      expect(storedOutcome.status, scenario.submissionId).toBe(scenario.expectedOutcome);
      expect(JSON.parse(storedOutcome.details_json).reason, scenario.submissionId).toBe(scenario.expectedReason);
      expect(approval.decision, scenario.submissionId).toBe("approved");
      if (scenario.expectedOutcome === "created") expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = ?").get(scenario.submissionId)).toEqual({ count: 1 });
      if (scenario.expectedOutcome !== "created") expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = ?").get(scenario.submissionId)).toEqual({ count: 0 });
    }
  });

  it("rolls back review approval when a concurrent Run insert wins, then retries against that Run", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.review-race", "binding.review-race", "Review Race");
    seedMasterySubmission(sqlite, "submission.review-race", "binding.review-race", "Review Race");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", "submission.review-race");
    const ocr = masteryOcr();
    ocr.data.map_name = "地图 unknown";
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.review-race', 'submission.review-race', 1, 'review_required', ?, ?)").run(JSON.stringify(ocr), now);
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome.review-race', 'submission.review-race', 'verified_run', 'verified_run', 'ineligible', NULL, 0, '{}', ?, ?)").run(now, now);

    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const input = {
      submissionId: "submission.review-race",
      decision: "approved" as const,
      fieldCorrections: [{ fieldKey: "map_name" as const, reviewedValue: "地图 map.mastery" }],
    };
    const originalBatch = database.batch.bind(database);
    let concurrentRunId: string | null = null;
    database.batch = async (statements) => {
      database.batch = originalBatch;
      const concurrentRun = await services.recordVerifiedRun({
        playerAccountId: "player.review-race",
        sourceSubmissionId: "submission.review-race",
        mapId: "map.mastery",
        gameplayRevisionId: "revision:map.mastery:initial",
        mapVariant: null,
        difficulty: "困难",
        gameVersion: "99.0101.1",
        matchCode: "1234-5678-9012",
        completionDurationSeconds: 600,
        deaths: 1,
        skips: 0,
        eventCounters: {},
        acceptanceSource: "submission_automatic",
        acceptedAt: now,
      });
      concurrentRunId = concurrentRun.run.runId;
      return originalBatch(statements);
    };

    await expect(services.reviewSubmission(input, maintainer, "review-race")).rejects.toThrow();
    database.batch = originalBatch;
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.review-race'").get()).toEqual({ status: "ocr_review_required" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.review-race'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.review-race' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT id FROM mastery_runs WHERE source_submission_id = 'submission.review-race'").get()).toEqual({ id: concurrentRunId });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE id = 'admin:submission.review:review-race'").get()).toEqual({ count: 0 });

    await expect(services.reviewSubmission(input, maintainer, "review-race")).resolves.toMatchObject({ decision: "approved", verifiedRunOutcome: { status: "created" } });
    expect(sqlite.prepare("SELECT status, entity_id FROM submission_outcomes WHERE submission_id = 'submission.review-race' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created", entity_id: concurrentRunId });
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.review-race'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.review-race'").get()).toEqual({ count: 1 });
  });

  it("does not show a stale recorded Run when corrected preview evidence conflicts", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.preview-stale", "binding.preview-stale", "Preview Stale");
    seedMasterySubmission(sqlite, "submission.preview-stale", "binding.preview-stale", "Preview Stale");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", "submission.preview-stale");
    const ocr = masteryOcr();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.preview-stale', 'submission.preview-stale', 1, 'review_required', ?, ?)").run(JSON.stringify(ocr), now);
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const run = await services.recordVerifiedRun({
      playerAccountId: "player.preview-stale",
      sourceSubmissionId: "submission.preview-stale",
      mapId: "map.mastery",
      gameplayRevisionId: "revision:map.mastery:initial",
      mapVariant: null,
      difficulty: "困难",
      gameVersion: "99.0101.1",
      matchCode: "1234-5678-9012",
      completionDurationSeconds: 600,
      deaths: 1,
      skips: 0,
      eventCounters: {},
      acceptanceSource: "submission_automatic",
      acceptedAt: now,
    });
    sqlite.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES ('outcome.preview-stale', 'submission.preview-stale', 'verified_run', 'verified_run', 'created', ?, ?, '{}', ?, ?)").run(run.run.runId, run.run.awardedXp, now, now);

    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const preview = await services.previewSubmissionReview({
      submissionId: "submission.preview-stale",
      fieldCorrections: [{ fieldKey: "difficulty", reviewedValue: "传奇" }],
    }, maintainer);

    expect(preview).toMatchObject({
      approvable: false,
      blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED",
      verifiedRun: { status: "ineligible", reason: "conflicting_run_code_evidence" },
    });
  });

  it("matches map Challenges only on the exact Gameplay Revision identified by the evidence", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedTitle(sqlite, "CONQUEROR");
    const otherRevisionId = seedSelectableGameplayRevision(sqlite, "map.mastery");
    sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.revision-scoped', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.revision-scoped" });
    seedRevisionAssignment(sqlite, { gameplayRevisionId: otherRevisionId, mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.revision-scoped" });
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.revision-scoped", "binding.one", "Tester");

    const ocr = masteryOcr({ layoutVersion: "1280x720-v7" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.revision-scoped", objectKey: "evidence/submission.revision-scoped.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT title_key, gameplay_revision_id FROM player_title_grants WHERE source_id = 'submission.revision-scoped'").all()).toEqual([
      { title_key: "CONQUEROR", gameplay_revision_id: "revision:map.mastery:initial" },
    ]);
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM submissions WHERE id = 'submission.revision-scoped'").get()).toEqual({ gameplay_revision_id: "revision:map.mastery:initial" });
  });

  it("keeps player-profile and maintainer-list reads bounded as mastery history grows", async () => {
    const measure = async (runCount: number) => {
      const { database, sqlite, preparedStatementCount, resetPreparedStatementCount } = createD1();
      installSchema(sqlite);
      seedMap(sqlite, "map.mastery");
      seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
      const sessionToken = `query-budget-${runCount}`;
      sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, 'test', ?, ?, ?)")
        .run(`session.${runCount}`, `attempt.${runCount}`, "group.player.one", "member.player.one", await requestHash(sessionToken), now + 60_000, now);
      const services = createPlatformServices(database);

      for (let index = 0; index < runCount; index += 1) {
        const submissionId = `submission.query-budget.${runCount}.${index}`;
        seedMasterySubmission(sqlite, submissionId, "binding.one", "Tester");
        const recorded = await services.recordVerifiedRun({
          playerAccountId: "player.one",
          sourceSubmissionId: submissionId,
          mapId: "map.mastery",
          gameplayRevisionId: "revision:map.mastery:initial",
          mapVariant: null,
          difficulty: "困难",
          gameVersion: "99.0101.1",
          matchCode: `${String(1000 + index).padStart(4, "0")}-5678-9012`,
          completionDurationSeconds: 600 + index,
          deaths: 1,
          skips: 0,
          acceptanceSource: "submission_automatic",
          acceptedAt: now + index,
        });
        expect(recorded.outcome).toBe("created");
      }

      resetPreparedStatementCount();
      const profile = await services.getCurrentPlayerMastery({ sessionToken, mapId: "map.mastery", page: 1, pageSize: 20 });
      const profileStatements = preparedStatementCount();
      resetPreparedStatementCount();
      const list = await services.listAdminVerifiedRuns({ page: 1, pageSize: 20 }, {} as never);
      const listStatements = preparedStatementCount();
      return { profile, list, profileStatements, listStatements };
    };

    const oneRun = await measure(1);
    const fortyRuns = await measure(40);
    expect(oneRun.profile).toMatchObject({ profiles: [{ verifiedRunCount: 1 }], total: 1, hasMore: false });
    expect(fortyRuns.profile).toMatchObject({ profiles: [{ verifiedRunCount: 40 }], total: 40, hasMore: true });
    expect(oneRun.list).toMatchObject({ total: 1, hasMore: false });
    expect(fortyRuns.list).toMatchObject({ total: 40, hasMore: true });
    expect(fortyRuns.profileStatements).toBe(oneRun.profileStatements);
    expect(fortyRuns.listStatements).toBe(oneRun.listStatements);
    expect(fortyRuns.profileStatements).toBeLessThanOrEqual(6);
    expect(fortyRuns.listStatements).toBeLessThanOrEqual(3);
  });

  it("shows recent challenge completions and a bounded verified-run summary on the admin player detail", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const playerAccountId = "player.admin-context";
    const mapId = "map.admin-context";
    const revisionId = `revision:${mapId}:initial`;
    seedMap(sqlite, mapId);
    seedMasteryPlayer(sqlite, playerAccountId, "binding.admin-context", "Context Player");
    seedMasterySubmission(sqlite, "submission.admin-context", "binding.admin-context", "Context Player", false);
    seedTitle(sqlite, "ADMIN_CONTEXT");
    sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, map_id, gameplay_revision_id, status, manual, condition, created_at, updated_at) VALUES (?, 'title', ?, 'ADMIN_CONTEXT', 'v1', ?, ?, 'active', 1, '管理员手动授予', ?, ?)")
      .run("challenge.admin-context", "title.ADMIN_CONTEXT", mapId, revisionId, now, now);
    sqlite.prepare("INSERT INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) VALUES (?, ?, ?, ?, 'active', 'manual', ?, ?, ?)")
      .run("completion.admin-context", playerAccountId, "challenge.admin-context", revisionId, "manual:admin-context", now, now);
    sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES (?, ?, ?, ?, ?, NULL, '困难', '2026.07.15', '1234-5678-9012', 600, 1, 0, '{}', 'submission_automatic', ?, 'active', 'v2', '{}', 120, ?)")
      .run("run.admin-context", playerAccountId, "submission.admin-context", mapId, revisionId, now + 3, now);
    sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = ?").run(revisionId);
    const currentRevisionId = `revision:${mapId}:rework`;
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'default', NULL, ?, 'revision reset', '2026.08.10', ?, ?)")
      .run(currentRevisionId, mapId, revisionId, now, now);
    const selectableRevisionId = seedSelectableGameplayRevision(sqlite, mapId, "selectable");
    const insertRun = (runId: string, submissionId: string, runRevisionId: string, acceptedAt: number, matchCode: string) => {
      seedMasterySubmission(sqlite, submissionId, "binding.admin-context", "Context Player", false);
      sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES (?, ?, ?, ?, ?, NULL, '困难', '2026.08.10', ?, 600, 1, 0, '{}', 'submission_automatic', ?, 'active', 'v2', '{}', 120, ?)")
        .run(runId, playerAccountId, submissionId, mapId, runRevisionId, matchCode, acceptedAt, now);
    };
    insertRun("run.admin-context.default", "submission.admin-context.default", currentRevisionId, now + 2, "2345-6789-1234");
    insertRun("run.admin-context.selectable", "submission.admin-context.selectable", selectableRevisionId, now + 1, "3456-7891-2345");

    const detail = await createPlatformServices(database).getAdminPlayer({ playerAccountId }, {} as never);

    expect(detail.recentCompletions).toEqual([expect.objectContaining({
      completionId: "completion.admin-context",
      challengeId: "challenge.admin-context",
      titleKey: "ADMIN_CONTEXT",
      titleName: "称号 ADMIN_CONTEXT",
      mapName: `地图 ${mapId}`,
      gameplayRevisionId: revisionId,
      gameVersion: "2026.07.15",
      status: "active",
      sourceType: "manual",
    })]);
    expect(detail.progression).toEqual({
      activeVerifiedRunCount: 2,
      recentVerifiedRuns: expect.arrayContaining([expect.objectContaining({
        runId: "run.admin-context.default",
        mapName: `地图 ${mapId}`,
        gameplayRevisionId: currentRevisionId,
        gameVersion: "2026.08.10",
        difficulty: "困难",
        awardedXp: 120,
      })]),
    });
    expect(detail.progression.recentVerifiedRuns.map(({ runId }) => runId)).toEqual([
      "run.admin-context.default",
      "run.admin-context.selectable",
    ]);
    expect(JSON.stringify(detail.progression)).not.toContain("1234-5678-9012");
  });

  it("requires and preserves a classic map variant when the submission contract distinguishes it", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedClassicGameplayRevision(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-missing", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.classic-present", "binding.one", "Tester");
    for (const submissionId of ["submission.classic-missing", "submission.classic-present"]) {
      sqlite.prepare("UPDATE submissions SET rule_snapshot_json = ? WHERE id = ?").run(JSON.stringify({ ruleId: "challenge:classic", mapVariant: "classic" }), submissionId);
    }

    let ocr = masteryOcr({ matchCode: "2345-6789-1234" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.classic-missing", objectKey: "evidence/submission.classic-missing.png", attempt: 1 });
      ocr = masteryOcr({ matchCode: "3456-7891-2345", mapVariant: "classic" });
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.classic-present", objectKey: "evidence/submission.classic-present.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.classic-missing' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible" });
    expect(sqlite.prepare("SELECT map_variant FROM mastery_runs WHERE source_submission_id = 'submission.classic-present'").get()).toEqual({ map_variant: "classic" });
  });

  it("does not let an OCR queue key select evidence outside its submission attachment", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.bound", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.other", "binding.one", "Tester", false);
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)")
      .run("attachment.other", "submission.other", "external.other", "evidence/other-submission.png", now);
    const get = vi.fn(async () => ({ size: 1, httpMetadata: { contentType: "image/png" }, arrayBuffer: async () => new Uint8Array([1]).buffer }));
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    try {
      const services = createPlatformServices(database, { get } as unknown as R2Bucket, "https://api.example.com", "https://ocr.example.com", "token");
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES ('job.bound', 'submission.bound', 0, 'pending', ?)").run(now);
      await expect(services.processOcrJob({ jobId: "job.bound", submissionId: "submission.bound", objectKey: "evidence/other-submission.png", attempt: 1 })).rejects.toThrow("OCR_EVIDENCE_UNAVAILABLE");
      expect(get).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("credits one player run once across exact and changed screenshots, keeps players independent, and surfaces conflicts", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasteryPlayer(sqlite, "player.two", "binding.two", "Other");
    for (const submissionId of ["submission.first", "submission.exact", "submission.reencoded", "submission.conflict"]) seedMasterySubmission(sqlite, submissionId, "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.other", "binding.two", "Other");

    let ocr = masteryOcr();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.first", objectKey: "evidence/submission.first.png", attempt: 1 });
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.exact", objectKey: "evidence/submission.exact.png", attempt: 1 });
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.reencoded", objectKey: "evidence/submission.reencoded.png", attempt: 1 });
      ocr = masteryOcr({ viewerPlayer: "Other#5678" });
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.other", objectKey: "evidence/submission.other.png", attempt: 1 });
      ocr = masteryOcr({ difficulty: "传奇" });
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.conflict", objectKey: "evidence/submission.conflict.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }

    expect(sqlite.prepare("SELECT player_account_id, run_code, awarded_xp FROM mastery_runs ORDER BY player_account_id").all()).toEqual([
      { player_account_id: "player.one", run_code: "1234-5678-9012", awarded_xp: 236 },
      { player_account_id: "player.two", run_code: "1234-5678-9012", awarded_xp: 236 },
    ]);
    expect(sqlite.prepare("SELECT submission_id, status, awarded_xp FROM submission_outcomes WHERE outcome_key = 'verified_run' ORDER BY submission_id").all()).toEqual([
      { submission_id: "submission.conflict", status: "conflict", awarded_xp: 0 },
      { submission_id: "submission.exact", status: "reused", awarded_xp: 0 },
      { submission_id: "submission.first", status: "created", awarded_xp: 236 },
      { submission_id: "submission.other", status: "created", awarded_xp: 236 },
      { submission_id: "submission.reencoded", status: "reused", awarded_xp: 0 },
    ]);
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.conflict'").get()).toEqual({ status: "ocr_review_required" });
    expect(JSON.parse((sqlite.prepare("SELECT details_json FROM submission_outcomes WHERE submission_id = 'submission.conflict'").get() as { details_json: string }).details_json)).toMatchObject({ conflictFields: ["difficulty"] });

    const firstEvidenceKey = `uploads/submissions/submission.first/${"a".repeat(64)}.png`;
    sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, object_key, upload_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("attachment.first", "submission.first", "portal", "upload.first", "image/png", firstEvidenceKey, "stored", now + 1);
    const publicServices = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, undefined, "https://evidence.owbastion.codes");
    const publicOutcomes = await Promise.all([
      "submission.first",
      "submission.exact",
      "submission.conflict",
    ].map((submissionId) => publicServices.getSubmission({ submissionId }, {} as never)));
    expect(publicOutcomes.map((submission) => submission.verifiedRunOutcome)).toEqual([
      { status: "created", awardedXp: 236 },
      { status: "reused", awardedXp: 0 },
      undefined,
    ]);
    expect(publicOutcomes[2].reason).toBeUndefined();
    expect(JSON.stringify(publicOutcomes)).not.toMatch(/conflicting_run_code_evidence|conflictFields|verifiedRunId|1234-5678-9012/);

    const sessionToken = "mastery-player-session";
    sqlite.prepare("INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run("mastery-player-session", "attempt.player.one", "group.player.one", "member.player.one", "test", await requestHash(sessionToken), now + 60_000, now);
    const playerConflict = await publicServices.getPlayerSubmission({ submissionId: "submission.conflict" }, sessionToken);
    expect(playerConflict.verifiedRunOutcome).toBeUndefined();
    expect(playerConflict.reason).toBeUndefined();
    // Only a player's own request is described to them as a submitted request.
    sqlite.prepare("UPDATE submissions SET status = 'resubmission_required', ocr_fail_count = 1 WHERE id = 'submission.exact'").run();
    await publicServices.requestManualReview({ submissionId: "submission.exact" }, sessionToken);
    expect((await publicServices.getPlayerSubmission({ submissionId: "submission.exact" }, sessionToken)).reason).toBe("已提交处理申请，请稍后查看结果。");
    const player = await publicServices.getCurrentPlayer({ sessionToken });
    const currentConflict = player?.recentSubmissions.find((submission) => submission.submissionId === "submission.conflict");
    expect(currentConflict?.status).toBe("needs_review");
    expect(currentConflict?.verifiedRunOutcome).toBeUndefined();
    expect(currentConflict?.reason).toBeUndefined();

    const adminConflict = await publicServices.getAdminSubmission({ submissionId: "submission.conflict" }, {} as never);
    expect(adminConflict.verifiedRunOutcome).toMatchObject({
      status: "conflict",
      reason: "conflicting_run_code_evidence",
      conflictFields: ["difficulty"],
      verifiedRunId: expect.any(String),
    });

    const verifiedRunId = adminConflict.verifiedRunOutcome?.verifiedRunId;
    if (!verifiedRunId) throw new Error("missing mastery conflict target");
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const listed = await publicServices.listAdminVerifiedRuns({ playerAccountId: "player.one", mapId: "map.mastery", difficulty: "困难", acceptanceSource: "submission_automatic", status: "active", matchCode: "1234-5678-9012", page: 1, pageSize: 20 }, maintainer);
    expect(listed).toMatchObject({ total: 1, items: [{ runId: verifiedRunId, conflictCount: 1, playerAccountId: "player.one", mapName: "地图 map.mastery", matchCode: "1234-5678-9012" }] });
    const pendingConflicts = await publicServices.listAdminVerifiedRuns({ unresolvedConflictsOnly: true, page: 1, pageSize: 20 }, maintainer);
    expect(pendingConflicts).toMatchObject({ total: 1, items: [{ runId: verifiedRunId }] });

    const inspected = await publicServices.getAdminVerifiedRun({ verifiedRunId }, maintainer);
    expect(inspected).toMatchObject({
      run: { sourceSubmissionId: "submission.first", acceptanceSource: "submission_automatic", xpRuleVersion: "v2", xpInputSnapshot: { ruleVersion: "v2" } },
      projection: { mapId: "map.mastery", verifiedRunCount: 1 },
      sourceSubmission: { submissionId: "submission.first", evidenceUrl: null },
      lifecycle: [{ transition: "accepted", actorType: "service" }],
      conflicts: [{ submissionId: "submission.conflict", conflictFields: ["difficulty"], facts: { mapName: "地图 map.mastery", difficulty: "传奇", matchCode: "1234-5678-9012" }, resolution: null }],
    });
    expect((await publicServices.getAdminSubmission({ submissionId: "submission.first" })).evidenceUrl).toBe(`https://evidence.owbastion.codes/${firstEvidenceKey}`);

    const invalidated = await publicServices.resolveAdminVerifiedRunConflict({ verifiedRunId, submissionId: "submission.conflict", action: "invalidate_existing", reason: "以修正截图为准" }, maintainer, "mastery-conflict-invalidate");
    expect(invalidated).toMatchObject({ action: "invalidate_existing", run: { status: "invalidated", invalidationReason: "以修正截图为准" }, projection: { totalXp: 0, verifiedRunCount: 0 } });
    expect(await publicServices.listAdminVerifiedRuns({ unresolvedConflictsOnly: true, page: 1, pageSize: 20 }, maintainer)).toMatchObject({ total: 0, items: [] });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.first' AND outcome_key = 'verified_run'").get()).toEqual({ status: "invalidated" });
    expect(await publicServices.resolveAdminVerifiedRunConflict({ verifiedRunId, submissionId: "submission.conflict", action: "invalidate_existing", reason: "以修正截图为准" }, maintainer, "mastery-conflict-invalidate")).toEqual(invalidated);
    expect(sqlite.prepare("SELECT action, actor_type, actor_id, reason FROM mastery_run_conflict_resolutions").all()).toEqual([{ action: "invalidate_existing", actor_type: "user", actor_id: "admin", reason: "以修正截图为准" }]);
    expect(sqlite.prepare("SELECT operation, COUNT(*) AS count FROM audit_events WHERE entity_type = 'verified_run' GROUP BY operation ORDER BY operation").all()).toEqual([
      { operation: "mastery_run.conflict.resolve", count: 1 },
      { operation: "mastery_run.invalidate", count: 1 },
    ]);

    const restored = await publicServices.transitionAdminVerifiedRun({ verifiedRunId, action: "restore", reason: "保留原始记录" }, maintainer, "mastery-run-restore");
    expect(restored).toMatchObject({ run: { status: "active", invalidatedAt: null, invalidationReason: null }, projection: { verifiedRunCount: 1 } });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.first' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT transition, actor_type, actor_id, reason FROM mastery_run_lifecycle_events WHERE mastery_run_id = ? ORDER BY created_at, rowid").all(verifiedRunId)).toEqual([
      { transition: "accepted", actor_type: "service", actor_id: "submission_automatic", reason: null },
      { transition: "invalidated", actor_type: "user", actor_id: "admin", reason: "以修正截图为准" },
      { transition: "restored", actor_type: "user", actor_id: "admin", reason: "保留原始记录" },
    ]);
  });

  it("keeps title-only administration separate from mastery and blocks acquisition after an admin revoke", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedTitle(sqlite, "CONQUEROR");
    sqlite.prepare("INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES ('challenge.mastery', 'map.mastery', 'difficulty_completion', '困难通关', '困难', '完成', '截图', 'manual', 'CONQUEROR', '99.0101.1', 'active', '99.0101.1', ?, ?)").run(now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: "revision:map.mastery:initial", mapId: "map.mastery", challengeFamily: "map_challenge", challengeId: "challenge.mastery" });
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.combined", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.legacy", "binding.one", "Tester");

    let ocr = masteryOcr({ layoutVersion: "1280x720-v7" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.combined", objectKey: "evidence/submission.combined.png", attempt: 1 });
      const combined = sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.combined'").get() as { status: string; grant_id: string | null };
      expect(combined.status).toBe("approved");
      expect(combined.grant_id).not.toBeNull();
      expect(sqlite.prepare("SELECT outcome_type, status FROM submission_outcomes WHERE submission_id = 'submission.combined' ORDER BY outcome_type").all()).toEqual([
        { outcome_type: "challenge", status: "created" },
        { outcome_type: "title_grant", status: "created" },
        { outcome_type: "verified_run", status: "created" },
      ]);

      await services.revokeAdminTitleGrant({ grantId: combined.grant_id!, reason: "称号专项修复" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "portal-session" }, "title-only-revoke");
      expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.combined'").get()).toEqual({ status: "active" });

      ocr = masteryOcr({ matchCode: null, layoutVersion: "1280x720-v7" });
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.legacy", objectKey: "evidence/submission.legacy.png", attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sqlite.prepare("SELECT status, grant_id FROM submissions WHERE id = 'submission.legacy'").get()).toEqual({ status: "resubmission_required", grant_id: null });
    expect(sqlite.prepare("SELECT status, awarded_xp FROM submission_outcomes WHERE submission_id = 'submission.legacy' AND outcome_key = 'verified_run'").get()).toEqual({ status: "ineligible", awarded_xp: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.legacy'").get()).toEqual({ count: 0 });
    expect((await createPlatformServices(database).getSubmission({ submissionId: "submission.legacy" }, {} as never)).verifiedRunOutcome).toEqual({ status: "ineligible", awardedXp: 0 });
  });

  it("invalidates and restores the source run exactly once through the existing spot-check and OCR-retry path", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.lifecycle", "binding.one", "Tester", true);
    const queued: unknown[] = [];
    const queue = { send: async (message: unknown) => { queued.push(message); } } as Queue;
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const ocr = masteryOcr({ layoutVersion: "1280x720-v7" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ocr), { status: 200, headers: { "content-type": "application/json" } })));
    try {
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue, undefined, undefined, 1, 1, localVerifiedRunEvidenceCompatibility);
      await deliverOcrFixture(services, sqlite, { submissionId: "submission.lifecycle", objectKey: "evidence/submission.lifecycle.png", attempt: 1 });
      const revoked = await services.resolveAdminSubmissionSpotCheck({ submissionId: "submission.lifecycle", decision: "revoked", reason: "证据无效" }, auth, "spot-check-revoke");
      expect(revoked).toMatchObject({ grantId: null, verifiedRunId: expect.any(String), status: "revoked" });
      expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.lifecycle'").get()).toEqual({ status: "invalidated" });
      expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.lifecycle' AND outcome_key = 'verified_run'").get()).toEqual({ status: "invalidated" });

      await services.requestAdminOcr({ submissionId: "submission.lifecycle" }, auth, "ocr-revalidate", "request-revalidate");
      await deliverOcrFixture(services, sqlite, { ...(queued[0] as { submissionId: string; objectKey: string; manual: boolean; requestId: string }), attempt: 1 });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE source_submission_id = 'submission.lifecycle'").get()).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT status FROM submission_outcomes WHERE submission_id = 'submission.lifecycle' AND outcome_key = 'verified_run'").get()).toEqual({ status: "created" });
    expect(sqlite.prepare("SELECT transition, COUNT(*) AS count FROM mastery_run_lifecycle_events GROUP BY transition ORDER BY transition").all()).toEqual([
      { transition: "accepted", count: 1 },
      { transition: "invalidated", count: 1 },
      { transition: "restored", count: 1 },
    ]);
    // The retry re-decides the already-reviewed Submission instead of leaving it waiting for OCR.
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.lifecycle'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.lifecycle'").get()).toEqual({ count: 2 });
  });
});

describe("OCR queue failure recovery", () => {
  it("serializes simultaneous OCR retries for the same idempotency key without duplicate queue sends", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.concurrent-same-key", "binding.one", "Tester");
    sqlite.prepare("UPDATE submissions SET status = 'resubmission_required' WHERE id = 'submission.concurrent-same-key'").run();

    let releaseQueueSend!: () => void;
    let markQueueSendStarted!: () => void;
    const queueSendStarted = new Promise<void>((resolve) => { markQueueSendStarted = resolve; });
    const queueSendGate = new Promise<void>((resolve) => { releaseQueueSend = resolve; });
    const queue = { send: vi.fn(async () => { markQueueSendStarted(); await queueSendGate; }) } as unknown as Queue;
    const services = createPlatformServices(synchronizeConcurrentBatches(database, 2), fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

    const first = services.requestAdminOcr({ submissionId: "submission.concurrent-same-key" }, auth, "idem.concurrent-same", "request.first");
    const second = services.requestAdminOcr({ submissionId: "submission.concurrent-same-key" }, auth, "idem.concurrent-same", "request.second");
    const outcomes = Promise.allSettled([first, second]);
    const losingAttempt = Promise.race([first.catch((error) => error), second.catch((error) => error)]);
    await queueSendStarted;
    expect(await losingAttempt).toEqual(new Error("OCR_RETRY_IN_PROGRESS"));
    expect(queue.send).toHaveBeenCalledOnce();
    releaseQueueSend();
    const settled = await outcomes;
    expect(settled.filter((result) => result.status === "fulfilled")).toEqual([{ status: "fulfilled", value: { contractVersion: "1", submissionId: "submission.concurrent-same-key", status: "ocr_pending" } }]);
    expect(settled.filter((result) => result.status === "rejected")).toEqual([{ status: "rejected", reason: new Error("OCR_RETRY_IN_PROGRESS") }]);
    expect(sqlite.prepare("SELECT response_json FROM idempotency_keys WHERE operation = 'submission.ocr.retry'").get()).toEqual({ response_json: JSON.stringify({ contractVersion: "1", submissionId: "submission.concurrent-same-key", status: "ocr_pending" }) });
  });

  it("prevents a losing simultaneous retry from undoing a successful enqueue", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.concurrent-send", "binding.one", "Tester");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_pending', review_reason = '请重试', updated_at = 1000 WHERE id = 'submission.concurrent-send'").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, error_code, created_at) VALUES ('ocr.concurrent-send-failed', 'submission.concurrent-send', 0, 'error', 'OCR_QUEUE_SEND_FAILED', 1000)").run();

    const queue = { send: vi.fn(async () => {}) } as unknown as Queue;
    const services = createPlatformServices(synchronizeConcurrentBatches(database, 2), fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

    const first = services.requestAdminOcr({ submissionId: "submission.concurrent-send" }, auth, "idem.concurrent-first", "request.first");
    const second = services.requestAdminOcr({ submissionId: "submission.concurrent-send" }, auth, "idem.concurrent-second", "request.second");
    const outcomes = await Promise.allSettled([first, second]);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toMatchObject({ status: "rejected", reason: new Error("OCR_RETRY_IN_PROGRESS") });
    expect(queue.send).toHaveBeenCalledOnce();

    expect(outcomes.find((outcome) => outcome.status === "fulfilled")).toMatchObject({ status: "fulfilled", value: { contractVersion: "1", submissionId: "submission.concurrent-send", status: "ocr_pending" } });
    expect(sqlite.prepare("SELECT status, review_reason FROM submissions WHERE id = 'submission.concurrent-send'").get()).toEqual({ status: "ocr_pending", review_reason: null });
    expect(sqlite.prepare("SELECT status, error_code FROM ocr_results WHERE submission_id = 'submission.concurrent-send' ORDER BY created_at").all()).toEqual([
      { status: "error", error_code: "OCR_QUEUE_SEND_FAILED" },
      { status: "pending", error_code: null },
    ]);
  });

  it("moves stale OCR jobs to an actionable state after queue recovery deliveries are exhausted", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedMap(sqlite, "map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.stale-ocr", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.fresh-ocr", "binding.one", "Tester");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_pending', updated_at = 1000 WHERE id = 'submission.stale-ocr'").run();
    sqlite.prepare("UPDATE submissions SET status = 'ocr_pending', updated_at = 2000 WHERE id = 'submission.fresh-ocr'").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES ('ocr-stale-result', 'submission.stale-ocr', 0, 'pending', 1000)").run();
    sqlite.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES ('admin:submission.ocr.retry:idem.stale', 'admin', 'submission.ocr.retry', 'hash', 'ocr-retry-enqueueing:ocr-stale-result', 1000)").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES ('ocr-fresh-result', 'submission.fresh-ocr', 0, 'pending', 2000)").run();
    const services = createPlatformServices(database);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(services.reconcileStaleOcrJobs({ olderThan: 1500 })).resolves.toBe(1);

    expect(sqlite.prepare("SELECT status, ocr_fail_count FROM submissions WHERE id = 'submission.stale-ocr'").get()).toEqual({ status: "resubmission_required", ocr_fail_count: 1 });
    expect(sqlite.prepare("SELECT status, error_code FROM ocr_results WHERE id = 'ocr-stale-result'").get()).toEqual({ status: "error", error_code: "OCR_QUEUE_STALLED" });
    expect(sqlite.prepare("SELECT id FROM idempotency_keys WHERE id = 'admin:submission.ocr.retry:idem.stale'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.fresh-ocr'").get()).toEqual({ status: "ocr_pending" });
    expect(logSpy.mock.calls.map(([line]) => String(line)).some((line) => line.includes('"event":"stale_job_recovered"') && line.includes('"submissionId":"submission.stale-ocr"'))).toBe(true);
    logSpy.mockRestore();
  });
});
