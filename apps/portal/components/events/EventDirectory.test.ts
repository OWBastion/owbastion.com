import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import EventDirectory from "./EventDirectory.vue";

const portalApi = vi.fn(async (path: string) => {
  if (path.startsWith("/v1/public/reviews/summaries?")) return { contractVersion: "1" as const, targetType: "event" as const, items: [{ targetType: "event" as const, targetId: "event.alpha", averageRating: 4.5, reviewCount: 4, ratingDistribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 }, sampleInsufficient: false }] };
  throw new Error(`Unexpected request: ${path}`);
});

mockNuxtImport("usePortalApi", () => () => portalApi);

const event = (overrides: Partial<RandomEvent> = {}) => ({
  eventId: "event.default",
  name: "默认事件",
  category: "增益",
  rarity: "普通",
  description: "事件说明",
  durationSeconds: null,
  cooldownSeconds: null,
  weight: null,
  gameVersion: "26.0718.1",
  eventGroup: null,
  effectTags: [],
  effectAnnotations: [],
  releaseStatus: "implemented" as const,
  archived: false,
  challenges: [],
  ...overrides,
});

type RandomEvent = import("~/types/random-event").RandomEvent;

const global = {
  stubs: {
    UInput: { props: ["modelValue"], emits: ["update:modelValue"], template: "<input :value=\"modelValue\" />" },
    USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: "<select :value=\"modelValue\" :aria-label=\"$attrs['aria-label']\" @change=\"$emit('update:modelValue', $event.target.value)\"><option v-for=\"item in items\" :key=\"item.value\" :value=\"item.value\">{{ item.label }}</option></select>" },
    UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
    EffectGlossaryTooltip: { props: ["annotation"], template: "<span>{{ annotation.term.nameZh }}</span>" },
    StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
    UEmpty: { props: ["title", "description"], template: "<div>{{ title }}{{ description }}</div>" },
    UModal: { template: '<div role="dialog" aria-label="事件详情"><slot name="description" /><slot name="body" /></div>' },
    UDrawer: { template: '<div role="dialog" aria-label="事件详情"><slot name="description" /><slot name="body" /></div>' },
    UAccordion: { props: ["items"], template: "<div><template v-for=\"item in items\" :key=\"item.label\"><slot :name=\"item.slot || 'probability'\" :item=\"item\" /></template></div>" },
    PlayerReviewPanel: { template: "<div class=\"stub-review-panel\" />" },
    ReviewSummaryBadge: { props: ["summary"], template: "<span class=\"review-summary-badge\">{{ summary?.averageRating ?? '暂无评分' }}</span>" },
  },
};

describe("EventDirectory", () => {
  it("hides removed events by default, lists the newest version first without forced grouping", async () => {
    const wrapper = await mountSuspended(EventDirectory, {
      props: {
        events: [
          event({ eventId: "event.zeta", name: "Zeta 事件", gameVersion: "26.0718.1" }),
          event({ eventId: "event.alpha", name: "Alpha 事件", gameVersion: "26.0718.1" }),
          event({ eventId: "event.removed", name: "已移除事件", releaseStatus: "removed" }),
          event({ eventId: "event.old", name: "旧版本事件", gameVersion: "26.0717.1" }),
        ],
        authenticated: false,
      },
      global,
    });

    expect(wrapper.findAll("h2")).toHaveLength(0);
    expect(wrapper.text()).toContain("3 项事件");
    expect(wrapper.findAll("h3").map((heading) => heading.text())).not.toContain("已移除事件");
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual(["Alpha 事件", "Zeta 事件", "旧版本事件"]);
    expect(portalApi.mock.calls.filter(([path]) => path.startsWith("/v1/public/reviews/summaries?")).length).toBe(1);
    expect(portalApi.mock.calls.find(([path]) => path.startsWith("/v1/public/reviews/summaries?"))?.[0]).toContain("event.removed");
    expect(wrapper.text()).toContain("暂无评分");

    await wrapper.get('select[aria-label="筛选事件状态"]').setValue("removed");
    expect(wrapper.text()).toContain("已移除事件");
    expect(wrapper.text()).not.toContain("Alpha 事件");
  });

  it("opens event detail in a responsive overlay after hydration", async () => {
    const wrapper = await mountSuspended(EventDirectory, {
      props: {
        events: [event({ eventId: "event.alpha", name: "Alpha 事件", description: "详情说明" })],
        authenticated: false,
      },
      global,
    });

    await wrapper.findAll("button").find((button) => button.text().includes("Alpha 事件"))!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[role="dialog"]').text()).toContain("详情说明");
    expect(wrapper.get('[role="dialog"]').text()).toContain("普通");
  });

  it("renders no empty rarity artifacts for weightless events", async () => {
    const wrapper = await mountSuspended(EventDirectory, {
      props: {
        events: [event({ eventId: "event.weightless", name: "无权重事件", rarity: "" })],
        authenticated: false,
      },
      global,
    });

    expect(wrapper.find('[aria-label="稀有度"]').exists()).toBe(false);
    expect(wrapper.find(".event-rarity").exists()).toBe(false);

    await wrapper.findAll("button").find((button) => button.text().includes("无权重事件"))!.trigger("click");
    await wrapper.vm.$nextTick();
    const headerTags = wrapper.get('[role="dialog"] .detail-header-tags');
    expect(headerTags.findAll("span").map((badge) => badge.text())).toEqual(["增益", "26.0718.1"]);
  });

  it("sends map-family challenges to the map directory", async () => {
    const wrapper = await mountSuspended(EventDirectory, {
      props: {
        events: [event({
          eventId: "event.alpha",
          name: "Alpha 事件",
          challenges: [
            { challengeId: "map.samoa.hell", family: "map", gameplayRevisionId: "revision:map.samoa:initial", name: "地狱难度通关", mapId: "map.samoa" },
            { challengeId: "title.lucky", family: "achievement", titleName: "幸运星" },
          ],
        })],
        authenticated: false,
      },
      global,
    });

    await wrapper.findAll("button").find((button) => button.text().includes("Alpha 事件"))!.trigger("click");
    await wrapper.vm.$nextTick();
    const links = wrapper.findAll("a").filter((link) => link.text().includes("查看地图") || link.text().includes("查看成就"));
    expect(links[0]?.attributes("href") ?? links[0]?.attributes("to")).toContain("/maps?mapId=map.samoa");
    expect(links[0]?.text()).toContain("查看地图");
    expect(links[1]?.attributes("href") ?? links[1]?.attributes("to")).toContain("/achievements");
    expect(links[1]?.text()).toContain("查看成就");
    expect(wrapper.text()).not.toContain("查看成就 →");
  });

  const chipButton = (wrapper: Awaited<ReturnType<typeof mountSuspended>>, group: string, label: string) => wrapper.findAll(`[aria-label="${group}"] button`).find((button) => button.text().startsWith(label))!;
  const names = (wrapper: Awaited<ReturnType<typeof mountSuspended>>) => wrapper.findAll("h3").map((heading) => heading.text());
  const groupedEvents = [
    event({ eventId: "event.a", name: "梭哈", eventGroup: "赌徒", effectTags: ["心之钢", "永久"], weight: 1 }),
    event({ eventId: "event.b", name: "心之钢", eventGroup: "赌徒", effectTags: ["心之钢"], weight: 0.5 }),
    event({ eventId: "event.c", name: "先知", eventGroup: "作弊", effectTags: ["永久"], weight: 2 }),
    event({ eventId: "event.d", name: "无组事件", weight: 1 }),
  ];

  it("filters by event group and common effect chips with live counts", async () => {
    const wrapper = await mountSuspended(EventDirectory, { props: { events: groupedEvents, authenticated: false }, global });

    expect(chipButton(wrapper, "事件组", "赌徒").text()).toContain("2");
    await chipButton(wrapper, "事件组", "赌徒").trigger("click");
    expect(names(wrapper).sort()).toEqual(["心之钢", "梭哈"]);
    expect(chipButton(wrapper, "事件组", "赌徒").attributes("aria-pressed")).toBe("true");
    // The effect chip now counts only inside the selected group.
    expect(chipButton(wrapper, "常见效果", "永久").text()).toContain("1");

    await chipButton(wrapper, "常见效果", "永久").trigger("click");
    expect(names(wrapper)).toEqual(["梭哈"]);
    expect(wrapper.text()).toContain("1 项事件");

    await wrapper.findAll("button").find((button) => button.text() === "清除条件")!.trigger("click");
    expect(names(wrapper)).toHaveLength(4);
  });

  it("groups by event group with the ungrouped events last", async () => {
    const wrapper = await mountSuspended(EventDirectory, { props: { events: groupedEvents, authenticated: false }, global });

    await wrapper.get('select[aria-label="分组方式"]').setValue("group");
    expect(wrapper.findAll("h2").map((heading) => heading.text())).toEqual(["赌徒", "作弊", "未分组"]);
  });

  it("shows relative probability on cards, sorts by it, and explains it in the detail", async () => {
    const wrapper = await mountSuspended(EventDirectory, { props: { events: groupedEvents, authenticated: false }, global });

    expect(wrapper.findAll(".probability-meter")).toHaveLength(4);
    await wrapper.get('select[aria-label="排序方式"]').setValue("probability");
    expect(names(wrapper)[0]).toBe("先知");

    await wrapper.findAll("button").find((button) => button.text().includes("先知"))!.trigger("click");
    await wrapper.vm.$nextTick();
    const detail = wrapper.get('[role="dialog"] .detail-probability');
    expect(detail.text()).toContain("次事件抽取出现 1 次");
    expect(detail.text()).toContain("第 1 / 4 位");
  });
});
