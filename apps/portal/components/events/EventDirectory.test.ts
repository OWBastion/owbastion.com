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
    UModal: { template: "<div data-testid=\"event-modal\"><slot name=\"description\" /><slot name=\"body\" /></div>" },
    UDrawer: { template: "<div data-testid=\"event-drawer\"><slot name=\"description\" /><slot name=\"body\" /></div>" },
    UAccordion: { props: ["items"], template: "<div><template v-for=\"item in items\" :key=\"item.label\"><slot :name=\"item.slot || 'probability'\" :item=\"item\" /></template></div>" },
    PlayerReviewPanel: { template: "<div class=\"stub-review-panel\" />" },
    ReviewSummaryBadge: { props: ["summary"], template: "<span class=\"review-summary-badge\">{{ summary?.averageRating ?? '暂无评分' }}</span>" },
  },
};

describe("EventDirectory", () => {
  it("hides removed events by default, groups by version, and sorts names", async () => {
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

    expect(wrapper.text()).toContain("26.0718.1");
    expect(wrapper.text()).toContain("26.0717.1");
    expect(wrapper.findAll(".event-card h3").map((heading) => heading.text())).not.toContain("已移除事件");
    expect(wrapper.findAll(".event-card h3").map((heading) => heading.text())).toEqual(["Alpha 事件", "Zeta 事件", "旧版本事件"]);
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

    await wrapper.get(".event-card").trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("详情说明");
    expect(wrapper.text()).toContain("普通");
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

    await wrapper.get(".event-card").trigger("click");
    await wrapper.vm.$nextTick();
    const links = wrapper.findAll(".challenge-link");
    expect(links[0]?.attributes("href") ?? links[0]?.attributes("to")).toContain("/maps?mapId=map.samoa");
    expect(links[0]?.text()).toContain("查看地图");
    expect(links[1]?.attributes("href") ?? links[1]?.attributes("to")).toContain("/achievements");
    expect(links[1]?.text()).toContain("查看成就");
    expect(wrapper.text()).not.toContain("查看成就 →");
  });
});
