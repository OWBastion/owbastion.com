import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

/**
 * Minimal D1Database shim over node:sqlite for catalog query-budget tests.
 * Counts statement executions (all / first / run / raw / batch items).
 */
const createCountingD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  let statementCount = 0;

  const wrapStatement = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) {
        bound = params;
        return statement;
      },
      async first<T>() {
        statementCount += 1;
        const row = sqlite.prepare(sql).get(...bound) as T | undefined;
        return row ?? null;
      },
      async all<T>() {
        statementCount += 1;
        const results = sqlite.prepare(sql).all(...bound) as T[];
        return { results, success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: results.length, rows_written: 0, last_row_id: 0, changed_db: false } };
      },
      async run() {
        statementCount += 1;
        const info = sqlite.prepare(sql).run(...bound);
        return {
          success: true,
          meta: {
            changes: Number(info.changes ?? 0),
            duration: 0,
            size_after: 0,
            rows_read: 0,
            rows_written: Number(info.changes ?? 0),
            last_row_id: Number(info.lastInsertRowid ?? 0),
            changed_db: true,
          },
        };
      },
      async raw<T extends unknown[] = unknown[]>() {
        statementCount += 1;
        const prepared = sqlite.prepare(sql);
        prepared.setReturnArrays(true);
        return prepared.all(...bound) as T[];
      },
    };
    return statement;
  };

  const database = {
    prepare(sql: string) {
      return wrapStatement(sql);
    },
    async batch(statements: Array<ReturnType<typeof wrapStatement>>) {
      const results = [];
      for (const statement of statements) {
        results.push(await statement.all());
      }
      return results;
    },
    async exec(sql: string) {
      statementCount += 1;
      sqlite.exec(sql);
      return [{ results: [], success: true, meta: { changes: 0, duration: 0, size_after: 0, rows_read: 0, rows_written: 0, last_row_id: 0, changed_db: false } }];
    },
    withSession() {
      return database;
    },
  } as unknown as D1Database;

  return {
    database,
    sqlite,
    resetCount: () => {
      statementCount = 0;
    },
    getCount: () => statementCount,
  };
};

const installCatalogSchema = (sqlite: DatabaseSync) => {
  sqlite.exec(`
    CREATE TABLE maps (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE gameplay_revisions (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL REFERENCES maps(id),
      lifecycle TEXT NOT NULL,
      legacy_map_variant TEXT,
      copied_from_revision_id TEXT,
      reset_reason TEXT,
      game_version TEXT NOT NULL,
      spatial_config_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE gameplay_revision_challenge_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      gameplay_revision_id TEXT NOT NULL REFERENCES gameplay_revisions(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      challenge_family TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      condition TEXT,
      evidence_rule TEXT,
      submission_mode TEXT,
      slot TEXT,
      starts_at INTEGER,
      ends_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE map_metadata (
      map_id TEXT PRIMARY KEY NOT NULL REFERENCES maps(id),
      difficulty_rating TEXT,
      mechanics_json TEXT NOT NULL DEFAULT '[]',
      cover_url TEXT,
      background_url TEXT,
      updated_at INTEGER NOT NULL,
      updated_by TEXT NOT NULL
    );
    CREATE TABLE title_catalog (
      key TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'award',
      icon_url TEXT,
      icon_object_key TEXT,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      availability TEXT NOT NULL,
      scope TEXT NOT NULL,
      display_kind TEXT NOT NULL,
      color_json TEXT NOT NULL DEFAULT 'null',
      game_version TEXT NOT NULL
    );
    CREATE TABLE title_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      category_override TEXT,
      condition TEXT NOT NULL,
      evidence_rule TEXT NOT NULL,
      submission_mode TEXT NOT NULL,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      starts_at INTEGER,
      ends_at INTEGER,
      scope TEXT NOT NULL DEFAULT 'global',
      map_variant TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE achievement_challenge_maps (
      challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE,
      map_id TEXT NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
      PRIMARY KEY (challenge_id, map_id)
    );
    CREATE TABLE map_title_rewards (
      map_id TEXT NOT NULL REFERENCES maps(id),
      slot TEXT NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      pioneer_prefixes_json TEXT NOT NULL,
      PRIMARY KEY (map_id, slot)
    );
    CREATE TABLE map_title_rules (
      id TEXT PRIMARY KEY NOT NULL,
      title_key TEXT NOT NULL REFERENCES title_catalog(key),
      kind TEXT NOT NULL,
      condition TEXT NOT NULL,
      evidence_rule TEXT NOT NULL,
      submission_mode TEXT NOT NULL DEFAULT 'manual',
      display_kind TEXT NOT NULL,
      slot TEXT,
      map_variant TEXT,
      default_scope TEXT NOT NULL DEFAULT 'all_active',
      status TEXT NOT NULL DEFAULT 'active',
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE map_title_rule_exceptions (
      id TEXT PRIMARY KEY NOT NULL,
      rule_id TEXT NOT NULL REFERENCES map_title_rules(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      enabled INTEGER NOT NULL DEFAULT 1,
      condition TEXT,
      evidence_rule TEXT,
      submission_mode TEXT,
      slot TEXT,
      starts_at INTEGER,
      ends_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE map_title_rule_compat (
      legacy_challenge_id TEXT NOT NULL,
      rule_id TEXT NOT NULL REFERENCES map_title_rules(id),
      map_id TEXT NOT NULL REFERENCES maps(id),
      is_standard_instance INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (legacy_challenge_id, map_id)
    );
    CREATE TABLE achievement_challenges (
      id TEXT PRIMARY KEY NOT NULL,
      map_id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      difficulty TEXT,
      condition TEXT NOT NULL DEFAULT '',
      evidence_rule TEXT NOT NULL DEFAULT '',
      submission_mode TEXT NOT NULL DEFAULT 'manual',
      reward_title_key TEXT,
      game_version TEXT NOT NULL,
      status TEXT NOT NULL,
      introduced_version TEXT NOT NULL,
      retired_version TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE random_events (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      rarity TEXT NOT NULL,
      description TEXT NOT NULL,
      duration_seconds INTEGER,
      cooldown_seconds REAL,
      weight REAL,
      game_version TEXT NOT NULL,
      effect_tags_json TEXT NOT NULL DEFAULT '[]',
      release_status TEXT NOT NULL,
      archived_at INTEGER,
      archived_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE random_event_map_challenges (
      event_id TEXT NOT NULL REFERENCES random_events(id),
      challenge_id TEXT NOT NULL REFERENCES achievement_challenges(id),
      PRIMARY KEY (event_id, challenge_id)
    );
    CREATE TABLE random_event_title_challenges (
      event_id TEXT NOT NULL REFERENCES random_events(id),
      challenge_id TEXT NOT NULL REFERENCES title_challenges(id),
      PRIMARY KEY (event_id, challenge_id)
    );
    CREATE TABLE effect_glossary_terms (
      key TEXT PRIMARY KEY NOT NULL,
      name_zh TEXT NOT NULL,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      category TEXT NOT NULL,
      summary TEXT NOT NULL,
      definition TEXT NOT NULL,
      rules_json TEXT NOT NULL DEFAULT '[]',
      source_version TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE player_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      player_id TEXT NOT NULL,
      player_name TEXT NOT NULL,
      normalized_player_name TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      banned_at INTEGER,
      banned_by TEXT,
      ban_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
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
    return { services, auth, getCount, resetCount };
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
});
