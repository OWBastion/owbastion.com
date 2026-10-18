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
    expect(publicTitleChallengeStatus("active", null, null, 2_000, "26.01", "26.0713.1")).toBe("sunsetting");
    expect(publicTitleChallengeStatus("active", null, 3_000, 3_000, "26.01", "26.0713.1")).toBeNull();
  });
  it("keeps a draft title private until enabled and preserves introduction history on edits", async () => {
    const fixture = createD1(); fixtures.push(fixture); installSchema(fixture.sqlite);
    const { sqlite } = fixture;
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
  });
  it("uses a half-open Pioneer window at every boundary", () => {
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 1_999)).toBe(false);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_000)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 2_999)).toBe(true);
    expect(pioneerExceptionIsSubmittable(1, 2_000, 3_000, 3_000)).toBe(false);
  });
});
