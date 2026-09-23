import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AchievementSubmissionCatalog from "./AchievementSubmissionCatalog.vue";

describe("AchievementSubmissionCatalog", () => {
  it("labels the achievement target choices", async () => {
    const wrapper = await mountSuspended(AchievementSubmissionCatalog, {
      props: { maps: [], challenges: [], selectedChallengeId: "" },
    });

    expect(wrapper.get("#achievement-catalog-title").text()).toBe("选择成就目标");
  });

  it("shows the challenge name and selection condition", async () => {
    const wrapper = await mountSuspended(AchievementSubmissionCatalog, {
      props: {
        maps: [],
        challenges: [{
          challengeId: "title-1",
          family: "achievement",
          type: "title_achievement",
          kind: "title_achievement",
          titleKey: "TITLE_1",
          titleName: "征服者",
          category: "称号系列",
          condition: "完成指定挑战",
          evidenceRule: "evidence",
          gameVersion: "1.0.0",
          status: "active",
          submissionMode: "manual",
          scope: "global",
        }],
        selectedChallengeId: "",
      },
    });

    const challenge = wrapper.findAll("button").find((button) => button.text().includes("征服者"))!;
    expect(challenge.text()).toContain("完成指定挑战");
  });
});
