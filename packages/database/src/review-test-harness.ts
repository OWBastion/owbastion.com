import {
  auditEventsRequiredIdSchema,
  gameplayRevisionsSchema,
  idempotencyKeysRequiredIdSchema,
  mapsSchema,
  playerAccountsSchema,
  randomEventsSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";

export const createD1 = () => createTestD1({ foreignKeys: true, countStatements: true });
export const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  ${playerAccountsSchema}
  ${mapsSchema}
  ${gameplayRevisionsSchema}
  CREATE UNIQUE INDEX gameplay_revisions_one_default_idx ON gameplay_revisions(map_id) WHERE lifecycle = 'default';
  CREATE TRIGGER reviews_test_default_revision AFTER INSERT ON maps BEGIN
    INSERT INTO gameplay_revisions (id, map_id, lifecycle, game_version, created_at, updated_at)
    VALUES ('revision:' || NEW.id || ':initial', NEW.id, CASE WHEN NEW.status = 'active' THEN 'default' ELSE 'historical' END, NEW.game_version, NEW.created_at, NEW.updated_at);
  END;
  ${randomEventsSchema}
  CREATE TABLE review_imports (
    id TEXT PRIMARY KEY NOT NULL,
    source_hash TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    imported_by TEXT NOT NULL,
    imported_at INTEGER NOT NULL
  );
  CREATE TABLE reviews (
    id TEXT PRIMARY KEY NOT NULL,
    player_account_id TEXT REFERENCES player_accounts(id),
    import_id TEXT REFERENCES review_imports(id),
    source_id INTEGER,
    source_label TEXT,
    target_type TEXT NOT NULL CHECK (target_type IN ('event', 'map')),
    target_id TEXT NOT NULL,
    gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    comment_status TEXT NOT NULL DEFAULT 'visible',
    anonymous INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    withdrawn_at INTEGER,
    invalidated_at INTEGER,
    invalidated_by TEXT,
    invalidation_reason TEXT,
    CHECK ((player_account_id IS NULL) = (import_id IS NOT NULL))
  );
  CREATE UNIQUE INDEX reviews_import_source_idx ON reviews(import_id, source_id) WHERE import_id IS NOT NULL;
  CREATE UNIQUE INDEX reviews_player_event_idx ON reviews(player_account_id, target_id) WHERE target_type = 'event';
  CREATE UNIQUE INDEX reviews_player_legacy_map_idx ON reviews(player_account_id, target_id) WHERE target_type = 'map' AND gameplay_revision_id IS NULL;
  CREATE UNIQUE INDEX reviews_player_map_revision_idx ON reviews(player_account_id, target_id, gameplay_revision_id) WHERE target_type = 'map' AND gameplay_revision_id IS NOT NULL;
  CREATE INDEX reviews_target_status_idx ON reviews(target_type, target_id, gameplay_revision_id, status);
  ${idempotencyKeysRequiredIdSchema}
  ${auditEventsRequiredIdSchema}
`);

export const auth = (subject: string) => ({ actorType: "user" as const, subject, roles: [] as string[], provider: "test" });
