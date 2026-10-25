import { afterEach, describe, expect, it } from "vitest";
import { createPlatformServices, pioneerExceptionIsSubmittable, publicTitleChallengeStatus, titleChallengeIsSubmittable } from "./index";
import { createD1, installSchema } from "./ocr-test-harness";

const fixtures: ReturnType<typeof createD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(({ sqlite }) => sqlite.close()));
describe("title challenge availability derivation", () => {
  it.each([
    ["active", 2_000, 3_000, 1_999, "scheduled", false],
    ["active", 2_000, 3_000, 2_000, "active", true],
    ["active", 2_000, 3_000, 2_999, "active", true],
    ["active", 2_000, 3_000, 3_000, null, false],
    ["active", null, 3_000, 2_999, "active", true],
    ["active", null, 3_000, 3_001, null, false],
    ["draft", null, null, 2_000, null, false],
    ["archived", 2_000, 3_000, 2_500, null, false],
  ] as const)("derives %s with window %s..%s at %s", (status, start, end, timestamp, expected, submittable) => {
    expect(publicTitleChallengeStatus(status, start, end, timestamp)).toBe(expected);
    expect(titleChallengeIsSubmittable(status, start, end, timestamp)).toBe(submittable);
  });
  it("requires release metadata and treats a retirement announcement as sunsetting", () => {
    expect(publicTitleChallengeStatus("active", null, null, 2_000, null)).toBeNull();
    expect(titleChallengeIsSubmittable("active", null, null, 2_000, null)).toBe(false);
    expect(publicTitleChallengeStatus("active", 1_000, null, 2_000, null)).toBeNull();
    expect(titleChallengeIsSubmittable("active", 1_000, null, 2_000, null)).toBe(false);
    expect(publicTitleChallengeStatus("active", null, 3_000, 2_999, "26.01")).toBe("active");
    expect(titleChallengeIsSubmittable("active", null, 3_000, 2_999, "26.01")).toBe(true);
    expect(publicTitleChallengeStatus("active", null, 3_000, 2_999, "26.01", "26.0713.1")).toBe("sunsetting");
    expect(titleChallengeIsSubmittable("active", null, 3_000, 2_999, "26.01", "26.0713.1")).toBe(true);
    expect(publicTitleChallengeStatus("active", null, null, 2_000, "26.01", "26.0713.1")).toBe("sunsetting");
    expect(publicTitleChallengeStatus("active", null, 3_000, 3_000, "26.01", "26.0713.1")).toBeNull();
  });
  it("keeps a draft title private until enabled and preserves introduction history on edits", async () => {
    const fixture = createD1(); fixtures.push(fixture); installSchema(fixture.sqlite);
    const { sqlite } = fixture;
    sqlite.prepare("INSERT INTO random_event_versions (game_version,created_at,updated_at) VALUES ('26.0811.1',1,1),('26.1003.2',1,1),('26.1003.10',1,1),('2.1003.1',1,1)").run();
    const services = createPlatformServices(fixture.database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    await services.createAdminTitle({ contractVersion: "1", titleKey: "FUTURE_TITLE", label: "未来称号", icon: "trophy", category: "未来系列", scope: "global", displayKind: "fixed", publicVisibility: true }, auth, "title");
    const challenge = await services.createAdminTitleChallenge({ contractVersion: "1", titleKey: "FUTURE_TITLE", condition: "完成挑战", submissionMode: "manual", status: "draft" }, auth, "draft");
    expect(challenge).toMatchObject({ gameVersion: null, introducedVersion: null, status: "draft" });
    const edit = { contractVersion: "1" as const, family: "achievement" as const, saveMode: "in_place" as const, challengeId: challenge.challengeId, condition: "完成挑战", evidenceRule: "完整截图", submissionMode: "manual" as const, categoryOverride: null, status: "active" as const, gameVersion: "26.0901.1", startsAt: 4_000_000_000_000, endsAt: 4_000_000_000_100 };
    await services.updateAdminChallenge(edit, auth, "release");
    expect(await services.listChallenges({ family: "achievement" })).toEqual([]);
    await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "FUTURE_TITLE", lifecycle: "active" }, auth, "enable");
    expect(await services.listChallenges({ family: "achievement" })).toContainEqual(expect.objectContaining({ challengeId: challenge.challengeId, status: "scheduled" }));
    expect(await services.updateAdminChallenge({ ...edit, gameVersion: "26.0902.1" }, auth, "version")).toMatchObject({ gameVersion: "26.0902.1", introducedVersion: "26.0901.1" });
    await expect(services.updateAdminChallenge({ ...edit, gameVersion: null }, auth, "clear")).rejects.toThrow("ACHIEVEMENT_GAME_VERSION_REQUIRED");
    expect(sqlite.prepare("SELECT introduced_version FROM title_challenges WHERE id=?").get(challenge.challengeId)).toEqual({ introduced_version: "26.0901.1" });
    const defaultsToLatest = await services.createAdminTitleChallenge({ contractVersion: "1", titleKey: "FUTURE_TITLE", condition: "另一挑战", submissionMode: "manual", status: "active" }, auth, "latest");
    expect(defaultsToLatest.gameVersion).toBe("26.1003.10");
  });
  it("lists every released public title in the gallery, marking fully ended ones", async () => {
    const fixture = createD1(); fixtures.push(fixture); installSchema(fixture.sqlite);
    fixture.sqlite.prepare("INSERT INTO random_event_versions (game_version,created_at,updated_at) VALUES ('26.0811.1',1,1)").run();
    const services = createPlatformServices(fixture.database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    const release = async (titleKey: string, category: string, publicVisibility = true) => {
      await services.createAdminTitle({ contractVersion: "1", titleKey, label: titleKey, icon: "trophy", category, scope: "global", displayKind: "fixed", publicVisibility }, auth, `title-${titleKey}`);
      const challenge = await services.createAdminTitleChallenge({ contractVersion: "1", titleKey, condition: `完成 ${titleKey}`, submissionMode: "manual", status: "active" }, auth, `challenge-${titleKey}`);
      await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey, lifecycle: "active" }, auth, `enable-${titleKey}`);
      return challenge;
    };
    await release("LIVE", "系列");
    const retired = await release("RETIRED", "系列");
    await release("DEV_ONLY", "开发保留");
    await release("HIDDEN", "系列", false);
    await services.createAdminTitle({ contractVersion: "1", titleKey: "DRAFT", label: "DRAFT", icon: "trophy", category: "系列", scope: "global", displayKind: "fixed", publicVisibility: true }, auth, "title-DRAFT");
    await services.updateAdminChallengeLifecycle({ contractVersion: "1", status: "archived", challengeId: retired.challengeId }, auth, "archive-RETIRED");

    const gallery = await services.listPublicAchievements();
    expect(gallery.map(({ titleKey, status }) => [titleKey, status])).toEqual([["LIVE", "active"], ["RETIRED", "ended"]]);
    expect((await services.listChallenges({ family: "achievement" })).map((challenge) => challenge.titleKey)).not.toContain("RETIRED");
  });
  it("uses a half-open Pioneer window at every boundary", () => {
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 1_999)).toBe(false);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_000)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_999)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 3_000)).toBe(false);
  });
});
