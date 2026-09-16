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
  template: '<section data-overlay="modal"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /></section>',
};
const DrawerStub = {
  props: ["open", "title", "description", "direction", "shouldScaleBackground", "setBackgroundColorOnScale", "ui"],
  template: '<section data-overlay="drawer"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /></section>',
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
  it("uses a scroll-constrained desktop modal without scaling the page", async () => {
    media.desktop = true;
    const wrapper = mountModal();
    await nextTick();
    expect(wrapper.get('[data-overlay="modal"]').text()).toContain("萨摩亚");
    expect(wrapper.findComponent(ModalStub).props("ui").content).toContain("overlay-sheet--modal");
    expect(wrapper.findComponent(ModalStub).props("ui").body).toContain("overlay-sheet__body");
  });

  it("uses a bottom sheet that does not scale the page background", async () => {
    media.desktop = false;
    const wrapper = mountModal();
    await nextTick();
    const drawer = wrapper.findComponent(DrawerStub);
    expect(drawer.props("direction")).toBe("bottom");
    expect(drawer.props("shouldScaleBackground")).toBe(false);
    expect(drawer.props("setBackgroundColorOnScale")).toBe(false);
    expect(drawer.props("ui").container).toContain("overlay-sheet__container");
    expect(drawer.props("ui").body).toContain("safe-area-inset-bottom");
  });
});
