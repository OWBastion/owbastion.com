import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { leaderboardPlayerKey } from "@owbastion/domain";
import { leaderboardResponseSchema, leaderboardPlayerSummarySchema, currentPlayerLeaderboardRankSchema, publicPlayerProfileSchema } from "@owbastion/contracts";
import { createD1 } from "./ocr-test-harness";
import { playerHandlesSchema } from "../test/schema";
import { createPlatformServices } from "./index";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const fixture = () => {
  const harness = createD1();
  harness.sqlite.exec(`
    CREATE TABLE player_accounts (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, player_name TEXT NOT NULL, normalized_player_name TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, public_profile INTEGER NOT NULL DEFAULT 1, hide_battletag INTEGER NOT NULL DEFAULT 0, banned_at INTEGER, banned_by TEXT, ban_reason TEXT, leaderboard_key TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE UNIQUE INDEX player_accounts_leaderboard_key_idx ON player_accounts (leaderboard_key);
    CREATE TABLE portal_sessions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE maps (id TEXT PRIMARY KEY, name TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL, introduced_version TEXT NOT NULL, retired_version TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE gameplay_revisions (id TEXT PRIMARY KEY, map_id TEXT NOT NULL REFERENCES maps(id), lifecycle TEXT NOT NULL, legacy_map_variant TEXT, mode TEXT, copied_from_revision_id TEXT, reset_reason TEXT, game_version TEXT NOT NULL, spatial_config_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE mastery_runs (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, source_submission_id TEXT NOT NULL, map_id TEXT NOT NULL, gameplay_revision_id TEXT NOT NULL, map_variant TEXT, difficulty TEXT, game_version TEXT, run_code TEXT, completion_duration_seconds INTEGER, deaths INTEGER, skips INTEGER, event_counters_json TEXT, acceptance_source TEXT, accepted_at INTEGER NOT NULL, status TEXT NOT NULL, invalidated_at INTEGER, invalidated_by TEXT, invalidation_reason TEXT, xp_rule_version TEXT, xp_input_snapshot_json TEXT, awarded_xp INTEGER NOT NULL, created_at INTEGER);
    CREATE TABLE title_catalog (key TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, icon_url TEXT, icon_object_key TEXT, category TEXT NOT NULL, condition TEXT NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'active', public_visibility INTEGER NOT NULL DEFAULT 1, scope TEXT NOT NULL, display_kind TEXT NOT NULL, color_json TEXT, game_version TEXT NOT NULL);
    CREATE TABLE map_title_rewards (map_id TEXT NOT NULL REFERENCES maps(id), slot TEXT NOT NULL, title_key TEXT NOT NULL, pioneer_prefixes_json TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (map_id, slot));
    CREATE TABLE player_title_grants (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, title_key TEXT NOT NULL, map_id TEXT, gameplay_revision_id TEXT, slot TEXT, status TEXT NOT NULL, source_type TEXT NOT NULL, source_id TEXT NOT NULL, granted_by TEXT NOT NULL, granted_at INTEGER NOT NULL, revoked_by TEXT, revoked_at INTEGER, revoke_reason TEXT, completion_id TEXT, revocation_type TEXT);
    CREATE TABLE seasons (id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL, public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE player_equipped_titles (grant_id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, equipped_at INTEGER NOT NULL);
  `);
  harness.sqlite.exec(playerHandlesSchema);
  const { sqlite } = harness;
  const now = Date.now();
  const addPlayer = (id: string, name: string, publicProfile = 1) => {
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, public_profile, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 'active', ?, ?, ?)").run(id, id, name, name.toLowerCase(), publicProfile, now, now);
    sqlite.prepare("INSERT INTO portal_sessions VALUES (?, ?, ?, ?)").run(`session.${id}`, id, hash(`token.${id}`), now + 60_000);
  };
  const addMap = (id: string, name: string) => sqlite.prepare("INSERT INTO maps VALUES (?, ?, 'v1', 'active', 'v1', NULL, ?, ?)").run(id, name, now, now);
  const addRevision = (id: string, mapId: string, lifecycle: string) => sqlite.prepare("INSERT INTO gameplay_revisions VALUES (?, ?, ?, NULL, NULL, NULL, NULL, 'v1', NULL, ?, ?)").run(id, mapId, lifecycle, now, now);
  const addRun = (id: string, playerAccountId: string, mapId: string, revisionId: string, awardedXp: number, acceptedAt: number, status = "active", difficulty = "困难") =>
    sqlite.prepare("INSERT INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, difficulty, accepted_at, status, awarded_xp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, playerAccountId, `sub.${id}`, mapId, revisionId, difficulty, acceptedAt, status, awardedXp);
  const addTitle = (key: string, scope = "global", category = "成就", publicVisibility = 1) =>
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, scope, display_kind, game_version, public_visibility) VALUES (?, ?, 'award', ?, '条件', ?, 'fixed', 'v1', ?)").run(key, key, category, scope, publicVisibility);
  const addGrant = (id: string, playerAccountId: string, titleKey: string, grantedAt: number, status = "active", mapId: string | null = null) =>
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, status, source_type, source_id, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, 'manual', ?, 'admin', ?)").run(id, playerAccountId, titleKey, mapId, status, `src.${id}`, grantedAt);
  const addSeason = (id: string, startsAt: number, endsAt: number, status = "active", isPublic = 1) =>
    sqlite.prepare("INSERT INTO seasons (id, name, starts_at, ends_at, status, public, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, `赛季 ${id}`, startsAt, endsAt, status, isPublic, now, now);
  return { ...harness, services: createPlatformServices(harness.database), now, addSeason, addPlayer, addMap, addRevision, addRun, addTitle, addGrant };
};

describe("public leaderboard projections", () => {
  it.each([
    { titleKey: "WILD_DEV", publicProfile: 1, titleVisibility: 1 },
    { titleKey: "ARCHITECT", publicProfile: 1, titleVisibility: 1 },
    { titleKey: "MAINTAINER", publicProfile: 0, titleVisibility: 1 },
    { titleKey: "FUTURE_DEV_TITLE", publicProfile: 0, titleVisibility: 0 },
  ])("excludes holders of any developer-reserved title from every ranking ($titleKey)", async ({ titleKey, publicProfile, titleVisibility }) => {
    const { services, sqlite, addPlayer, addMap, addRevision, addRun, addTitle, addGrant, addSeason } = fixture();
    addPlayer("dev", "Developer", publicProfile); addPlayer("player", "Player");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addSeason("season", 0, 2000);
    addRun("dev.run", "dev", "map.a", "rev.a1", 1000, 100);
    addRun("player.run", "player", "map.a", "rev.a1", 100, 100);
    addTitle(titleKey, "global", "开发保留", titleVisibility);
    addTitle("T1"); addTitle("T2");
    addGrant("dev.title", "dev", titleKey, 100);
    addGrant("dev.t1", "dev", "T1", 100);
    addGrant("dev.t2", "dev", "T2", 100);
    addGrant("player.t1", "player", "T1", 100);
    const boards = [
      { board: "achievement" as const },
      { board: "mastery" as const },
      { board: "mastery" as const, mapId: "map.a" },
      { board: "mastery" as const, seasonId: "season" },
      { board: "mastery" as const, seasonId: "season", mapId: "map.a" },
    ];
    for (const input of boards) {
      const page = await services.getPublicLeaderboard({ ...input, page: 1, pageSize: 1 });
      expect(page).toMatchObject({ total: 1, hasMore: false });
      expect(page?.items).toEqual([expect.objectContaining({ rank: 1, player: expect.objectContaining({ displayName: "Player" }) })]);
      expect(await services.getCurrentPlayerLeaderboardRank({ ...input, sessionToken: "token.dev" })).toMatchObject({ rank: null, gapToNextRank: null });
      expect(await services.getCurrentPlayerLeaderboardRank({ ...input, sessionToken: "token.player" })).toMatchObject({ rank: 1, gapToNextRank: null });
    }
    if (publicProfile) {
      expect(await services.getPublicLeaderboardPlayer({ playerKey: await leaderboardPlayerKey("dev") })).toMatchObject({ boards: { mastery: null, achievement: null } });
    }
    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked' WHERE id = 'dev.title'").run();
    for (const input of boards) {
      expect(await services.getPublicLeaderboard({ ...input, page: 1, pageSize: 1 })).toMatchObject({ total: 2, hasMore: true });
      expect(await services.getCurrentPlayerLeaderboardRank({ ...input, sessionToken: "token.dev" })).toMatchObject({ rank: 1 });
    }
  });

  it("sums Mastery XP across maps and revisions with deterministic tie-breaks", async () => {
    const { services, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta"); addPlayer("p3", "Gamma");
    addMap("map.a", "Map A"); addMap("map.b", "Map B");
    addRevision("rev.a1", "map.a", "default"); addRevision("rev.a0", "map.a", "archived"); addRevision("rev.b1", "map.b", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 300, 100);
    addRun("r2", "p1", "map.a", "rev.a0", 200, 50);
    addRun("r3", "p1", "map.b", "rev.b1", 100, 150, "active", "专家");
    addRun("r4", "p2", "map.a", "rev.a1", 600, 90);
    addRun("r5", "p3", "map.b", "rev.b1", 600, 80);
    const board = leaderboardResponseSchema.parse(await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 20 }));
    expect(board.ruleVersion).toBe("leaderboard.v1");
    expect(board.total).toBe(3);
    expect(board.items.map((item) => [item.player?.displayName, item.rank, item.score, item.reachedAt, item.runCount, item.topDifficulty])).toEqual([
      ["Gamma", 1, 600, 80, 1, "困难"],
      ["Beta", 2, 600, 90, 1, "困难"],
      ["Alpha", 3, 600, 150, 3, "专家"],
    ]);
    for (const item of board.items) {
      expect(item.player?.playerKey).toMatch(/^[0-9a-f]{24}$/);
      expect(item.player?.boards).toBeUndefined();
    }
  });

  it("scopes per-map boards to the map's current default revision only", async () => {
    const { services, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta");
    addMap("map.a", "Map A"); addMap("map.b", "Map B");
    addRevision("rev.a1", "map.a", "default"); addRevision("rev.a0", "map.a", "archived"); addRevision("rev.b1", "map.b", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 300, 100);
    addRun("r2", "p1", "map.a", "rev.a0", 900, 90);
    addRun("r3", "p2", "map.b", "rev.b1", 500, 80);
    const board = await services.getPublicLeaderboard({ board: "mastery", mapId: "map.a", page: 1, pageSize: 20 });
    expect(board).toMatchObject({ mapId: "map.a", mapGameVersion: "v1", total: 1 });
    expect(board?.items[0]).toMatchObject({ rank: 1, score: 300, runCount: 1, topDifficulty: "困难", player: { displayName: "Alpha" } });
    expect(await services.getPublicLeaderboard({ board: "mastery", mapId: "map.missing", page: 1, pageSize: 20 })).toBeNull();
    expect(await services.getPublicLeaderboard({ board: "achievement", mapId: "map.a", page: 1, pageSize: 20 })).toBeNull();
  });

  it("counts owned global Titles while excluding map, hidden, and revoked Titles", async () => {
    const { services, addPlayer, addTitle, addGrant, addMap, addRevision, addRun, now } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta");
    addTitle("T1"); addTitle("T2"); addTitle("T3");
    addTitle("MAP_T", "map");
    addTitle("HIDDEN_T", "global", "成就", 0);
    addGrant("g1", "p1", "T1", now - 30);
    addGrant("g2", "p1", "T2", now - 20);
    addGrant("g3", "p1", "T3", now - 10, "revoked");
    addGrant("g4", "p1", "MAP_T", now, "active", "map.a");
    addGrant("g6", "p1", "HIDDEN_T", now);
    addGrant("g7", "p2", "T1", now - 5);
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 450, now - 40, "active", "传奇");
    const board = await services.getPublicLeaderboard({ board: "achievement", page: 1, pageSize: 20 });
    expect(board?.items.map((item) => [item.player?.displayName, item.rank, item.score])).toEqual([
      ["Alpha", 1, 2],
      ["Beta", 2, 1],
    ]);
    expect(board?.items[0]).toMatchObject({ reachedAt: now - 20, masteryXp: 450, latestTitle: { titleKey: "T2" } });
    expect(board?.items[1]).toMatchObject({ masteryXp: 0, latestTitle: { titleKey: "T1" } });
  });

  it("withholds the identity block and inlines headline standings for non-public Players", async () => {
    const { services, addPlayer, addMap, addRevision, addRun, addTitle, addGrant, now } = fixture();
    addPlayer("p1", "Alpha", 0); addPlayer("p2", "Beta");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 500, 100);
    addRun("r2", "p2", "map.a", "rev.a1", 300, 90);
    addTitle("T1"); addGrant("g1", "p1", "T1", now);
    const board = await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 20 });
    const anonymous = board?.items.find((item) => item.player === null);
    expect(anonymous).toMatchObject({ rank: 1, score: 500, boards: { mastery: { rank: 1, score: 500 }, achievement: { rank: 1, score: 1 } } });
    expect(board?.items.find((item) => item.player !== null)?.boards).toBeUndefined();
    const achievementBoard = await services.getPublicLeaderboard({ board: "achievement", page: 1, pageSize: 20 });
    const anonymousTitleRow = achievementBoard?.items.find((item) => item.player === null);
    expect(anonymousTitleRow).toMatchObject({ rank: 1, score: 1, masteryXp: 500, boards: { mastery: { rank: 1, score: 500 } } });
    expect(anonymousTitleRow?.latestTitle).toBeUndefined();
  });

  it("drops invalidated Runs and revoked Grants from every board and restores them", async () => {
    const { services, sqlite, addPlayer, addMap, addRevision, addRun, addTitle, addGrant, now } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 500, 100);
    addRun("r2", "p2", "map.a", "rev.a1", 300, 90);
    addTitle("T1"); addGrant("g1", "p1", "T1", now);
    expect((await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 20 }))?.total).toBe(2);
    sqlite.prepare("UPDATE mastery_runs SET status = 'invalidated' WHERE id = 'r1'").run();
    const afterInvalidate = await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 20 });
    expect(afterInvalidate?.items.map((item) => item.player?.displayName)).toEqual(["Beta"]);
    sqlite.prepare("UPDATE mastery_runs SET status = 'active' WHERE id = 'r1'").run();
    expect((await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 20 }))?.total).toBe(2);
    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked' WHERE id = 'g1'").run();
    expect((await services.getPublicLeaderboard({ board: "achievement", page: 1, pageSize: 20 }))?.total).toBe(0);
  });

  it("resolves the public summary for a public Player and redacts a non-public one", async () => {
    const { services, addPlayer, addMap, addRevision, addRun, addTitle, addGrant, addRun: run, sqlite, now } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("hidden", "Hidden", 0);
    addMap("map.a", "Map A"); addMap("map.b", "Map B");
    addRevision("rev.a1", "map.a", "default"); addRevision("rev.a0", "map.a", "archived"); addRevision("rev.b1", "map.b", "default");
    run("r1", "p1", "map.a", "rev.a1", 300, 100);
    run("r2", "p1", "map.a", "rev.a0", 900, 90);
    run("r3", "p1", "map.b", "rev.b1", 200, 80);
    addMap("map.retired", "Map Retired"); addRevision("rev.r1", "map.retired", "default");
    sqlite.prepare("UPDATE maps SET status = 'retired' WHERE id = 'map.retired'").run();
    addMap("map.nodefault", "Map No Default"); addRevision("rev.n0", "map.nodefault", "archived");
    addTitle("T1"); addTitle("MAP_T", "map"); addTitle("CONQ_A", "map"); addTitle("DOM_A", "map");
    addGrant("g1", "p1", "T1", now);
    addGrant("g2", "p1", "MAP_T", now, "active", "map.a");
    addGrant("g3", "p1", "CONQ_A", now, "active", "map.a");
    addGrant("g4", "p1", "DOM_A", now, "active", "map.a");
    // A classic-version title is granted on a historical revision; it still
    // groups under its map with no slot and adds no current-revision XP.
    addTitle("CLASSIC_B", "map"); addRevision("rev.b0", "map.b", "archived");
    addGrant("g5", "p1", "CLASSIC_B", now, "active", "map.b");
    sqlite.prepare("UPDATE player_title_grants SET gameplay_revision_id = 'rev.b0' WHERE id = 'g5'").run();
    sqlite.prepare("INSERT INTO map_title_rewards (map_id, slot, title_key) VALUES ('map.a', 'conqueror', 'CONQ_A'), ('map.a', 'dominator', 'DOM_A')").run();
    sqlite.prepare("INSERT INTO player_equipped_titles VALUES ('g1', 'p1', ?)").run(now);
    const summary = leaderboardPlayerSummarySchema.parse(await services.getPublicLeaderboardPlayer({ playerKey: await leaderboardPlayerKey("p1") }));
    expect(summary.publicProfile).toBe(true);
    expect(summary.player).toMatchObject({ displayName: "Alpha", equippedTitle: { titleKey: "T1" } });
    expect(summary.boards).toEqual({ mastery: { rank: 1, score: 1400 }, achievement: { rank: 1, score: 1 } });
    expect(summary.perMapXp).toEqual([
      { mapId: "map.a", mapName: "Map A", gameVersion: "v1", xp: 300, runCount: 1 },
      { mapId: "map.b", mapName: "Map B", gameVersion: "v1", xp: 200, runCount: 1 },
    ]);
    // Only open maps with a current default revision count toward the total.
    expect(summary.mapCount).toBe(2);
    expect(summary.titles).toEqual({
      map: [
        { titleKey: "CONQ_A", label: "CONQ_A", icon: "award", mapId: "map.a", mapName: "Map A", slot: "conqueror" },
        { titleKey: "DOM_A", label: "DOM_A", icon: "award", mapId: "map.a", mapName: "Map A", slot: "dominator" },
        { titleKey: "MAP_T", label: "MAP_T", icon: "award", mapId: "map.a", mapName: "Map A", slot: null },
        { titleKey: "CLASSIC_B", label: "CLASSIC_B", icon: "award", mapId: "map.b", mapName: "Map B", slot: null },
      ],
      general: [{ titleKey: "T1", label: "T1", icon: "award" }],
    });
    const redacted = await services.getPublicLeaderboardPlayer({ playerKey: await leaderboardPlayerKey("hidden") });
    expect(redacted).toEqual({ contractVersion: "1", publicProfile: false, player: null, boards: null, perMapXp: null, mapCount: null, titles: null });
    expect(await services.getPublicLeaderboardPlayer({ playerKey: "0".repeat(24) })).toBeNull();
  });

  it("reports the current Player's rank, score, and gap to the rank above", async () => {
    const { services, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta"); addPlayer("p3", "Gamma");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 500, 100);
    addRun("r2", "p2", "map.a", "rev.a1", 300, 90);
    addRun("r3", "p3", "map.a", "rev.a1", 100, 80);
    const rank = currentPlayerLeaderboardRankSchema.parse(await services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.p2", board: "mastery" }));
    expect(rank).toMatchObject({ board: "mastery", ruleVersion: "leaderboard.v1", rank: 2, score: 300, reachedAt: 90, gapToNextRank: 200 });
    expect(await services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.p1", board: "mastery" })).toMatchObject({ rank: 1, gapToNextRank: null });
    expect(await services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.p1", board: "achievement" })).toMatchObject({ rank: null, score: 0, reachedAt: null, gapToNextRank: null });
    expect(await services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.p2", board: "mastery", mapId: "map.a" })).toMatchObject({ rank: 2, mapId: "map.a" });
    await expect(services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.p2", board: "mastery", mapId: "map.missing" })).rejects.toThrow("MAP_NOT_FOUND");
    expect(await services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.unknown", board: "mastery" })).toBeNull();
  });

  it("paginates board pages", async () => {
    const { services, addPlayer, addMap, addRevision, addRun } = fixture();
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    for (let index = 0; index < 5; index += 1) {
      addPlayer(`p${index}`, `P${index}`);
      addRun(`r${index}`, `p${index}`, "map.a", "rev.a1", (5 - index) * 100, 100 - index);
    }
    const page2 = await services.getPublicLeaderboard({ board: "mastery", page: 2, pageSize: 2 });
    expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 5, hasMore: true });
    expect(page2?.items.map((item) => item.rank)).toEqual([3, 4]);
    expect(await services.getPublicLeaderboard({ board: "mastery", page: 3, pageSize: 2 })).toMatchObject({ hasMore: false });
  });
});

describe("public player profiles by handle", () => {
  const withHandle = (sqlite: ReturnType<typeof fixture>["sqlite"], playerId: string, handle: string, status = "active") =>
    sqlite.prepare("INSERT INTO player_handles (id, player_account_id, handle, status, requested_at) VALUES (?, ?, ?, ?, 1)").run(`h.${playerId}.${handle}`, playerId, handle, status);

  it("resolves only an active handle of a public Player, with the public summary and no private data", async () => {
    const { services, sqlite, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("p1", "Alpha"); addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addRun("r1", "p1", "map.a", "rev.a1", 120, 100);
    withHandle(sqlite, "p1", "alpha");
    const profile = await services.getPublicPlayerByHandle({ handle: "alpha" });
    expect(publicPlayerProfileSchema.parse(profile)).toMatchObject({ handle: "alpha", publicProfile: true, player: { displayName: "Alpha" }, boards: { mastery: { rank: 1, score: 120 } } });
    expect(JSON.stringify(profile)).not.toMatch(/"p1"|playerKey|playerId|player_account/);
    await expect(services.getPublicPlayerByHandle({ handle: "missing" })).resolves.toBeNull();
  });

  it("includes per-day active run counts on the UTC+8 calendar within the activity window", async () => {
    const { services, sqlite, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta"); addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    withHandle(sqlite, "p1", "alpha");
    // 2026-10-06T16:30Z and 2026-10-07T15:00Z are both 2026-10-07 in UTC+8; 2026-10-06T15:59Z is 2026-10-06.
    const recent = Date.now() - 2 * 86_400_000;
    const day = new Date(recent).toISOString().slice(0, 10);
    const at = (iso: string) => Date.parse(iso) - Date.parse("2026-10-07T00:00:00Z") + Date.parse(`${day}T00:00:00Z`);
    addRun("r1", "p1", "map.a", "rev.a1", 10, at("2026-10-06T16:30:00Z"));
    addRun("r2", "p1", "map.a", "rev.a1", 10, at("2026-10-07T15:00:00Z"));
    addRun("r3", "p1", "map.a", "rev.a1", 10, at("2026-10-06T15:59:00Z"));
    addRun("r4", "p1", "map.a", "rev.a1", 10, at("2026-10-07T01:00:00Z"), "invalidated");
    addRun("r5", "p2", "map.a", "rev.a1", 10, at("2026-10-07T01:00:00Z"));
    addRun("r6", "p1", "map.a", "rev.a1", 10, 100);
    const previous = new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const profile = await services.getPublicPlayerByHandle({ handle: "alpha" });
    expect(publicPlayerProfileSchema.parse(profile).activity).toEqual([{ date: previous, runCount: 1 }, { date: day, runCount: 2 }]);
  });

  it.each([
    ["pending-only", (sqlite: ReturnType<typeof fixture>["sqlite"]) => withHandle(sqlite, "p1", "alpha", "pending")],
    ["rejected", (sqlite: ReturnType<typeof fixture>["sqlite"]) => withHandle(sqlite, "p1", "alpha", "rejected")],
    ["publicProfile off", (sqlite: ReturnType<typeof fixture>["sqlite"]) => { withHandle(sqlite, "p1", "alpha"); sqlite.prepare("UPDATE player_accounts SET public_profile = 0").run(); }],
    ["banned", (sqlite: ReturnType<typeof fixture>["sqlite"]) => { withHandle(sqlite, "p1", "alpha"); sqlite.prepare("UPDATE player_accounts SET status = 'banned'").run(); }],
    ["cleared", (sqlite: ReturnType<typeof fixture>["sqlite"]) => { withHandle(sqlite, "p1", "alpha"); sqlite.prepare("DELETE FROM player_handles").run(); }],
  ])("does not resolve a %s profile", async (_label, arrange) => {
    const { services, sqlite, addPlayer } = fixture();
    addPlayer("p1", "Alpha");
    arrange(sqlite);
    await expect(services.getPublicPlayerByHandle({ handle: "alpha" })).resolves.toBeNull();
  });

  it("follows publicProfile changes and a released handle", async () => {
    const { services, sqlite, addPlayer } = fixture();
    addPlayer("p1", "Alpha"); withHandle(sqlite, "p1", "alpha");
    await expect(services.getPublicPlayerByHandle({ handle: "alpha" })).resolves.not.toBeNull();
    sqlite.prepare("UPDATE player_accounts SET public_profile = 0").run();
    await expect(services.getPublicPlayerByHandle({ handle: "alpha" })).resolves.toBeNull();
    sqlite.prepare("UPDATE player_accounts SET public_profile = 1").run();
    sqlite.prepare("DELETE FROM player_handles").run();
    await expect(services.getPublicPlayerByHandle({ handle: "alpha" })).resolves.toBeNull();
  });

  it("replaces a hidden BattleTag name with the handle, or anonymous, while keeping public detail", async () => {
    const { services, sqlite, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("shown", "Shown"); addPlayer("hidden", "Hidden"); addPlayer("secret", "Secret");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    for (const [index, id] of ["shown", "hidden", "secret"].entries()) addRun(`r.${id}`, id, "map.a", "rev.a1", 100 - index, 100);
    withHandle(sqlite, "hidden", "hiddenone");
    sqlite.prepare("UPDATE player_accounts SET hide_battletag = 1 WHERE id IN ('hidden', 'secret')").run();
    const page = leaderboardResponseSchema.parse(await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 10 }));
    expect(page.items.map((item) => item.player?.displayName)).toEqual(["Shown", "hiddenone", "匿名玩家"]);
    expect(JSON.stringify(page)).not.toMatch(/Hidden|Secret/);
    expect(await services.getPublicPlayerByHandle({ handle: "hiddenone" })).toMatchObject({ publicProfile: true, player: { displayName: "hiddenone" }, boards: { mastery: { rank: 2 } } });
  });

  it("links leaderboard rows only for public Players with an active handle", async () => {
    const { services, sqlite, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("pub", "Public"); addPlayer("anon", "Anon", 0); addPlayer("none", "Nohandle"); addPlayer("pend", "Pending");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    for (const [index, id] of ["pub", "anon", "none", "pend"].entries()) addRun(`r.${id}`, id, "map.a", "rev.a1", 100 - index, 100);
    withHandle(sqlite, "pub", "pubone"); withHandle(sqlite, "anon", "anonone"); withHandle(sqlite, "pend", "pendone", "pending");
    const page = await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 10 });
    expect(leaderboardResponseSchema.parse(page).items.map((item) => item.player?.handle ?? null)).toEqual(["pubone", null, null, null]);
    expect(JSON.stringify(page)).not.toContain("anonone");
  });
});

describe("seasonal mastery boards", () => {
  const seasonId = "11111111-1111-4111-8111-111111111111";
  const rows = (board: Awaited<ReturnType<ReturnType<typeof fixture>["services"]["getPublicLeaderboard"]>>) => board!.items.map((item) => [item.player?.displayName, item.rank, item.score]);

  it("ranks only Runs inside the Season window from the same derivation", async () => {
    const { services, addSeason, addPlayer, addMap, addRevision, addRun, sqlite } = fixture();
    addPlayer("p1", "Alpha"); addPlayer("p2", "Beta");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default"); addRevision("rev.a0", "map.a", "archived");
    addSeason(seasonId, 1000, 2000);
    addRun("r1", "p1", "map.a", "rev.a1", 100, 999);
    addRun("r2", "p1", "map.a", "rev.a1", 200, 1000);
    addRun("r3", "p2", "map.a", "rev.a1", 250, 2000);
    addRun("r4", "p2", "map.a", "rev.a1", 900, 2001);
    addRun("r5", "p2", "map.a", "rev.a0", 50, 1500);
    const season = leaderboardResponseSchema.parse(await services.getPublicLeaderboard({ board: "mastery", seasonId, page: 1, pageSize: 20 }));
    expect(season.seasonId).toBe(seasonId);
    expect(rows(season)).toEqual([["Beta", 1, 300], ["Alpha", 2, 200]]);
    expect(rows(await services.getPublicLeaderboard({ board: "mastery", page: 1, pageSize: 20 }))).toEqual([["Beta", 1, 1200], ["Alpha", 2, 300]]);
    expect(rows(await services.getPublicLeaderboard({ board: "mastery", mapId: "map.a", seasonId, page: 1, pageSize: 20 }))).toEqual([["Beta", 1, 250], ["Alpha", 2, 200]]);

    sqlite.prepare("UPDATE mastery_runs SET status = 'invalidated' WHERE id = 'r3'").run();
    expect(rows(await services.getPublicLeaderboard({ board: "mastery", seasonId, page: 1, pageSize: 20 }))).toEqual([["Alpha", 1, 200], ["Beta", 2, 50]]);

    const own = currentPlayerLeaderboardRankSchema.parse(await services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.p2", board: "mastery", seasonId }));
    expect(own).toMatchObject({ seasonId, rank: 2, score: 50, gapToNextRank: 150 });
  });

  it("keeps anonymous headline standings on the all-time board", async () => {
    const { services, addSeason, addPlayer, addMap, addRevision, addRun } = fixture();
    addPlayer("p1", "Alpha", 0); addPlayer("p2", "Beta");
    addMap("map.a", "Map A"); addRevision("rev.a1", "map.a", "default");
    addSeason(seasonId, 1000, 2000);
    addRun("r1", "p1", "map.a", "rev.a1", 100, 1500);
    addRun("r2", "p1", "map.a", "rev.a1", 900, 500);
    addRun("r3", "p2", "map.a", "rev.a1", 400, 1500);
    const board = await services.getPublicLeaderboard({ board: "mastery", seasonId, page: 1, pageSize: 20 });
    const anonymous = board!.items.find((item) => item.player === null)!;
    expect(anonymous).toMatchObject({ rank: 2, score: 100, boards: { mastery: { rank: 1, score: 1000 } } });
  });

  it("does not expose draft, hidden, scheduled, or unknown Seasons", async () => {
    const { services, addSeason, now } = fixture();
    addSeason("draft", 1000, 2000, "draft");
    addSeason("hidden", 3000, 4000, "active", 0);
    addSeason("later", now + 10_000, now + 20_000);
    for (const id of ["draft", "hidden", "later", "missing"]) {
      await expect(services.getPublicLeaderboard({ board: "mastery", seasonId: id, page: 1, pageSize: 20 })).rejects.toThrow("SEASON_NOT_FOUND");
    }
    await expect(services.getCurrentPlayerLeaderboardRank({ sessionToken: "token.none", board: "mastery", seasonId: "hidden" })).resolves.toBeNull();
    expect((await services.listPublicSeasons()).items).toEqual([]);
  });
});
