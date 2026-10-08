import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(new URL("../../../migrations/", import.meta.url));
const historyMigration = "0097_player_history_index.sql";
const historySql = `SELECT run.*, revision.lifecycle FROM mastery_runs AS run
  INNER JOIN gameplay_revisions AS revision ON run.gameplay_revision_id = revision.id
  WHERE run.player_account_id = ? ORDER BY run.accepted_at DESC, run.id DESC LIMIT ? OFFSET ?`;
const countSql = "SELECT count(*) AS total FROM mastery_runs WHERE player_account_id = ?";

const plan = (sqlite: DatabaseSync, sql: string, parameters: Array<string | number>) =>
  (sqlite.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...parameters) as Array<{ detail: string }>).map((row) => row.detail);

describe("player verified-run history index migration", () => {
  it("indexes all-status player history and totals without changing pagination or ledger facts", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON;");
    const migrationNames = readdirSync(migrationsDirectory).filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort();
    const applyMigration = (name: string) => {
      sqlite.exec("BEGIN;");
      sqlite.exec(readFileSync(`${migrationsDirectory}/${name}`, "utf8"));
      sqlite.exec("COMMIT;");
    };
    for (const name of migrationNames.filter((name) => name < historyMigration)) {
      applyMigration(name);
    }
    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, status, created_at, updated_at)
        VALUES ('player-history', 'history', 'History', 'history', 'active', 1, 1),
               ('someone-else', 'other', 'Other', 'other', 'active', 1, 1);
      INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at)
        VALUES ('map.history', 'History Map', 'test', 'active', 'test', 1, 1);
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at)
        VALUES ('revision:history', 'map.history', 'historical', 'test', 1, 1);
      INSERT INTO submissions (id, player_account_id, status, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
        VALUES ('submission-a', 'player-history', 'approved', 'portal', 'history', 'message-a', 1, 1),
               ('submission-z', 'player-history', 'approved', 'portal', 'history', 'message-z', 1, 1),
               ('submission-old', 'player-history', 'approved', 'portal', 'history', 'message-old', 1, 1),
               ('submission-other', 'someone-else', 'approved', 'portal', 'history', 'message-other', 1, 1);
    `);
    const insert = sqlite.prepare(`INSERT INTO mastery_runs
      (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, difficulty,
       game_version, run_code, completion_duration_seconds, acceptance_source, accepted_at,
       status, invalidated_at, invalidated_by, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at)
      VALUES (?, ?, ?, 'map.history', 'revision:history', '困难', 'test', ?, 60,
              'submission_review', ?, ?, ?, ?, 'test', '{}', 1, 1)`);
    insert.run("active-a", "player-history", "submission-a", "1111-1111-1111", 20, "active", null, null);
    insert.run("invalidated-z", "player-history", "submission-z", "2222-2222-2222", 20, "invalidated", 30, "admin");
    insert.run("older", "player-history", "submission-old", "3333-3333-3333", 10, "active", null, null);
    insert.run("other-player", "someone-else", "submission-other", "4444-4444-4444", 40, "active", null, null);

    const parameters = ["player-history", 2, 0];
    const beforeRows = sqlite.prepare(historySql).all(...parameters);
    const beforeCount = sqlite.prepare(countSql).get("player-history");
    expect(beforeRows.map((row) => row.id)).toEqual(["invalidated-z", "active-a"]);
    expect(beforeCount).toEqual({ total: 3 });
    expect(plan(sqlite, historySql, parameters).some((detail) => /SCAN run\b/.test(detail))).toBe(true);
    expect(plan(sqlite, historySql, parameters).some((detail) => detail.includes("TEMP B-TREE FOR ORDER BY"))).toBe(true);
    expect(plan(sqlite, countSql, ["player-history"]).some((detail) => /SCAN mastery_runs\b/.test(detail))).toBe(true);

    applyMigration(historyMigration);
    for (const name of migrationNames.filter((name) => name > historyMigration)) applyMigration(name);
    expect(sqlite.prepare(historySql).all(...parameters)).toEqual(beforeRows);
    expect(sqlite.prepare(countSql).get("player-history")).toEqual(beforeCount);
    expect(sqlite.prepare(historySql).all("player-history", 2, 2).map((row) => row.id)).toEqual(["older"]);
    const historyPlan = plan(sqlite, historySql, parameters);
    expect(historyPlan.some((detail) => /SEARCH run USING INDEX .*\(player_account_id=\?\)/.test(detail))).toBe(true);
    expect(historyPlan.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
    expect(plan(sqlite, countSql, ["player-history"]).some((detail) => /SEARCH mastery_runs USING COVERING INDEX .*\(player_account_id=\?\)/.test(detail))).toBe(true);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.close();
  });
});
