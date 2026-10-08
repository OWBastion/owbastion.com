import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("achievement progress migration", () => {
  it("preserves existing completions and title grants inside a foreign-key-enforced transaction", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: false });
    try {
      const migrations = new URL("../migrations/", import.meta.url);
      for (const name of readdirSync(migrations).sort()) {
        if (name >= "0094") break;
        if (name.endsWith(".sql")) {
          sqlite.exec("PRAGMA foreign_keys = OFF;");
          sqlite.exec(readFileSync(new URL(name, migrations), "utf8"));
        }
      }
      sqlite.exec(`
        PRAGMA foreign_keys = ON;
        INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at)
        VALUES ('player', 'player', 'Player', 'player', 1, 1);
        INSERT INTO challenge_completions (id, player_account_id, challenge_id, status, source_type, source_id, completed_at, invalidated_at, invalidation_reason, created_at)
        VALUES
          ('completion', 'player', 'manual:TEST_LONG', 'active', 'manual', 'manual-grant', 10, NULL, NULL, 10),
          ('invalidated', 'player', 'manual:TEST_LONG', 'invalidated', 'submission', 'old-submission', 5, 6, 'evidence revoked', 5);
        INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, completion_id)
        VALUES ('grant', 'player', 'TEST_LONG', 'active', 'manual', 'manual-grant', 'admin', 10, 'completion');
      `);
      const completions = sqlite.prepare("SELECT * FROM challenge_completions ORDER BY id").all();
      const grants = sqlite.prepare("SELECT * FROM player_title_grants ORDER BY id").all();

      // D1 runs each migration in a transaction with foreign keys enabled.
      sqlite.exec("BEGIN;");
      sqlite.exec(readFileSync(new URL("0094_achievement_progress_rule.sql", migrations), "utf8"));
      sqlite.exec("COMMIT;");

      expect(sqlite.prepare("SELECT * FROM challenge_completions ORDER BY id").all()).toEqual(completions);
      expect(sqlite.prepare("SELECT * FROM player_title_grants ORDER BY id").all()).toEqual(grants);
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(sqlite.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      sqlite.exec(`
        INSERT INTO challenge_completions (id, player_account_id, challenge_id, source_type, source_id, completed_at, created_at)
        VALUES ('progress', 'player', 'manual:IDOL', 'verified_run_progress', 'player', 20, 20);
      `);
      expect(sqlite.prepare("SELECT source_type FROM challenge_completions WHERE id = 'progress'").get()).toEqual({ source_type: "verified_run_progress" });
      expect(() => sqlite.exec(`
        INSERT INTO challenge_completions (id, player_account_id, challenge_id, source_type, source_id, completed_at, created_at)
        VALUES ('orphan', 'missing-player', 'manual:IDOL', 'verified_run_progress', 'missing-player', 20, 20);
      `)).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      sqlite.close();
    }
  });
});
