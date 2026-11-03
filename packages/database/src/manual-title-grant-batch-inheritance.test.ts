import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, installSchema, now, seedMap, seedRevisionAssignment, seedRule, seedSelectableGameplayRevision, seedTitle } from "../test/map-title-rule-fixtures";

const titleInheritanceTriggers = [...readFileSync(new URL("../../../migrations/0113_enforce_pioneer_dominator_inheritance.sql", import.meta.url), "utf8").matchAll(/CREATE TRIGGER[\s\S]*?\nEND;/g)].map((match) => match[0]).join("\n");

describe("manual title grant batches with inherited titles", () => {
  it("creates lower titles first so the inheritance triggers cannot collide in one batch", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    const player = "33333333-3333-4333-8333-333333333333";
    seedMap(sqlite, "map.batch");
    seedTitle(sqlite, "CONQUEROR");
    seedTitle(sqlite, "DOMINATOR");
    seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
    seedRule(sqlite, "rule.dominator", "DOMINATOR", "dominator", { slot: "dominator" });
    const revisionId = seedSelectableGameplayRevision(sqlite, "map.batch");
    for (const challengeId of ["rule.conqueror", "rule.dominator"]) seedRevisionAssignment(sqlite, { gameplayRevisionId: revisionId, mapId: "map.batch", challengeFamily: "map_title_rule", challengeId });
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, '1003', 'Three', 'three', 0, 'active', ?, ?)").run(player, now, now);
    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS player_title_grants_source_idx ON player_title_grants(source_type, source_id, title_key);
      CREATE UNIQUE INDEX IF NOT EXISTS player_title_grants_active_identity_idx ON player_title_grants(player_account_id, title_key, COALESCE(map_id, ''), COALESCE(gameplay_revision_id, '')) WHERE status = 'active';
      ${titleInheritanceTriggers}
    `);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    // The higher title is listed first: a plain insert in this order used to
    // collide with the CONQUEROR grant its trigger had already created.
    const result = await services.createAdminManualTitleGrantBatch({
      contractVersion: "1" as const,
      playerAccountIds: [player],
      targets: [
        { titleKey: "DOMINATOR", mapId: "map.batch", gameplayRevisionId: revisionId },
        { titleKey: "CONQUEROR", mapId: "map.batch", gameplayRevisionId: revisionId },
      ],
    }, auth, "manual-batch-inheritance");
    expect(result).toMatchObject({ createdCount: 2, alreadyOwnedCount: 0 });
    expect(sqlite.prepare("SELECT title_key, source_type FROM player_title_grants ORDER BY title_key").all()).toEqual([
      { title_key: "CONQUEROR", source_type: "manual" },
      { title_key: "DOMINATOR", source_type: "manual" },
    ]);
  });
});
