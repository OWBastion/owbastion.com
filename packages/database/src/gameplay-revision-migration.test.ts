import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { agentSpatialConfigSchema } from "@owbastion/contracts";

const migrationsDirectory = fileURLToPath(new URL("../../../migrations/", import.meta.url));
const migrationNames = readdirSync(migrationsDirectory).filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort();

const applyMigrations = (sqlite: DatabaseSync, through: string) => {
  for (const name of migrationNames) {
    if (name > through) break;
    sqlite.exec(readFileSync(`${migrationsDirectory}/${name}`, "utf8"));
  }
};

describe("0061/0062/0063/0064/0065/0066 gameplay revision forward migrations", () => {
  it("assigns legacy facts, disables inactive assignments, repairs CLASSIC provenance, and materialises the spatial baseline without copying progress", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    applyMigrations(sqlite, "0060_mastery_ledger.sql");

    sqlite.exec(`
      INSERT OR IGNORE INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at)
      VALUES
        ('map.revision', 'Revision Map', '26.0810.9', 'active', '26.0810.1', 1, 1),
        ('map.aatlis', 'Aatlis', '26.0810.9', 'active', '26.0810.1', 1, 1),
        ('map.antarctic_peninsula', 'Antarctic Peninsula', '26.0810.9', 'active', '26.0810.1', 1, 1),
        ('map.paraiso', 'Paraiso', '26.0810.9', 'active', '26.0810.1', 1, 1),
        ('map.eichenwalde', 'Eichenwalde', '26.0810.9', 'active', '26.0810.1', 1, 1);
      INSERT OR IGNORE INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version)
      VALUES
        ('REV_STANDARD', 'Standard', 'trophy', '地图', '完成地图', 'active', 'map', 'map_name_suffix', 'null', '26.0810.1'),
        ('REV_CLASSIC', 'Revision Classic', 'trophy', '地图', '完成地图', 'active', 'map', 'map_name_suffix', 'null', '26.0810.1');
      INSERT INTO map_title_rule_exceptions (id, rule_id, map_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at)
      VALUES
        ('exception.revision.pioneer', 'rule.pioneer', 'map.revision', 1, NULL, NULL, NULL, 'pioneer', 1, 1),
        ('exception.revision.classic', 'rule.classic', 'map.revision', 1, NULL, NULL, NULL, NULL, 1, 1);
      INSERT INTO map_title_rule_compat (legacy_challenge_id, rule_id, map_id, is_standard_instance, created_at)
      VALUES
        ('map.revision.conqueror', 'rule.conqueror', 'map.revision', 1, 1),
        ('map.revision.pioneer', 'rule.pioneer', 'map.revision', 0, 1),
        ('map.revision.classic', 'rule.classic', 'map.revision', 0, 1);
      INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, retired_version, created_at, updated_at)
      VALUES
        ('challenge.revision.standard', 'map.revision', 'difficulty_completion', '标准挑战', '困难', '标准条件', '标准证据', 'manual', 'CONQUEROR', '26.0810.1', 'active', '26.0810.1', NULL, 1, 1),
        ('challenge.revision.inactive', 'map.revision', 'difficulty_completion', '已停用挑战', '困难', '停用条件', '停用证据', 'manual', NULL, '26.0810.1', 'inactive', '26.0810.1', '26.0810.9', 1, 1),
        ('challenge.revision.classic', 'map.revision', 'classic_completion', '经典挑战', '困难', '经典条件', '经典证据', 'manual', 'CLASSIC', '26.0710.1', 'active', '26.0710.1', NULL, 1, 1);
      INSERT INTO title_challenges (id, title_key, category_override, condition, evidence_rule, submission_mode, game_version, status, introduced_version, retired_version, starts_at, ends_at, scope, map_variant, created_at, updated_at)
      VALUES
        ('title.revision.standard', 'REV_STANDARD', NULL, '标准条件', '标准证据', 'manual', '26.0810.1', 'active', '26.0810.1', NULL, NULL, NULL, 'map', NULL, 1, 1),
        ('title.revision.classic', 'REV_CLASSIC', NULL, '经典条件', '经典证据', 'manual', '26.0710.1', 'active', '26.0710.1', NULL, NULL, NULL, 'map', 'classic', 1, 1);
      INSERT INTO achievement_challenge_maps (challenge_id, map_id)
      VALUES ('title.revision.standard', 'map.revision'), ('title.revision.classic', 'map.revision');
      INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.revision', 1, 1);
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
      VALUES ('player.revision', '1001', 'Revision Player', 'revision player', 0, 'active', 1, 1);
      INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at)
      VALUES ('binding.revision', 'identity.revision', 'player.revision', 'qq', 'group.revision', 'member.revision', 'active', 1);
      INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, target_map_id, map_name, difficulty, player_name, review_reason, grant_id, ocr_fail_count, rule_snapshot_json, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
      VALUES
        ('submission.revision.initial', 'binding.revision', 'approved', 'map_completion', 'challenge.revision.standard', 'map.revision', 'Revision Map', '困难', 'Revision Player', NULL, NULL, 0, '{"mapVariant":null}', 'portal', 'portal', 'message.initial', 1, 1),
        ('submission.revision.classic', 'binding.revision', 'approved', 'map_completion', 'challenge.revision.classic', 'map.revision', 'Revision Map', '困难', 'Revision Player', NULL, NULL, 0, '{"mapVariant":"classic"}', 'portal', 'portal', 'message.classic', 1, 1);
      INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, invalidated_at, invalidated_by, invalidation_reason, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at)
      VALUES
        ('run.revision.initial', 'player.revision', 'submission.revision.initial', 'map.revision', NULL, '困难', '26.0810.1', '1234-5678-9012', 600, 1, 0, '{}', 'submission_review', 1, 'active', NULL, NULL, NULL, 'v1', '{}', 225, 1),
        ('run.revision.classic', 'player.revision', 'submission.revision.classic', 'map.revision', 'classic', '困难', '26.0710.1', '2234-5678-9012', 610, 1, 0, '{}', 'submission_review', 1, 'active', NULL, NULL, NULL, 'v1', '{}', 225, 1);
      INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at)
      VALUES
        ('grant.revision.initial', 'player.revision', 'CONQUEROR', 'map.revision', 'conqueror', 'active', 'submission', 'submission.revision.initial', 'admin', 1),
        ('grant.revision.classic', 'player.revision', 'CLASSIC', 'map.revision', NULL, 'active', 'submission', 'submission.revision.classic', 'admin', 1);
      INSERT INTO historical_title_grants (id, scope, map_id, slot, title_key, holder_name, source_version)
      VALUES
        ('historical.revision.initial', 'map', 'map.revision', 'conqueror', 'CONQUEROR', 'Legacy Player', '26.0810.1'),
        ('historical.revision.classic', 'map', 'map.revision', NULL, 'CLASSIC', 'Legacy Player', '26.0810.1');
    `);

    sqlite.exec(readFileSync(`${migrationsDirectory}/0061_gameplay_revisions.sql`, "utf8"));
    sqlite.exec(readFileSync(`${migrationsDirectory}/0062_repair_legacy_classic_revisions.sql`, "utf8"));
    sqlite.exec(`
      UPDATE submissions
      SET rule_snapshot_json = '{"gameplayRevisionId":"revision:map.revision:classic","mapVariant":"classic"}'
      WHERE id = 'submission.revision.classic';
      INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at)
      VALUES ('outcome.revision.classic', 'submission.revision.classic', 'challenge:challenge.revision.classic:map.revision:revision:map.revision:classic', 'challenge', 'created', 'challenge.revision.classic', 0, '{"gameplayRevisionId":"revision:map.revision:classic"}', 1, 1);
      INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at)
      VALUES ('ocr.revision.classic', 'submission.revision.classic', 1, 'review_required', '{}', '{"candidates":[{"gameplayRevisionId":"revision:map.revision:classic"}]}', 1);
      INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at)
      VALUES ('idempotency.revision.classic', 'admin', 'submission.challenge.select', 'hash', '{"gameplayRevisionId":"revision:map.revision:classic"}', 1);
      INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at)
      VALUES ('audit.revision.classic', 'correlation.revision.classic', 'admin', 'admin', 'gameplay_revision.normalize', 'gameplay_revision', 'revision:map.revision:classic', '{"gameplayRevisionId":"revision:map.revision:classic"}', 1);
    `);
    sqlite.exec("BEGIN;");
    try {
      sqlite.exec(readFileSync(`${migrationsDirectory}/0063_normalize_legacy_gameplay_revision_ids.sql`, "utf8"));
      sqlite.exec("COMMIT;");
    } catch (error) {
      sqlite.exec("ROLLBACK;");
      throw error;
    }
    sqlite.exec(readFileSync(`${migrationsDirectory}/0064_gameplay_revision_spatial_config.sql`, "utf8"));
    sqlite.exec(readFileSync(`${migrationsDirectory}/0065_disable_inactive_revision_assignments.sql`, "utf8"));
    const preservedParaisoSpatialConfig = JSON.stringify({
      bastionPositions: [[900, 901, 902]], resetPosition: [903, 904, 905], endPosition: [906, 907, 908],
      thirdPersonPosition: [909, 910, 911], creditsPosition: [912, 913, 914], control: null,
      portalPositions: [], springboardPositions: [], alternateStages: [],
    });
    sqlite.prepare("UPDATE gameplay_revisions SET spatial_config_json = ? WHERE id = 'revision:map.paraiso:initial'").run(preservedParaisoSpatialConfig);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.eichen.initial', 'player.revision', 'CONQUEROR', 'map.eichenwalde', 'revision:map.eichenwalde:initial', 'conqueror', 'active', 'submission', 'submission.eichen.initial', 'admin', 1)").run();
    sqlite.exec(readFileSync(`${migrationsDirectory}/0066_backfill_initial_gameplay_revision_spatial_configs.sql`, "utf8"));

    expect(sqlite.prepare("SELECT id, lifecycle, legacy_map_variant, copied_from_revision_id, game_version FROM gameplay_revisions WHERE map_id = 'map.revision' ORDER BY id").all()).toEqual([
      { id: "revision:map.revision:initial", lifecycle: "default", legacy_map_variant: null, copied_from_revision_id: null, game_version: "26.0810.9" },
      { id: "revision:map.revision:v0", lifecycle: "selectable", legacy_map_variant: "classic", copied_from_revision_id: null, game_version: "26.0710.1" },
    ]);
    expect(sqlite.prepare("SELECT id, gameplay_revision_id FROM submissions WHERE id LIKE 'submission.revision.%' ORDER BY id").all()).toEqual([
      { id: "submission.revision.classic", gameplay_revision_id: "revision:map.revision:v0" },
      { id: "submission.revision.initial", gameplay_revision_id: "revision:map.revision:initial" },
    ]);
    expect(sqlite.prepare("SELECT id, gameplay_revision_id FROM mastery_runs WHERE id LIKE 'run.revision.%' ORDER BY id").all()).toEqual([
      { id: "run.revision.classic", gameplay_revision_id: "revision:map.revision:v0" },
      { id: "run.revision.initial", gameplay_revision_id: "revision:map.revision:initial" },
    ]);
    expect(sqlite.prepare("SELECT id, gameplay_revision_id, status FROM player_title_grants WHERE id LIKE 'grant.revision.%' ORDER BY id").all()).toEqual([
      { id: "grant.revision.classic", gameplay_revision_id: "revision:map.revision:v0", status: "active" },
      { id: "grant.revision.initial", gameplay_revision_id: "revision:map.revision:initial", status: "active" },
    ]);
    expect(sqlite.prepare("SELECT id, gameplay_revision_id FROM historical_title_grants WHERE id LIKE 'historical.revision.%' ORDER BY id").all()).toEqual([
      { id: "historical.revision.classic", gameplay_revision_id: "revision:map.revision:v0" },
      { id: "historical.revision.initial", gameplay_revision_id: "revision:map.revision:initial" },
    ]);
    expect(sqlite.prepare("SELECT gameplay_revision_id, challenge_family, challenge_id FROM gameplay_revision_challenge_assignments WHERE map_id = 'map.revision' ORDER BY gameplay_revision_id, challenge_family, challenge_id").all()).toEqual(expect.arrayContaining([
      { gameplay_revision_id: "revision:map.revision:initial", challenge_family: "map_title_rule", challenge_id: "rule.conqueror" },
      { gameplay_revision_id: "revision:map.revision:initial", challenge_family: "map_title_rule", challenge_id: "rule.pioneer" },
      { gameplay_revision_id: "revision:map.revision:initial", challenge_family: "map_challenge", challenge_id: "challenge.revision.standard" },
      { gameplay_revision_id: "revision:map.revision:initial", challenge_family: "title_challenge", challenge_id: "title.revision.standard" },
      { gameplay_revision_id: "revision:map.revision:v0", challenge_family: "map_title_rule", challenge_id: "rule.classic" },
      { gameplay_revision_id: "revision:map.revision:v0", challenge_family: "map_challenge", challenge_id: "challenge.revision.classic" },
      { gameplay_revision_id: "revision:map.revision:v0", challenge_family: "title_challenge", challenge_id: "title.revision.classic" },
    ]));
    expect(sqlite.prepare("SELECT id FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.revision:v0' AND challenge_id = 'rule.classic'").get()).toEqual({
      id: "assignment:revision:map.revision:v0:map_title_rule:rule.classic",
    });
    expect(sqlite.prepare("SELECT enabled FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = 'revision:map.revision:initial' AND challenge_id = 'challenge.revision.inactive'").get()).toEqual({
      enabled: 0,
    });
    expect(JSON.parse((sqlite.prepare("SELECT rule_snapshot_json FROM submissions WHERE id = 'submission.revision.classic'").get() as { rule_snapshot_json: string }).rule_snapshot_json)).toMatchObject({
      gameplayRevisionId: "revision:map.revision:v0",
    });
    expect(sqlite.prepare("SELECT outcome_key, details_json FROM submission_outcomes WHERE id = 'outcome.revision.classic'").get()).toEqual({
      outcome_key: "challenge:challenge.revision.classic:map.revision:revision:map.revision:v0",
      details_json: '{"gameplayRevisionId":"revision:map.revision:v0"}',
    });
    expect(JSON.parse((sqlite.prepare("SELECT match_json FROM ocr_results WHERE id = 'ocr.revision.classic'").get() as { match_json: string }).match_json)).toMatchObject({
      candidates: [{ gameplayRevisionId: "revision:map.revision:v0" }],
    });
    expect(JSON.parse((sqlite.prepare("SELECT response_json FROM idempotency_keys WHERE id = 'idempotency.revision.classic'").get() as { response_json: string }).response_json)).toMatchObject({
      gameplayRevisionId: "revision:map.revision:v0",
    });
    expect(sqlite.prepare("SELECT entity_id, payload_json FROM audit_events WHERE id = 'audit.revision.classic'").get()).toEqual({
      entity_id: "revision:map.revision:v0",
      payload_json: '{"gameplayRevisionId":"revision:map.revision:v0"}',
    });
    expect(sqlite.prepare("SELECT id FROM gameplay_revisions WHERE id LIKE '%:classic'").all()).toEqual([]);
    const aatlisSpatialConfig = JSON.parse((sqlite.prepare("SELECT spatial_config_json FROM gameplay_revisions WHERE id = 'revision:map.aatlis:initial'").get() as { spatial_config_json: string }).spatial_config_json);
    expect(aatlisSpatialConfig.bastionPositions[0]).toEqual([-27.31, 30.462, 99.799]);
    expect(aatlisSpatialConfig).toMatchObject({
      control: { respawnAxis: "z", respawnAxisThreshold: 30, respawnPositions: [[4.85, 15.5, 104.6]] },
      alternateStages: [],
    });
    expect(JSON.parse((sqlite.prepare("SELECT spatial_config_json FROM gameplay_revisions WHERE id = 'revision:map.antarctic_peninsula:initial'").get() as { spatial_config_json: string }).spatial_config_json).alternateStages.map((stage: { stageId: string }) => stage.stageId)).toEqual(["icebreaker", "laboratory"]);
    expect(sqlite.prepare("SELECT spatial_config_json FROM gameplay_revisions WHERE id = 'revision:map.paraiso:initial'").get()).toEqual({ spatial_config_json: preservedParaisoSpatialConfig });
    expect(sqlite.prepare("SELECT id, lifecycle, legacy_map_variant, copied_from_revision_id FROM gameplay_revisions WHERE map_id = 'map.eichenwalde' ORDER BY id").all()).toEqual([
      { id: "revision:map.eichenwalde:initial", lifecycle: "default", legacy_map_variant: null, copied_from_revision_id: null },
      { id: "revision:map.eichenwalde:v0", lifecycle: "selectable", legacy_map_variant: "classic", copied_from_revision_id: "revision:map.eichenwalde:initial" },
    ]);
    expect(JSON.parse((sqlite.prepare("SELECT spatial_config_json FROM gameplay_revisions WHERE id = 'revision:map.eichenwalde:v0'").get() as { spatial_config_json: string }).spatial_config_json).bastionPositions[5]).toEqual([3.66, 9.08, -62.94]);
    expect(sqlite.prepare("SELECT gameplay_revision_id FROM player_title_grants WHERE map_id = 'map.eichenwalde' ORDER BY gameplay_revision_id").all()).toEqual([
      { gameplay_revision_id: "revision:map.eichenwalde:initial" },
    ]);
    const initialSpatialRows = sqlite.prepare("SELECT map_id, spatial_config_json FROM gameplay_revisions WHERE id LIKE 'revision:map.%:initial' AND spatial_config_json IS NOT NULL ORDER BY map_id").all() as Array<{ map_id: string; spatial_config_json: string }>;
    expect(initialSpatialRows).toHaveLength(38);
    for (const row of initialSpatialRows) expect(agentSpatialConfigSchema.safeParse(JSON.parse(row.spatial_config_json)).success, row.map_id).toBe(true);
    const selectableSpatialRows = sqlite.prepare("SELECT map_id, spatial_config_json FROM gameplay_revisions WHERE id IN ('revision:map.circuit_royal:v0', 'revision:map.eichenwalde:v0', 'revision:map.hanamura:v0', 'revision:map.paris:v0') ORDER BY map_id").all() as Array<{ map_id: string; spatial_config_json: string }>;
    expect(selectableSpatialRows).toHaveLength(4);
    for (const row of selectableSpatialRows) expect(agentSpatialConfigSchema.safeParse(JSON.parse(row.spatial_config_json)).success, row.map_id).toBe(true);
    expect(() => sqlite.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, game_version, created_at, updated_at) VALUES ('revision:map.revision:duplicate', 'map.revision', 'default', NULL, '26.0810.1', 2, 2)").run()).toThrow();
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect((sqlite.prepare("PRAGMA table_info(gameplay_revisions)").all() as Array<{ name: string }>).some(({ name }) => name === "spatial_config_json")).toBe(true);
  });
});
