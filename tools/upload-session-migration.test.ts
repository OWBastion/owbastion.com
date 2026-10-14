import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("upload session submission timing migration", () => {
  it("preserves existing sessions and removes only the submission foreign key", () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE player_accounts (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE submissions (id TEXT PRIMARY KEY NOT NULL);
        CREATE TABLE upload_sessions (
          id TEXT PRIMARY KEY NOT NULL,
          submission_id TEXT NOT NULL REFERENCES submissions(id),
          player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
          content_type TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          object_key TEXT NOT NULL,
          status TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        INSERT INTO player_accounts VALUES ('player');
        INSERT INTO submissions VALUES ('existing-submission');
        INSERT INTO upload_sessions VALUES ('existing-upload', 'existing-submission', 'player', 'image/png', 10, 'hash', 'key', 'pending', 100, 1);
      `);

      sqlite.exec(readFileSync(new URL("../migrations/0100_upload_session_submission_timing.sql", import.meta.url), "utf8"));

      expect(sqlite.prepare("SELECT id, submission_id, player_account_id FROM upload_sessions").all()).toEqual([
        { id: "existing-upload", submission_id: "existing-submission", player_account_id: "player" },
      ]);
      sqlite.prepare("INSERT INTO upload_sessions VALUES ('new-upload', 'not-created-yet', 'player', 'image/png', 10, 'hash', 'key', 'pending', 100, 1)").run();
      expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(() => sqlite.prepare("INSERT INTO upload_sessions VALUES ('bad-player-upload', 'not-created-yet', 'missing-player', 'image/png', 10, 'hash', 'key', 'pending', 100, 1)").run()).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      sqlite.close();
    }
  });
});
