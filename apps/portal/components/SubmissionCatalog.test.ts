import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import SubmissionCatalog from "./SubmissionCatalog.vue";

describe("SubmissionCatalog", () => {
  it("lets a player select a manual achievement challenge", async () => {
    const wrapper = await mountSuspended(SubmissionCatalog, {
      props: {
        maps: [],
        mapChallenges: [],
        achievementChallenges: [{
          challengeId: "title.challenge",
          family: "achievement",
          type: "title_achievement",
          kind: "title_achievement",
          titleKey: "CHALLENGE",
          titleName: "勇者称号",
          category: "战绩",
          condition: "完成目标",
          evidenceRule: "完整截图",
          gameVersion: "26.0912.1",
          status: "active",
          submissionMode: "manual",
        }],
        selectedChallengeId: "",
      },
      global: {
        stubs: {
          UTabs: {
            props: ["modelValue", "items"],
            emits: ["update:modelValue"],
            template: '<div role="tablist" aria-label="挑战类型"><button v-for="item in items" :key="item.value" role="tab" :aria-selected="modelValue === item.value" @click="$emit(\'update:modelValue\', item.value)">{{ item.label }}</button></div>',
          },
        },
      },
    });

    await wrapper.findAll('button[role="tab"]').find((tab) => tab.text().includes("成就挑战"))!.trigger("click");
    expect(wrapper.text()).toContain("勇者称号");
    const challenge = wrapper.findAll("button").find((button) => button.text().includes("勇者称号"))!;
    await challenge.trigger("click");
    expect(wrapper.emitted("select")).toEqual([[{ challengeId: "title.challenge" }]]);
  });
});
