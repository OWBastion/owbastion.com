import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationsDirectory = fileURLToPath(new URL("../../../migrations/", import.meta.url));
const migrationNames = readdirSync(migrationsDirectory).filter((name) => /^\d{4}_.*\.sql$/u.test(name)).sort();

const applyMigrations = (sqlite: DatabaseSync, through: string) => {
  for (const name of migrationNames) {
    if (name > through) break;
    sqlite.exec("PRAGMA foreign_keys = OFF;");
    sqlite.exec(readFileSync(`${migrationsDirectory}/${name}`, "utf8"));
  }
};

describe("0082 Player Account and Passkey migration", () => {
  it("preserves submission facts, backfills direct sessions, and accepts submissions without QQ bindings", () => {
    const sqlite = new DatabaseSync(":memory:");
    applyMigrations(sqlite, "0081_allow_retired_equipped_titles.sql");
    sqlite.exec("PRAGMA foreign_keys = ON;");

    sqlite.exec(`
      INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
      VALUES ('player.passkey', '1234', 'Player', 'player', 0, 'active', 10, 10),
             ('player.no-qq', '5678', 'Other Player', 'other player', 0, 'active', 11, 11);
      INSERT INTO identities (id, created_at, updated_at) VALUES ('identity.passkey', 10, 10);
      INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at)
      VALUES ('binding.passkey', 'identity.passkey', 'player.passkey', 'qq', 'group-1', 'member-1', 'active', 10);
      INSERT INTO qq_login_attempts (id, token_hash, code_hash, status, expires_at, created_at)
      VALUES ('attempt-1', 'token-hash', 'code-hash', 'verified', 9999999999999, 20);
      INSERT INTO submissions (id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, review_reason, grant_id, ocr_fail_count, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
      VALUES ('submission.bound', 'binding.passkey', 'approved', 'map_completion', 'challenge-1', '地图', '困难', 'Player', 'reviewed', 'grant-1', 2, 'qq', 'conversation-1', 'message-1', 20, 30);
      INSERT INTO qq_sessions (id, attempt_id, group_open_id, member_open_id, environment, token_hash, expires_at, created_at)
      VALUES ('session.legacy', 'attempt-1', 'group-1', 'member-1', 'production', 'legacy-session-hash', 9999999999999, 25);
    `);

    sqlite.exec("BEGIN;");
    sqlite.exec(readFileSync(`${migrationsDirectory}/0082_player_passkeys.sql`, "utf8"));
    sqlite.exec("COMMIT;");

    const submission = sqlite.prepare(`
      SELECT player_account_id, binding_id, status, challenge_type, challenge_id, map_name, difficulty, player_name, review_reason, grant_id,
             ocr_fail_count, source_provider, source_conversation_id, source_message_id, created_at, updated_at
      FROM submissions WHERE id = 'submission.bound'
    `).get();
    expect(submission).toEqual({
      player_account_id: "player.passkey",
      binding_id: "binding.passkey",
      status: "approved",
      challenge_type: "map_completion",
      challenge_id: "challenge-1",
      map_name: "地图",
      difficulty: "困难",
      player_name: "Player",
      review_reason: "reviewed",
      grant_id: "grant-1",
      ocr_fail_count: 2,
      source_provider: "qq",
      source_conversation_id: "conversation-1",
      source_message_id: "message-1",
      created_at: 20,
      updated_at: 30,
    });

    const backfilledSession = sqlite.prepare(`
      SELECT s.player_account_id, p.player_id FROM portal_sessions s
      JOIN player_accounts p ON p.id = s.player_account_id
      WHERE s.token_hash = 'legacy-session-hash'
    `).get();
    expect(backfilledSession).toEqual({ player_account_id: "player.passkey", player_id: "1234" });

    sqlite.prepare("UPDATE bindings SET status = 'revoked' WHERE id = 'binding.passkey'").run();
    expect(sqlite.prepare(`
      SELECT p.player_id FROM portal_sessions s JOIN player_accounts p ON p.id = s.player_account_id
      WHERE s.token_hash = 'legacy-session-hash' AND p.status = 'active'
    `).get()).toEqual({ player_id: "1234" });

    sqlite.prepare(`
      INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
      VALUES ('submission.no-qq', 'player.no-qq', NULL, 'received', 'map_completion', '地图', 'portal', 'portal', 'upload-1', 40, 40)
    `).run();
    expect(sqlite.prepare("SELECT player_account_id, binding_id FROM submissions WHERE id = 'submission.no-qq'").get()).toEqual({ player_account_id: "player.no-qq", binding_id: null });
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('qq_sessions', 'qq_login_attempts')").all()).toEqual([{ name: "qq_login_attempts" }]);
  });

  it("fails before replacing submissions when a submission has no Player Account mapping", () => {
    const sqlite = new DatabaseSync(":memory:");
    applyMigrations(sqlite, "0081_allow_retired_equipped_titles.sql");
    sqlite.exec("PRAGMA foreign_keys = OFF;");
    sqlite.exec(`
      INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
      VALUES ('submission.orphan', 'binding.missing', 'received', 'map_completion', '地图', 'portal', 'portal', 'orphan-upload', 10, 10);
    `);

    sqlite.exec("BEGIN;");
    expect(() => sqlite.exec(readFileSync(`${migrationsDirectory}/0082_player_passkeys.sql`, "utf8"))).toThrow();
    sqlite.exec("ROLLBACK;");

    expect(sqlite.prepare("SELECT id, binding_id FROM submissions").all()).toEqual([{ id: "submission.orphan", binding_id: "binding.missing" }]);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'submissions_next'").get()).toBeUndefined();
  });
});
