import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createPlatformServices,
  pioneerExceptionIsSubmittable,
  publicTitleChallengeStatus,
  titleChallengeIsSubmittable,
} from "./index";

const createD1 = () => {
  const sqlite = new DatabaseSync(":memory:");
  const wrap = (sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind(...params: unknown[]) { bound = params; return statement; },
      async run() { const result = sqlite.prepare(sql).run(...bound); return { success: true, meta: { changes: Number(result.changes ?? 0) } }; },
      async first<T>() { return (sqlite.prepare(sql).get(...bound) as T | undefined) ?? null; },
      async all<T>() { return { results: sqlite.prepare(sql).all(...bound) as T[], success: true, meta: {} }; },
      async raw<T extends unknown[] = unknown[]>() { const statement = sqlite.prepare(sql); statement.setReturnArrays(true); return statement.all(...bound) as T[]; },
    };
    return statement;
  };
  const database = {
    prepare(sql: string) { return wrap(sql); },
    async batch(statements: Array<ReturnType<typeof wrap>>) { return Promise.all(statements.map((statement) => statement.run())); },
    withSession() { return database; },
  } as unknown as D1Database;
  return { database, sqlite };
};

const installAchievementSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE maps (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE gameplay_revisions (id TEXT PRIMARY KEY, map_id TEXT NOT NULL, lifecycle TEXT NOT NULL, legacy_map_variant TEXT);
  CREATE TABLE gameplay_revision_challenge_assignments (id TEXT PRIMARY KEY, gameplay_revision_id TEXT NOT NULL, map_id TEXT NOT NULL, challenge_family TEXT NOT NULL, challenge_id TEXT NOT NULL, enabled INTEGER NOT NULL, condition TEXT, evidence_rule TEXT, submission_mode TEXT, slot TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE title_catalog (key TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, icon_url TEXT, icon_object_key TEXT, category TEXT NOT NULL, condition TEXT NOT NULL, availability TEXT NOT NULL, scope TEXT NOT NULL, display_kind TEXT NOT NULL, color_json TEXT NOT NULL, game_version TEXT);
  CREATE TABLE title_challenges (id TEXT PRIMARY KEY, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL, evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT, status TEXT NOT NULL, introduced_version TEXT, retired_version TEXT, starts_at INTEGER, ends_at INTEGER, scope TEXT NOT NULL, map_variant TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
`);

describe("scheduled title challenge availability", () => {
  it("keeps a challenge unavailable before its start time", () => {
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 1_999)).toBe("scheduled");
    expect(titleChallengeIsSubmittable("scheduled", 2_000, 3_000, 1_999)).toBe(false);
  });

  it("makes a challenge active only inside its time window", () => {
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 2_000)).toBe("active");
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 2_999)).toBe("active");
    expect(publicTitleChallengeStatus("scheduled", 2_000, 3_000, 3_000)).toBe(null);
    expect(titleChallengeIsSubmittable("scheduled", 2_000, 3_000, 2_000)).toBe(true);
    expect(titleChallengeIsSubmittable("scheduled", 2_000, 3_000, 3_000)).toBe(false);
  });

  it("expires an end-only scheduled challenge at its end time", () => {
    expect(publicTitleChallengeStatus("scheduled", null, 3_000, 2_999)).toBe("scheduled");
    expect(publicTitleChallengeStatus("scheduled", null, 3_000, 3_000)).toBe(null);
    expect(publicTitleChallengeStatus("scheduled", null, 3_000, 3_001)).toBe(null);
  });

  it("keeps missing release metadata unavailable", () => {
    expect(publicTitleChallengeStatus("active", null, null, 2_000, null)).toBe(null);
    expect(publicTitleChallengeStatus("scheduled", 1_000, null, 2_000, null)).toBe(null);
    expect(titleChallengeIsSubmittable("active", null, null, 2_000, null)).toBe(false);
  });

  it("persists a future challenge and exposes it after release metadata is added", async () => {
    const { database, sqlite } = createD1();
    installAchievementSchema(sqlite);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const input = { contractVersion: "1" as const, titleKey: "FUTURE_TITLE", titleName: "未来称号", icon: "trophy", category: "未来系列", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual" as const, scope: "global" as const, mapIds: [], status: "scheduled" as const, gameVersion: null, categoryOverride: null, iconUrl: null };

    await expect(services.createAdminAchievement({ ...input, titleKey: "ACTIVE_WITHOUT_VERSION", status: "active" }, auth, "reject-active-without-version")).rejects.toThrow("ACHIEVEMENT_GAME_VERSION_REQUIRED");
    await expect(services.createAdminAchievement(input, auth, "create-future")).resolves.toMatchObject({ gameVersion: null, introducedVersion: null, status: "scheduled" });
    expect(sqlite.prepare("SELECT game_version, introduced_version FROM title_challenges WHERE id = 'title.FUTURE_TITLE'").get()).toEqual({ game_version: null, introduced_version: null });
    await expect(services.listChallenges({ family: "achievement" })).resolves.toEqual([]);

    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", gameVersion: "26.0901.1", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 }, auth, "add-version")).resolves.toMatchObject({ gameVersion: "26.0901.1", introducedVersion: "26.0901.1", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 });
    expect(sqlite.prepare("SELECT game_version, introduced_version FROM title_challenges WHERE id = 'title.FUTURE_TITLE'").get()).toEqual({ game_version: "26.0901.1", introduced_version: "26.0901.1" });
    await expect(services.listChallenges({ family: "achievement" })).resolves.toHaveLength(1);

    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", gameVersion: "26.0902.1", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 }, auth, "edit-release-version")).resolves.toMatchObject({ gameVersion: "26.0902.1", introducedVersion: "26.0901.1" });
    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", gameVersion: null, startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 }, auth, "reject-clearing-scheduled-version")).rejects.toThrow("ACHIEVEMENT_GAME_VERSION_REQUIRED");

    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", gameVersion: "26.0902.1", startsAt: 1, endsAt: 2 }, auth, "expire-future")).resolves.toMatchObject({ gameVersion: "26.0902.1", introducedVersion: "26.0901.1" });
    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "scheduled", gameVersion: null, startsAt: 1, endsAt: 2 }, auth, "reject-clearing-expired-version")).rejects.toThrow("ACHIEVEMENT_GAME_VERSION_REQUIRED");
  });

  it("uses a half-open Pioneer window at every boundary", () => {
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 1_999)).toBe(false);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_000)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_999)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 3_000)).toBe(false);
  });
});
