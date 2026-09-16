import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import EffectGlossaryTooltip from "./EffectGlossaryTooltip.vue";
import type { EffectAnnotation } from "~/types/random-event";

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useMediaQuery: () => ({ __v_isRef: true, value: false }),
}));

const annotation: EffectAnnotation = {
  tag: "slow",
  term: {
    key: "slow",
    nameZh: "减速",
    aliases: [],
    category: "减益",
    summary: "降低移动速度。",
    definition: "在持续时间内降低移动速度。",
    rules: ["不叠加"],
    sourceVersion: "26.0912.1",
  },
};

const PopoverStub = {
  props: ["open", "dismissible"],
  emits: ["update:open"],
  template: '<div @click="$emit(\'update:open\', !open)"><slot /><div v-if="open" data-testid="glossary-tooltip"><slot name="content" /></div></div>',
};

describe("EffectGlossaryTooltip", () => {
  it("opens on tap and does not forward the click to a parent card", async () => {
    const parentClick = vi.fn();
    const wrapper = mount({
      components: { EffectGlossaryTooltip },
      setup: () => ({ annotation }),
      template: '<button type="button" class="event-card" @click="onCard"><EffectGlossaryTooltip :annotation="annotation" /></button>',
      methods: { onCard: parentClick },
    }, {
      global: {
        stubs: {
          UPopover: PopoverStub,
          UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        },
      },
    });

    const term = wrapper.get(".effect-glossary-term");
    await term.trigger("click");

    expect(wrapper.get('[data-testid="glossary-tooltip"]').text()).toContain("降低移动速度。");
    expect(term.attributes("aria-expanded")).toBe("true");
    expect(parentClick).not.toHaveBeenCalled();
  });
});
