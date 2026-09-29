import {
  achievementChallengeMapsSchema,
  achievementChallengesSchema,
  effectGlossaryTermsSchema,
  gameplayRevisionChallengeAssignmentsSchema,
  gameplayRevisionsSchema,
  mapMetadataSchema,
  mapTitleRewardsSchema,
  mapTitleRuleCompatSchema,
  mapTitleRuleExceptionsSchema,
  mapTitleRulesSchema,
  mapsSchema,
  playerAccountsSchema,
  randomEventMapChallengesSchema,
  randomEventTitleChallengesSchema,
  randomEventsSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const createCountingD1 = () => createTestD1({ foreignKeys: true, countStatements: true, execReturnsD1Result: true });
const installCatalogSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    ${mapsSchema}
    ${gameplayRevisionsSchema}
    ${gameplayRevisionChallengeAssignmentsSchema}
    ${mapMetadataSchema}
    CREATE TABLE title_catalog (
      key TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'award',
      icon_url TEXT,
      icon_object_key TEXT,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      availability TEXT NOT NULL,
      lifecycle TEXT NOT NULL DEFAULT 'active',
      public_visibility INTEGER NOT NULL DEFAULT 1,
      scope TEXT NOT NULL,
      display_kind TEXT NOT NULL,
      color_json TEXT NOT NULL DEFAULT 'null',
      game_version TEXT
    );
    CREATE TABLE title_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      category_override TEXT,
      condition TEXT NOT NULL,
      evidence_rule TEXT NOT NULL,
      submission_mode TEXT NOT NULL,
      game_version TEXT,
      status TEXT NOT NULL,
      introduced_version TEXT,
      retired_version TEXT,
      starts_at INTEGER,
      ends_at INTEGER,
      scope TEXT NOT NULL DEFAULT 'global',
      map_variant TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    ${achievementChallengeMapsSchema}
    ${mapTitleRewardsSchema}
    ${mapTitleRulesSchema}
    ${mapTitleRuleExceptionsSchema}
    ${mapTitleRuleCompatSchema}
    ${achievementChallengesSchema}
    ${randomEventsSchema}
    CREATE TABLE random_event_versions (
      game_version TEXT PRIMARY KEY NOT NULL,
      availability TEXT NOT NULL DEFAULT 'available'
    );
    ${randomEventMapChallengesSchema}
    ${randomEventTitleChallengesSchema}
    ${effectGlossaryTermsSchema}
    ${playerAccountsSchema}
    CREATE TABLE player_title_entitlements (player_account_id TEXT PRIMARY KEY, all_titles INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE player_title_grants (
      id TEXT PRIMARY KEY NOT NULL,
      player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      map_id TEXT REFERENCES maps(id),
      gameplay_revision_id TEXT REFERENCES gameplay_revisions(id),
      slot TEXT,
      status TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      granted_by TEXT NOT NULL,
      granted_at INTEGER NOT NULL,
      revoked_by TEXT,
      revoked_at INTEGER,
      revoke_reason TEXT
    );
    CREATE TABLE player_equipped_titles (grant_id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, equipped_at INTEGER NOT NULL);
  `);
};

const seedCatalog = (sqlite: DatabaseSync, { maps, achievements }: { maps: number; achievements: number }) => {
  const now = Date.now();
  for (let i = 0; i < maps; i += 1) {
    const mapId = `map.${i}`;
    sqlite.prepare(
      "INSERT INTO maps (id, name, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, '2026.07.15', 'active', '2026.07.15', ?, ?)",
    ).run(mapId, `地图 ${i}`, now, now);
    sqlite.prepare(
      "INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES (?, ?, 'default', NULL, NULL, NULL, '2026.07.15', ?, ?)",
    ).run(`revision:${mapId}:initial`, mapId, now, now);
    sqlite.prepare(
      "INSERT INTO map_metadata (map_id, difficulty_rating, mechanics_json, cover_url, background_url, updated_at, updated_by) VALUES (?, 'A', '[]', NULL, NULL, ?, 'test')",
    ).run(mapId, now);
  }

  for (let i = 0; i < achievements; i += 1) {
    const titleKey = `TITLE_${i}`;
    const challengeId = `title.challenge.${i}`;
    sqlite.prepare(
      "INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES (?, ?, 'award', '测试系列', '条件', 'active', 'map', 'fixed', 'null', '2026.07.15')",
    ).run(titleKey, `称号 ${i}`);
    sqlite.prepare(
      "INSERT INTO title_challenges (id, title_key, category_override, condition, evidence_rule, submission_mode, game_version, status, introduced_version, retired_version, starts_at, ends_at, scope, created_at, updated_at) VALUES (?, ?, NULL, '条件', '截图', 'manual', '2026.07.15', 'active', '2026.07.15', NULL, NULL, NULL, 'map', ?, ?)",
    ).run(challengeId, titleKey, now, now);
    // Two map associations per achievement — classic N+1 multiplier if not batched.
    const firstMap = `map.${i % maps}`;
    const secondMap = `map.${(i + 1) % maps}`;
    sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES (?, ?)").run(challengeId, firstMap);
    sqlite.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, created_at, updated_at) VALUES (?, ?, ?, 'title_challenge', ?, 1, ?, ?)")
      .run(`assignment:${challengeId}:${firstMap}`, `revision:${firstMap}:initial`, firstMap, challengeId, now, now);
    if (secondMap !== firstMap) {
      sqlite.prepare("INSERT INTO achievement_challenge_maps (challenge_id, map_id) VALUES (?, ?)").run(challengeId, secondMap);
      sqlite.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, created_at, updated_at) VALUES (?, ?, ?, 'title_challenge', ?, 1, ?, ?)")
        .run(`assignment:${challengeId}:${secondMap}`, `revision:${secondMap}:initial`, secondMap, challengeId, now, now);
    }
  }

  // One global title for getAgentTitle direct path.
  sqlite.prepare(
    "INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('GLOBAL_ONE', '全局称号', 'award', '测试系列', '条件', 'active', 'global', 'fixed', 'null', '2026.07.15')",
  ).run();
  sqlite.prepare(
    "INSERT INTO title_challenges (id, title_key, category_override, condition, evidence_rule, submission_mode, game_version, status, introduced_version, retired_version, starts_at, ends_at, scope, created_at, updated_at) VALUES ('title.global.one', 'GLOBAL_ONE', NULL, '条件', '截图', 'manual', '2026.07.15', 'active', '2026.07.15', NULL, NULL, NULL, 'global', ?, ?)",
  ).run(now, now);

  // Map-scoped reward title on map.0
  sqlite.prepare(
    "INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('PIONEER_0', '开拓者0', 'trophy', '社区贡献系列', '地图', 'active', 'map', 'map_pioneer', 'null', '2026.07.15')",
  ).run();
  sqlite.prepare(
    "INSERT INTO map_title_rewards (map_id, slot, title_key, pioneer_prefixes_json) VALUES ('map.0', 'pioneer', 'PIONEER_0', '[\"前缀\"]')",
  ).run();

  // Player grant projection fixture
  sqlite.prepare(
    "INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.1', '1001', 'Tester', 'tester', 0, 'active', ?, ?)",
  ).run(now, now);
  sqlite.prepare(
    "INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.1', 'player.1', 'GLOBAL_ONE', NULL, NULL, 'active', 'manual', 'src.1', 'admin', ?)",
  ).run(now);

  // Public events for list baseline
  for (let i = 0; i < 5; i += 1) {
    sqlite.prepare(
      "INSERT INTO random_events (id, name, category, rarity, description, duration_seconds, cooldown_seconds, weight, game_version, effect_tags_json, release_status, created_at, updated_at) VALUES (?, ?, '战斗', '普通', '描述', 30, 10, 1, '2026.07.15', '[]', 'implemented', ?, ?)",
    ).run(`event.${i}`, `事件 ${i}`, now, now);
  }
};

describe("catalog query budgets", () => {
  const runWithSize = (maps: number, achievements: number) => {
    const { database, sqlite, resetCount, getCount } = createCountingD1();
    installCatalogSchema(sqlite);
    seedCatalog(sqlite, { maps, achievements });
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

    resetCount();
    return { services, auth, sqlite, getCount, resetCount };
  };

  it("keeps admin achievement list statement count bounded as achievements grow", async () => {
    const small = runWithSize(5, 8);
    await small.services.listAdminChallenges({ family: "achievement" }, small.auth);
    const smallCount = small.getCount();

    const large = runWithSize(5, 40);
    await large.services.listAdminChallenges({ family: "achievement" }, large.auth);
    const largeCount = large.getCount();

    expect(smallCount).toBeGreaterThan(0);
    expect(largeCount).toBeLessThanOrEqual(8);
    // Constant (or near-constant) vs achievement count — not O(N).
    expect(largeCount).toBeLessThanOrEqual(smallCount + 2);
  });

  it("keeps every title catalog row and records challenge linkage", async () => {
    const { services, auth } = runWithSize(2, 2);

    const response = await services.listAdminChallenges({}, auth);
    const catalog = response.items.filter((item) => item.family === "title_catalog");

    expect(catalog.filter((item) => item.titleKey === "GLOBAL_ONE")).toEqual([
      expect.objectContaining({ titleKey: "GLOBAL_ONE", hasChallenge: true }),
    ]);
    expect(catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ titleKey: "PIONEER_0", hasChallenge: false }),
    ]));
  });

  it("keeps map-scoped title list statement count bounded as title count grows", async () => {
    const small = runWithSize(5, 8);
    await small.services.listTitles({ mapId: "map.0" });
    const smallCount = small.getCount();

    const large = runWithSize(5, 40);
    await large.services.listTitles({ mapId: "map.0" });
    const largeCount = large.getCount();

    expect(largeCount).toBeLessThanOrEqual(8);
    expect(largeCount).toBeLessThanOrEqual(smallCount + 2);
  });

  it("uses a direct bounded path for single-title lookup without map enumeration", async () => {
    const large = runWithSize(20, 30);
    const title = await large.services.getAgentTitle({ titleKey: "GLOBAL_ONE" });
    expect(title?.titleKey).toBe("GLOBAL_ONE");
    // Direct catalog key lookup must not scale with map count (old path: 1 + 1 + maps).
    expect(large.getCount()).toBeLessThanOrEqual(4);

    large.resetCount();
    const mapTitle = await large.services.getAgentTitle({ titleKey: "PIONEER_0" });
    expect(mapTitle?.titleKey).toBe("PIONEER_0");
    expect(mapTitle?.scope).toBe("map");
    expect(large.getCount()).toBeLessThanOrEqual(6);
  });

  it("projects unreleased global titles to Agents without exposing them to players", async () => {
    const { services, sqlite } = runWithSize(2, 2);
    const timestamp = Date.now();
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, scope, display_kind, color_json, game_version) VALUES ('FUTURE_TITLE', '未来称号', 'award', '未来系列', '完成挑战', 'active', 'global', 'fixed', 'null', NULL)").run();
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, lifecycle, scope, display_kind, color_json, game_version) VALUES ('RETIRED_TITLE', '历史称号', 'award', '历史系列', '历史条件', 'retired', 'retired', 'global', 'fixed', 'null', NULL)").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, category_override, condition, evidence_rule, submission_mode, game_version, status, introduced_version, retired_version, starts_at, ends_at, scope, created_at, updated_at) VALUES ('title.future', 'FUTURE_TITLE', NULL, '完成挑战', '截图', 'manual', NULL, 'scheduled', NULL, NULL, NULL, NULL, 'global', ?, ?)").run(timestamp, timestamp);

    const buildProjection = await services.listAgentTitles({ page: 1, pageSize: 20 });
    expect(buildProjection.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ titleKey: "FUTURE_TITLE", scope: "global", gameVersion: null }),
      expect.objectContaining({ titleKey: "RETIRED_TITLE", scope: "global", availability: "retired", gameVersion: null }),
    ]));
    await expect(services.getAgentTitle({ titleKey: "FUTURE_TITLE" })).resolves.toEqual(
      expect.objectContaining({ titleKey: "FUTURE_TITLE", scope: "global", gameVersion: null }),
    );
    await expect(services.getAgentTitle({ titleKey: "RETIRED_TITLE" })).resolves.toEqual(
      expect.objectContaining({ titleKey: "RETIRED_TITLE", scope: "global", availability: "retired", gameVersion: null }),
    );
    const search = await services.searchAgentContent({ page: 1, pageSize: 20, query: "未来称号", kind: "title" });
    expect(search.items).toContainEqual({ kind: "title", id: "FUTURE_TITLE", name: "未来称号", summary: "完成挑战" });
    const retiredSearch = await services.searchAgentContent({ page: 1, pageSize: 20, query: "历史称号", kind: "title" });
    expect(retiredSearch.items).toContainEqual({ kind: "title", id: "RETIRED_TITLE", name: "历史称号", summary: "历史条件" });

    const playerTitles = await services.listTitles({});
    expect(playerTitles.map((title) => title.titleKey)).not.toContain("FUTURE_TITLE");
    const playerChallenges = await services.listChallenges({ family: "achievement" });
    expect(playerChallenges.map((challenge) => challenge.challengeId)).not.toContain("title.future");
  });

  it("bounds representative catalog operation statement ceilings", async () => {
    const ctx = runWithSize(10, 25);
    const { services, auth, getCount, resetCount } = ctx;

    resetCount();
    await services.listMaps();
    await services.listAdminChallenges({ family: "map" }, auth);
    expect(getCount()).toBeLessThanOrEqual(12);

    resetCount();
    await services.listAdminChallenges({ family: "achievement" }, auth);
    expect(getCount()).toBeLessThanOrEqual(8);

    resetCount();
    await services.listRandomEvents({});
    expect(getCount()).toBeLessThanOrEqual(12);

    resetCount();
    await services.listTitles({ mapId: "map.0" });
    expect(getCount()).toBeLessThanOrEqual(8);

    resetCount();
    await services.getAgentTitle({ titleKey: "GLOBAL_ONE" });
    expect(getCount()).toBeLessThanOrEqual(4);

    resetCount();
    await services.listAgentPlayerTitleGrants({ page: 1, pageSize: 20 });
    expect(getCount()).toBeLessThanOrEqual(4);

    resetCount();
    await services.getAgentMap({ mapId: "map.0" });
    expect(getCount()).toBeLessThanOrEqual(2);

    resetCount();
    await services.getAgentAchievement({ challengeId: "title.global.one" });
    expect(getCount()).toBeLessThanOrEqual(3);
  });

  it("projects equipped retired grants while excluding revoked and map grants", async () => {
    const { services, sqlite } = runWithSize(2, 2);
    const timestamp = Date.now();
    sqlite.prepare("UPDATE title_catalog SET availability = 'retired', lifecycle = 'retired' WHERE key = 'GLOBAL_ONE'").run();
    sqlite.prepare("INSERT INTO title_catalog (key, label, icon, category, condition, availability, lifecycle, scope, display_kind, color_json, game_version) VALUES ('GLOBAL_RETIRED', '历史通用称号', 'award', '测试系列', '条件', 'retired', 'retired', 'global', 'fixed', 'null', '2026.07.15')").run();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.2', '1002', 'Revoked Holder', 'revoked holder', 0, 'active', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.retired', 'player.1', 'GLOBAL_RETIRED', NULL, NULL, 'active', 'historical', 'source.retired', 'admin', ?), ('grant.revoked', 'player.2', 'GLOBAL_ONE', NULL, NULL, 'revoked', 'historical', 'source.revoked', 'admin', ?), ('grant.map', 'player.1', 'PIONEER_0', 'map.0', 'pioneer', 'active', 'submission', 'source.map', 'admin', ?)").run(timestamp, timestamp, timestamp);

    sqlite.prepare("INSERT INTO player_equipped_titles VALUES ('grant.retired', 'player.1', ?)").run(timestamp);

    const response = await services.listAgentPlayerTitleGrants({ page: 1, pageSize: 20 });
    expect(response.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: "1001", titleKeys: ["GLOBAL_RETIRED"] }),
    ]));
    expect(response.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ playerId: "1002" })]));
  });
});
