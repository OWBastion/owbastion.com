import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminChallengeDialog from "./AdminChallengeDialog.vue";

const dialogStub = { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' };
const challenge = {
  challengeId: "title.SKY.1", titleKey: "SKY", condition: "获得所有地图“主宰”头衔。", evidenceRule: "", submissionMode: "manual", categoryOverride: null,
  status: "active", startsAt: null, endsAt: null, introducedVersion: null, retiredVersion: null, mapIds: [], replacedByChallengeId: null,
  progressRule: { type: "required_maps_completed", mapIds: ["map.a"] },
};

describe("AdminChallengeDialog progress map selection", () => {
  it("selects and clears every map in one click", async () => {
    const wrapper = await mountSuspended(AdminChallengeDialog, {
      props: {
        open: false, mode: "edit", title: null, challenge, siblings: [], saving: false, errorMessage: "", modes: [],
        maps: [{ mapId: "map.a", mapName: "甲" }, { mapId: "map.b", mapName: "乙" }, { mapId: "map.c", mapName: "丙" }],
      } as never,
      global: { stubs: { AdminResponsiveDialog: dialogStub, USelect: { props: ["modelValue", "items"], template: "<div />" } } },
    });
    await wrapper.setProps({ open: true });
    const button = (label: string) => wrapper.findAll("button").find((item) => item.text() === label)!;
    expect(wrapper.text()).toContain("已选 1 / 3");

    await button("全选").trigger("click");
    expect(wrapper.text()).toContain("已选 3 / 3");

    await button("清空").trigger("click");
    expect(wrapper.text()).toContain("已选 0 / 3");
  });
});
