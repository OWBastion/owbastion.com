import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import EventDirectory from "./EventDirectory.vue";

const event = (overrides: Partial<RandomEvent> = {}) => ({
  eventId: "event.default",
  name: "默认事件",
  category: "增益",
  rarity: "普通",
  description: "事件说明",
  durationSeconds: null,
  cooldownSeconds: null,
  weight: null,
  appearanceProbability: null,
  categoryProbability: null,
  groupTotalWeight: null,
  groupSize: null,
  failureProbability: null,
  guaranteeProbability: null,
  globalAppearanceProbability: null,
  gameVersion: "26.0718.1",
  effectTags: [],
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
    StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
    UEmpty: { props: ["title", "description"], template: "<div>{{ title }}{{ description }}</div>" },
    UModal: { template: "<div><slot name=\"body\" /></div>" },
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
      },
      global,
    });

    expect(wrapper.text()).toContain("26.0718.1");
    expect(wrapper.text()).toContain("26.0717.1");
    expect(wrapper.findAll(".event-card h3").map((heading) => heading.text())).not.toContain("已移除事件");
    expect(wrapper.findAll(".event-card h3").map((heading) => heading.text())).toEqual(["Alpha 事件", "Zeta 事件", "旧版本事件"]);

    await wrapper.get('select[aria-label="筛选事件状态"]').setValue("removed");
    expect(wrapper.text()).toContain("已移除事件");
    expect(wrapper.text()).not.toContain("Alpha 事件");
  });
});
