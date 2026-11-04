import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { AgentSpatialConfig } from "@owbastion/contracts";
import { createPlatformServices } from "./index";
import { hashRequest as requestHash } from "./portal-session";
import { compositeSpatialConfig, createD1, createTestDatabase, installSchema, legacyGameplayRevisionId, now, seedAgentSpatialConfig, seedClassicGameplayRevision, seedCompat, seedException, seedLegacyMapChallenge, seedMap, seedMapTitleChallenge, seedRevisionAssignment, seedRule, seedSelectableGameplayRevision, seedTitle, sharedCompositeSpatialConfig } from "../test/map-title-rule-fixtures";

describe("Agents map gameplay projection", () => {

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

  it("keeps a granted map title definition resolvable and unchanged before, during, and after its Pioneer window", async () => {
    const { database, sqlite } = createTestDatabase("map.pioneer-window");
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer.window", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
    const startsAt = now + 60_000;
    const endsAt = now + 120_000;
    seedException(sqlite, "exception.pioneer.window", "rule.pioneer.window", "map.pioneer-window", { startsAt, endsAt });
    seedAgentSpatialConfig(sqlite, "revision:map.pioneer-window:initial");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.pioneer-window', '1004', 'Pioneer Holder', 'pioneer holder', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.pioneer-window', 'player.pioneer-window', 'PIONEER', 'map.pioneer-window', 'revision:map.pioneer-window:initial', 'pioneer', 'active', 'submission', 'submission.pioneer-window', 'admin', ?)").run(now);
    const services = createPlatformServices(database);
    const clock = vi.spyOn(Date, "now");
    try {
      for (const at of [startsAt - 1, startsAt + 1, endsAt + 1]) {
        clock.mockReturnValue(at);
        const [titles, holders] = await Promise.all([
          services.listAgentTitles({ mapId: "map.pioneer-window", page: 1, pageSize: 50 }),
          services.listAgentMapTitleHolders({ mapId: "map.pioneer-window", page: 1, pageSize: 50 }),
        ]);
        expect(holders.items).not.toEqual([]);
        for (const holder of holders.items) {
          expect(titles.items, `timestamp ${at}`).toContainEqual(expect.objectContaining({
            titleKey: holder.titleKey,
            scope: "map",
            mapId: "map.pioneer-window",
            slot: holder.slot ?? undefined,
            // One title key is one definition across maps: the window must not change it.
            availability: "active",
          }));
        }
      }
    } finally {
      clock.mockRestore();
    }
  });
});

describe("Agents map projection readiness", () => {

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

  it("rebinds or clears equipped preferences atomically with revision applicability", async () => {
    const { database, sqlite } = createTestDatabase("map.equipped-reset");
    seedAgentSpatialConfig(sqlite, "revision:map.equipped-reset:initial");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.rebound', 'rebound', 'Rebound', 'rebound', ?, ?), ('player.cleared', 'cleared', 'Cleared', 'cleared', ?, ?)").run(now, now, now, now);
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, scope, display_kind, color_json, game_version) VALUES ('GLOBAL_RESET_TITLE', 'Reset title', 'award', 'Test', 'Test', 'global', 'fixed', 'null', '2026.08.13')").run();
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

});

describe("manual title grant batches", () => {

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

  it.each(["draft", "ended"] as const)("allows an explicit manual grant for a %s title through its manual Challenge", async (variant) => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    seedTitle(sqlite, "RETIRED_MANUAL");
    sqlite.prepare("UPDATE title_catalog SET lifecycle = ?, scope = 'global', display_kind = 'fixed' WHERE key = 'RETIRED_MANUAL'").run(variant === "draft" ? "draft" : "active");
    if (variant === "ended") sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, status, game_version, scope, created_at, updated_at) VALUES ('title.RETIRED_MANUAL.ended', 'RETIRED_MANUAL', '条件', '证据', 'manual', 'archived', '26.1003.1', 'global', 1, 1)").run();
    const playerId = "player.retired.manual";
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(playerId, "retired-manual", "Retired Manual", "retired manual", now, now);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    const result = await services.createAdminManualTitleGrant({ contractVersion: "1", playerAccountId: playerId, titleKey: "RETIRED_MANUAL" }, auth, "retired-manual-grant");

    expect(result.grantId).toBeTruthy();
    expect(sqlite.prepare("SELECT lifecycle FROM title_catalog WHERE key = 'RETIRED_MANUAL'").get()).toEqual({ lifecycle: variant === "draft" ? "draft" : "active" });
    expect(sqlite.prepare("SELECT manual, status FROM challenges WHERE title_key = 'RETIRED_MANUAL'").get()).toEqual({ manual: 1, status: "active" });
    expect(sqlite.prepare("SELECT status, source_type FROM challenge_completions WHERE player_account_id = ?").get(playerId)).toEqual({ status: "active", source_type: "manual" });
    expect(sqlite.prepare("SELECT status, completion_id FROM player_title_grants WHERE player_account_id = ?").get(playerId)).toMatchObject({ status: "active", completion_id: expect.any(String) });
  });
});
