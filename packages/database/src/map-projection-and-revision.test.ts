import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import {
  compositeSpatialConfig, createTestDatabase, legacyGameplayRevisionId, now, seedAgentSpatialConfig,
  seedClassicGameplayRevision, seedCompat, seedException, seedLegacyMapChallenge,
  seedMap, seedMapTitleChallenge, seedRevisionAssignment, seedRule,
  seedSelectableGameplayRevision, seedTitle, sharedCompositeSpatialConfig,
} from "../test/map-title-rule-fixtures";

describe("Agents map gameplay projection", () => {
  it("projects enabled revisions with deterministic spatial and challenge references", async () => {
    const { database, sqlite } = createTestDatabase("map.agents");
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
    const { database, sqlite } = createTestDatabase("map.classic");
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
    const { database, sqlite } = createTestDatabase("map.expired-pioneer");
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
    const { database, sqlite } = createTestDatabase("map.composite");
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
    const { database, sqlite } = createTestDatabase("map.legacy-composite");
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

  it("keeps preparing composite revisions out of the Agents projection", async () => {
    const { database, sqlite } = createTestDatabase("map.preparing-composite");
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
    const { database, sqlite } = createTestDatabase("map.composite-rollout");
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
    const { database, sqlite } = createTestDatabase("map.agents");
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    const invalidSelectableId = seedSelectableGameplayRevision(sqlite, "map.agents", "invalid");
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = ?").run("not-json", invalidSelectableId);
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES ('revision:map.agents:historical', 'map.agents', 'historical', NULL, NULL, NULL, '2025.01.1', ?, ?, ?), ('revision:map.agents:preparing', 'map.agents', 'preparing', NULL, NULL, NULL, '2026.08.1', ?, ?, ?)").run(JSON.stringify({}), now, now, JSON.stringify({}), now, now);
    const services = createPlatformServices(database);

    const map = (await services.getAgentMap({ mapId: "map.agents" }))!;
    expect(map.gameplayRevisions).toEqual([]);
  });

  it("keeps a valid map with zero legitimate holders as an empty projection", async () => {
    const { database, sqlite } = createTestDatabase("map.empty");
    seedAgentSpatialConfig(sqlite, "revision:map.empty:initial");
    const services = createPlatformServices(database);

    await expect(services.listAgentMapTitleHolders({ mapId: "map.empty", page: 1, pageSize: 20 })).resolves.toMatchObject({
      contractVersion: "1", items: [], page: 1, pageSize: 20, total: 0, hasMore: false,
    });
  });

  it("does not turn durable grants into an empty projection when an enabled map is unavailable", async () => {
    const { database, sqlite } = createTestDatabase("map.unavailable");
    seedTitle(sqlite, "PIONEER");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.unavailable', '1003', 'Unavailable Player', 'unavailable player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.unavailable', 'player.unavailable', 'PIONEER', 'map.unavailable', 'revision:map.unavailable:initial', 'pioneer', 'active', 'submission', 'source.unavailable', 'admin', ?)").run(now);
    const services = createPlatformServices(database);

    await expect(services.listAgentMapTitleHolders({ mapId: "map.unavailable", page: 1, pageSize: 20 })).rejects.toThrow("AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE");
  });

  it("fails closed when a compat title alias lacks its mapped rule assignment", async () => {
    const { database, sqlite } = createTestDatabase("map.compat");
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
    const { database, sqlite } = createTestDatabase("map.agents");
    seedAgentSpatialConfig(sqlite, "revision:map.agents:initial");
    sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES ('revision:map.agents:duplicate-default', 'map.agents', 'default', NULL, NULL, NULL, '2026.08.1', ?, ?, ?)").run(JSON.stringify({}), now, now);
    seedAgentSpatialConfig(sqlite, "revision:map.agents:duplicate-default");
    const services = createPlatformServices(database);

    await expect(services.getAgentMap({ mapId: "map.agents" })).resolves.toMatchObject({ mapId: "map.agents", gameplayRevisions: [] });
  });

  it("scopes map title holders to projectable revision identities", async () => {
    const { database, sqlite } = createTestDatabase("map.agents");
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
    const { database, sqlite } = createTestDatabase("map.editor.catalog");
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
    const { database, sqlite } = createTestDatabase("map.editor");
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
      layout_version: "1280x720-v6",
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
    const { database, sqlite } = createTestDatabase("map.promotion-atomic");
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
    const { database, sqlite } = createTestDatabase("map.equipped-reset");
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
    const { database, sqlite } = createTestDatabase("map.editor.invalid");
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
    const { database, sqlite } = createTestDatabase();
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
    const { database, sqlite } = createTestDatabase();
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
    const { database, sqlite } = createTestDatabase();
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
