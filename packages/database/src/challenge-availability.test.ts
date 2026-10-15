import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createPlatformServices,
  pioneerExceptionIsSubmittable,
  publicTitleChallengeStatus,
  titleChallengeIsSubmittable,
} from "./index";

const createD1 = () => createTestD1({ batchStatementMethod: "run" });
const installAchievementSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  CREATE TABLE maps (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE random_event_versions (game_version TEXT PRIMARY KEY, availability TEXT NOT NULL DEFAULT 'available', mode TEXT, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE gameplay_revisions (id TEXT PRIMARY KEY, map_id TEXT NOT NULL, lifecycle TEXT NOT NULL, legacy_map_variant TEXT);
  CREATE TABLE gameplay_revision_challenge_assignments (id TEXT PRIMARY KEY, gameplay_revision_id TEXT NOT NULL, map_id TEXT NOT NULL, challenge_family TEXT NOT NULL, challenge_id TEXT NOT NULL, enabled INTEGER NOT NULL, condition TEXT, evidence_rule TEXT, submission_mode TEXT, slot TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE title_catalog (key TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, icon_url TEXT, icon_object_key TEXT, category TEXT NOT NULL, condition TEXT NOT NULL, lifecycle TEXT NOT NULL DEFAULT 'active', public_visibility INTEGER NOT NULL DEFAULT 1, scope TEXT NOT NULL, display_kind TEXT NOT NULL, color_json TEXT NOT NULL, game_version TEXT);
  CREATE TABLE title_challenges (id TEXT PRIMARY KEY, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL, evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT, status TEXT NOT NULL, introduced_version TEXT, retired_version TEXT, starts_at INTEGER, ends_at INTEGER, scope TEXT NOT NULL, map_variant TEXT, progress_rule TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
`);

describe("title challenge availability derivation", () => {
  it("derives scheduled from an active challenge before its start time", () => {
    expect(publicTitleChallengeStatus("active", 2_000, 3_000, 1_999)).toBe("scheduled");
    expect(titleChallengeIsSubmittable("active", 2_000, 3_000, 1_999)).toBe(false);
  });

  it("makes an active challenge available only inside its time window", () => {
    expect(publicTitleChallengeStatus("active", 2_000, 3_000, 2_000)).toBe("active");
    expect(publicTitleChallengeStatus("active", 2_000, 3_000, 2_999)).toBe("active");
    expect(publicTitleChallengeStatus("active", 2_000, 3_000, 3_000)).toBe(null);
    expect(titleChallengeIsSubmittable("active", 2_000, 3_000, 2_000)).toBe(true);
    expect(titleChallengeIsSubmittable("active", 2_000, 3_000, 3_000)).toBe(false);
  });

  it("expires an active challenge at its end time", () => {
    expect(publicTitleChallengeStatus("active", null, 3_000, 2_999)).toBe("active");
    expect(publicTitleChallengeStatus("active", null, 3_000, 3_000)).toBe(null);
    expect(publicTitleChallengeStatus("active", null, 3_000, 3_001)).toBe(null);
  });

  it("derives sunsetting from an announced retirement version on an active challenge", () => {
    expect(publicTitleChallengeStatus("active", null, null, 2_000, "26.01", "26.0713.1")).toBe("sunsetting");
    expect(publicTitleChallengeStatus("active", null, 3_000, 2_999, "26.01", "26.0713.1")).toBe("sunsetting");
    expect(publicTitleChallengeStatus("active", null, 3_000, 3_000, "26.01", "26.0713.1")).toBe(null);
    expect(titleChallengeIsSubmittable("active", null, 3_000, 2_999, "26.01")).toBe(true);
  });

  it("never projects draft or archived challenges", () => {
    expect(publicTitleChallengeStatus("draft", null, null, 2_000)).toBe(null);
    expect(publicTitleChallengeStatus("archived", null, null, 2_000)).toBe(null);
    expect(publicTitleChallengeStatus("archived", 2_000, 3_000, 2_500)).toBe(null);
    expect(titleChallengeIsSubmittable("draft", null, null, 2_000)).toBe(false);
    expect(titleChallengeIsSubmittable("archived", null, null, 2_000)).toBe(false);
  });

  it("keeps missing release metadata unavailable", () => {
    expect(publicTitleChallengeStatus("active", null, null, 2_000, null)).toBe(null);
    expect(publicTitleChallengeStatus("active", 1_000, null, 2_000, null)).toBe(null);
    expect(titleChallengeIsSubmittable("active", null, null, 2_000, null)).toBe(false);
  });

  it("persists a draft challenge and exposes it after release metadata is added", async () => {
    const { database, sqlite } = createD1();
    installAchievementSchema(sqlite);
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const input = { contractVersion: "1" as const, titleKey: "FUTURE_TITLE", titleName: "未来称号", icon: "trophy", category: "未来系列", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual" as const, scope: "global" as const, mapIds: [], status: "draft" as const, gameVersion: null, categoryOverride: null, iconUrl: null };

    // An omitted version is filled in with the current one instead of making the administrator type it.
    sqlite.exec("INSERT INTO random_event_versions (game_version) VALUES ('26.0811.1'), ('26.1003.2'), ('26.1003.10'), ('2.1003.1')");
    await expect(services.createAdminAchievement({ ...input, titleKey: "ACTIVE_WITHOUT_VERSION", status: "active" }, auth, "default-active-version")).resolves.toMatchObject({ gameVersion: "26.1003.10", status: "active" });
    await expect(services.createAdminAchievement(input, auth, "create-future")).resolves.toMatchObject({ gameVersion: null, introducedVersion: null, status: "draft" });
    expect(sqlite.prepare("SELECT game_version, introduced_version FROM title_challenges WHERE id = 'title.FUTURE_TITLE'").get()).toEqual({ game_version: null, introduced_version: null });
    await expect(services.listChallenges({ family: "achievement" })).resolves.toEqual([]);

    // An active challenge under a draft title still does not project publicly;
    // the title lifecycle is a separate axis published through the catalog.
    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "active", gameVersion: "26.0901.1", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 }, auth, "add-version")).resolves.toMatchObject({ gameVersion: "26.0901.1", introducedVersion: "26.0901.1", status: "active", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 });
    expect(sqlite.prepare("SELECT game_version, introduced_version FROM title_challenges WHERE id = 'title.FUTURE_TITLE'").get()).toEqual({ game_version: "26.0901.1", introduced_version: "26.0901.1" });
    await expect(services.listChallenges({ family: "achievement" })).resolves.toEqual([]);

    await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "FUTURE_TITLE", lifecycle: "active" }, auth, "publish-title");
    await expect(services.listChallenges({ family: "achievement" })).resolves.toContainEqual(expect.objectContaining({ challengeId: "title.FUTURE_TITLE", status: "scheduled" }));

    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "active", gameVersion: "26.0902.1", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 }, auth, "edit-release-version")).resolves.toMatchObject({ gameVersion: "26.0902.1", introducedVersion: "26.0901.1" });
    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "active", gameVersion: null, startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 }, auth, "reject-clearing-active-version")).rejects.toThrow("ACHIEVEMENT_GAME_VERSION_REQUIRED");

    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "active", gameVersion: "26.0902.1", startsAt: 1, endsAt: 2 }, auth, "expire-future")).resolves.toMatchObject({ gameVersion: "26.0902.1", introducedVersion: "26.0901.1" });
    await expect(services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: "title.FUTURE_TITLE", condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: null, status: "active", gameVersion: null, startsAt: 1, endsAt: 2 }, auth, "reject-clearing-expired-version")).rejects.toThrow("ACHIEVEMENT_GAME_VERSION_REQUIRED");
  });

  it("uses a half-open Pioneer window at every boundary", () => {
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 1_999)).toBe(false);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_000)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_999)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 3_000)).toBe(false);
  });
});
