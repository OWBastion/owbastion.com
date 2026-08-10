import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MasteryRunHistory from "./MasteryRunHistory.vue";

const history = {
  contractVersion: "1" as const,
  profiles: [],
  runs: [
    { runId: "00000000-0000-4000-8000-000000000001", mapId: "map.samoa", mapVariant: null, difficulty: "地狱" as const, completionDurationSeconds: 640, deaths: 1, skips: 0, awardedXp: 225, acceptedAt: 1_000, status: "active" as const },
    { runId: "00000000-0000-4000-8000-000000000002", mapId: "map.samoa", mapVariant: null, difficulty: "传奇" as const, completionDurationSeconds: 720, deaths: 2, skips: 1, awardedXp: 180, acceptedAt: 900, status: "invalidated" as const, runCode: "1234-5678-9012" },
  ],
  page: 1,
  pageSize: 2,
  total: 3,
  hasMore: true,
};

const stubs = {
  UButton: { props: ["label", "disabled"], emits: ["click"], template: "<button type='button' :disabled='disabled' @click='$emit(\"click\")'>{{ label }}</button>" },
  UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
  UEmpty: { props: ["title"], template: "<div>{{ title }}</div>" },
  UAlert: { props: ["title", "description"], template: "<div><strong>{{ title }}</strong><p>{{ description }}</p><slot name='actions' /></div>" },
  USkeleton: { template: "<div />" },
};

describe("MasteryRunHistory", () => {
  it("shows bounded player history without a run code and requests the next page", async () => {
    const wrapper = await mountSuspended(MasteryRunHistory, { props: { mapName: "萨摩亚", history: history as never, loading: false, error: "" }, global: { stubs } });

    expect(wrapper.text()).toContain("萨摩亚 · 地狱");
    expect(wrapper.text()).toContain("225 XP");
    expect(wrapper.text()).toContain("已失效");
    expect(wrapper.text()).not.toContain("1234-5678-9012");
    const next = wrapper.findAll("button").find((button) => button.text() === "下一页");
    await next!.trigger("click");
    expect(wrapper.emitted("change-page")).toEqual([[2]]);
  });

  it("keeps a retry path when the private history request fails", async () => {
    const wrapper = await mountSuspended(MasteryRunHistory, { props: { mapName: "萨摩亚", history: null, loading: false, error: "暂时不可用" }, global: { stubs } });
    expect(wrapper.text()).toContain("无法读取通关记录");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("retry")).toHaveLength(1);
  });
});
