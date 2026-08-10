import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MasteryMapOverview from "./MasteryMapOverview.vue";

describe("MasteryMapOverview", () => {
  it("keeps the player center compact and links each profile to its map detail", async () => {
    const wrapper = await mountSuspended(MasteryMapOverview, {
      props: {
        mapNames: { "map.samoa": "萨摩亚", "map.havana": "哈瓦那" },
        profiles: [
          { mapId: "map.samoa", totalXp: 225, verifiedRunCount: 1, difficultyStats: [], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 225, highestCompletedDifficulty: "地狱", recentRuns: [{ runId: "00000000-0000-4000-8000-000000000001", mapId: "map.samoa", mapVariant: null, difficulty: "地狱", completionDurationSeconds: 640, deaths: 1, skips: 0, awardedXp: 225, acceptedAt: 1_000, status: "active" }] },
          { mapId: "map.havana", totalXp: 120, verifiedRunCount: 3, difficultyStats: [], lowestDeaths: 2, fewestSkips: 1, highestSingleRunXp: 120, highestCompletedDifficulty: "专家", recentRuns: [] },
        ],
      },
      global: { stubs: { NuxtLink: { props: ["to"], template: "<a :href='to'><slot /></a>" }, UEmpty: { template: "<div />" } } },
    });

    expect(wrapper.text()).toContain("萨摩亚");
    expect(wrapper.text()).toContain("地狱");
    expect(wrapper.find('a[href="/maps?mapId=map.samoa"]').exists()).toBe(true);
    expect(wrapper.find('a[href="/maps?mapId=map.havana"]').exists()).toBe(true);
  });
});
