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

  it("shows the same equipped, obtained and not-obtained wording for the player's map titles", async () => {
    media.desktop = true;
    const challenge = { family: "map", type: "map_completion", kind: "map_title_achievement", mapId: "map.samoa", mapName: "萨摩亚", gameplayRevisionId: "rev.1", status: "active" } as const;
    const title = { icon: "trophy", category: "地图", condition: "完成", scope: "map" as const, mapId: "map.samoa", gameplayRevisionId: "rev.1", grantedAt: 1 };
    const wrapper = mount(MapDetailModal, {
      props: {
        open: true,
        map,
        challenges: [
          { ...challenge, challengeId: "a", name: "佩戴挑战", titleKey: "WORN" },
          { ...challenge, challengeId: "b", name: "获得挑战", titleKey: "OWNED" },
          { ...challenge, challengeId: "c", name: "未得挑战", titleKey: "NONE" },
        ] as never,
        authenticated: true,
        titles: [
          { ...title, grantId: "g1", titleKey: "WORN", label: "佩戴", equipped: true },
          { ...title, grantId: "g2", titleKey: "OWNED", label: "获得" },
        ],
      },
      global: { stubs: { UModal: ModalStub, UDrawer: DrawerStub, UBadge: { props: ["label"], template: "<span>{{ label }}</span>" }, PlayerReviewPanel: { template: "<div />" } } },
    });
    await nextTick();
    const rows = wrapper.findAll(".challenge-list li").map((row) => row.text());
    expect(rows.find((text) => text.includes("佩戴挑战"))).toContain("已佩戴");
    expect(rows.find((text) => text.includes("获得挑战"))).toContain("已获得");
    expect(rows.find((text) => text.includes("未得挑战"))).toContain("未获得");
  });
});
