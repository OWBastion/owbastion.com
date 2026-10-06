import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import RunDayHeatmap from "./RunDayHeatmap.vue";

// 2026-10-07 11:30 UTC+8.
const nowMs = Date.UTC(2026, 9, 7, 3, 30);

describe("RunDayHeatmap", () => {
  it("renders a labeled 53-week run calendar with counts and a summary", async () => {
    const wrapper = await mountSuspended(RunDayHeatmap, {
      props: { days: [{ date: "2026-10-07", runCount: 3 }], now: nowMs },
    });

    expect(wrapper.findAll("td")).toHaveLength(53 * 7);
    expect(wrapper.text()).toContain("过去一年 3 次通关 · 1 天有记录");
    const recorded = wrapper.get('td[aria-label="10月7日 · 3 次通关"]');
    expect(recorded.attributes("class")).toContain("level-2");
    expect(wrapper.get('td[aria-label="10月6日 · 无记录"]').exists()).toBe(true);
    // 2026-10-07 is a Wednesday: the remaining four cells this week are unlabeled future days.
    expect(wrapper.findAll("td.is-future")).toHaveLength(4);
    expect(wrapper.text()).toContain("同一次通关只计一次，不代表游玩时长");
    expect(wrapper.findAll(".run-heatmap-legend i")).toHaveLength(5);
  });

  it("shows month labels and an honest empty summary", async () => {
    const wrapper = await mountSuspended(RunDayHeatmap, { props: { days: [], now: nowMs } });

    expect(wrapper.text()).toContain("过去一年暂无通关记录");
    expect(wrapper.text()).toContain("10月");
    expect(wrapper.findAll("td.level-1, td.level-2, td.level-3, td.level-4")).toHaveLength(0);
  });
});
