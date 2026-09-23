import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import MapDetailModal from "./MapDetailModal.vue";

const media = vi.hoisted(() => ({ desktop: true }));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useMediaQuery: () => ({ __v_isRef: true, value: media.desktop }),
}));

const ModalStub = {
  props: ["open", "title", "description", "ui"],
  template: '<section role="dialog" :aria-label="title"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /></section>',
};
const DrawerStub = {
  props: ["open", "title", "description", "direction", "shouldScaleBackground", "setBackgroundColorOnScale", "ui"],
  template: '<section role="dialog" :aria-label="title"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /></section>',
};

const map = {
  mapId: "map.samoa",
  mapName: "萨摩亚",
  gameVersion: "26.0912.1",
  difficultyRating: "T5" as const,
  mechanics: ["钩锁"],
  coverUrl: null,
  backgroundUrl: null,
};

function mountModal() {
  return mount(MapDetailModal, {
    props: {
      open: true,
      map,
      challenges: [],
      authenticated: false,
      masteryProfile: null,
      masteryLoading: false,
      masteryError: "",
      masteryHistory: null,
      masteryHistoryLoading: false,
      masteryHistoryError: "",
    },
    global: {
      stubs: {
        UModal: ModalStub,
        UDrawer: DrawerStub,
        UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        MapMasteryProfile: { template: "<div />" },
        PlayerReviewPanel: { template: "<div />" },
      },
    },
  });
}

describe("MapDetailModal", () => {
  it("keeps map details available across viewport modes", async () => {
    for (const desktop of [true, false]) {
      media.desktop = desktop;
      const wrapper = mountModal();
      await nextTick();
      const dialog = wrapper.get('[role="dialog"]');
      expect(dialog.text()).toContain("萨摩亚");
      expect(dialog.text()).toContain("地图概览");
      expect(dialog.text()).toContain("地图评级");
      wrapper.unmount();
    }
  });
});
