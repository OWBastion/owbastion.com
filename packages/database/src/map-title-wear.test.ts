import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { hashRequest } from "./portal-session";
import { createTestDatabase, legacyGameplayRevisionId, now, seedAgentSpatialConfig, seedCompat, seedException, seedMapTitleChallenge, seedRevisionAssignment, seedRule, seedTitle } from "../test/map-title-rule-fixtures";

describe("map-title wear preference", () => {
  it("omits holders who turned it off, restores them when turned on, and defaults to wearing", async () => {
    const { database, sqlite } = createTestDatabase("map.wear");
    seedTitle(sqlite, "CLASSIC");
    seedRule(sqlite, "rule.wear", "CLASSIC", "classic", { mapVariant: "classic", defaultScope: "explicit" });
    seedCompat(sqlite, "title.CLASSIC", "rule.wear", "map.wear");
    seedException(sqlite, "exception.wear", "rule.wear", "map.wear");
    seedMapTitleChallenge(sqlite, "title.CLASSIC", "CLASSIC", "map.wear");
    sqlite.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ? AND challenge_family = 'title_challenge' AND challenge_id = 'title.CLASSIC'").run("revision:map.wear:initial");
    const revisionId = legacyGameplayRevisionId("map.wear");
    seedRevisionAssignment(sqlite, { gameplayRevisionId: revisionId, mapId: "map.wear", challengeFamily: "title_challenge", challengeId: "title.CLASSIC" });
    seedAgentSpatialConfig(sqlite, "revision:map.wear:initial");
    seedAgentSpatialConfig(sqlite, revisionId);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.wear', '1002', 'Wear Player', 'wear player', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.wear', 'player.wear', 'CLASSIC', 'map.wear', ?, NULL, 'active', 'manual', 'manual', 'admin', ?)").run(revisionId, now);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.wear', 'player.wear', ?, ?, ?)").run(await hashRequest("token.wear"), now + 60_000, now);
    const services = createPlatformServices(database);
    const holders = () => services.listAgentMapTitleHolders({ mapId: "map.wear", page: 1, pageSize: 20 }).then((page) => page.items.map((item) => item.playerId));
    const session = { sessionToken: "token.wear" };

    await expect(services.getCurrentPlayerMapTitleWear(session)).resolves.toEqual({ contractVersion: "1", wearMapTitles: true });
    await expect(holders()).resolves.toEqual(["1002"]);
    await expect(services.updateCurrentPlayerMapTitleWear({ ...session, wearMapTitles: false }, "off")).resolves.toEqual({ contractVersion: "1", wearMapTitles: false });
    await expect(services.getCurrentPlayerMapTitleWear(session)).resolves.toEqual({ contractVersion: "1", wearMapTitles: false });
    await expect(holders()).resolves.toEqual([]);
    await expect(services.updateCurrentPlayerMapTitleWear({ ...session, wearMapTitles: true }, "off")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.updateCurrentPlayerMapTitleWear({ ...session, wearMapTitles: true }, "on")).resolves.toEqual({ contractVersion: "1", wearMapTitles: true });
    await expect(holders()).resolves.toEqual(["1002"]);
    sqlite.prepare("UPDATE player_accounts SET status = 'banned' WHERE id = 'player.wear'").run();
    await expect(holders()).resolves.toEqual([]);
    sqlite.prepare("UPDATE player_accounts SET status = 'active' WHERE id = 'player.wear'").run();
    await expect(holders()).resolves.toEqual(["1002"]);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'player.title.map-wear.update'").get()).toEqual({ count: 2 });
    await expect(services.updateCurrentPlayerMapTitleWear({ sessionToken: "token.missing", wearMapTitles: false }, "nobody")).rejects.toThrow("UNAUTHENTICATED");
    await expect(services.getCurrentPlayerMapTitleWear({ sessionToken: "token.missing" })).resolves.toBeNull();
  });
});
