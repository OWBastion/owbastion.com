import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AchievementSubmissionCatalog from "./AchievementSubmissionCatalog.vue";

describe("AchievementSubmissionCatalog", () => {
  it("uses its title without a redundant eyebrow", async () => {
    const wrapper = await mountSuspended(AchievementSubmissionCatalog, {
      props: { maps: [], challenges: [], selectedChallengeId: "" },
    });

    expect(wrapper.get("#achievement-catalog-title").text()).toBe("选择成就目标");
    expect(wrapper.find(".catalog-heading .eyebrow").exists()).toBe(false);
  });

  it("puts challenge names first and drops constant per-card kickers", async () => {
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

    const card = wrapper.get(".achievement-card");
    expect(card.get("strong").text()).toBe("征服者");
    expect(card.find(".card-kicker").exists()).toBe(false);
  });
});
