import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import EventDirectory from "./EventDirectory.vue";
import type { RandomEvent } from "~/types/random-event";

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useMediaQuery: () => ({ __v_isRef: true, value: false }),
  usePreferredReducedMotion: () => ({ __v_isRef: true, value: "reduce" }),
}));
vi.mock("~/composables/useReviewSummaries", () => ({
  useReviewSummaries: () => ({ summaryFor: () => null, loading: { value: false }, error: { value: "" }, refresh: () => {} }),
}));

const compositeEvent: RandomEvent = {
  eventId: "event.composite", name: "命运掷骰", category: "复合", rarity: "R", description: "复合事件说明",
  durationSeconds: 30, cooldownSeconds: 10, weight: 1, gameVersion: "5.0", eventGroup: null,
  effectTags: ["标记", "减速"], effectAnnotations: [{ tag: "减速", term: { key: "effect.slow", nameZh: "减速", aliases: [], category: "减益", summary: "减速效果", definition: "降低移动速度。", rules: [], sourceVersion: "5.0" } }],
  releaseStatus: "implemented", archived: false, challenges: [],
  outcomes: [
    { position: 0, name: "顺风", polarity: "buff", description: "增益结果说明", effectTags: ["标记"] },
    { position: 1, name: "逆风", polarity: "debuff", description: "减益结果说明", effectTags: ["减速"] },
  ],
};

const OverlayStub = { props: ["open"], template: '<div v-if="open"><slot name="body" /></div>' };
const mountDirectory = () => mount(EventDirectory, {
  attachTo: document.body,
  props: { events: [compositeEvent], authenticated: false },
  global: {
    stubs: {
      UModal: OverlayStub,
      UDrawer: OverlayStub,
      UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
      PlayerReviewPanel: { template: "<div />" },
      EffectGlossaryTooltip: { props: ["annotation"], template: '<span class="glossary-term">{{ annotation.term.nameZh }}</span>' },
      NuxtLink: { props: ["to"], template: '<a :href="to"><slot /></a>' },
    },
  },
});

describe("event directory outcomes", () => {
  it("shows a composite event's outcomes with polarity, description, and annotated tags", async () => {
    const wrapper = mountDirectory();
    await wrapper.findAll("button.event-row").find((row) => row.text().includes("命运掷骰"))!.trigger("click");

    const detail = wrapper.get(".detail");
    expect(detail.find("section[aria-label='结果项']").exists()).toBe(true);
    const text = detail.text();
    expect(text).toContain("顺风");
    expect(text).toContain("逆风");
    expect(text).toContain("增益");
    expect(text).toContain("减益");
    expect(text).toContain("增益结果说明");
    expect(text).toContain("减益结果说明");
    // The debuff outcome's 减速 tag resolves through the shared glossary annotation.
    expect(detail.get("section[aria-label='结果项'] .glossary-term").text()).toBe("减速");
  });
});
