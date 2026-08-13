import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminMapRevisionList from "./AdminMapRevisionList.vue";
import type { AdminMapEditorRevision } from "~/composables/useAdminMapEditor";

const revisions: AdminMapEditorRevision[] = [
  {
    revisionId: "revision:map.test:initial",
    mapId: "map.test",
    lifecycle: "default",
    mapVariant: null,
    copiedFromRevisionId: null,
    resetReason: null,
    gameVersion: "26.0715.1",
    spatialConfig: null,
    isDefault: true,
    isSelectable: false,
    challengeAssignments: [],
    createdAt: 1,
    updatedAt: 1,
  },
  {
    revisionId: "revision:map.test:r2",
    mapId: "map.test",
    lifecycle: "preparing",
    mapVariant: "classic",
    copiedFromRevisionId: "revision:map.test:initial",
    resetReason: null,
    gameVersion: "26.0812.1",
    spatialConfig: null,
    isDefault: false,
    isSelectable: false,
    challengeAssignments: [],
    createdAt: 2,
    updatedAt: 2,
  },
];

describe("AdminMapRevisionList", () => {
  it("marks the selected revision and uses lifecycle labels", async () => {
    const wrapper = await mountSuspended(AdminMapRevisionList, {
      props: { revisions, selectedRevisionId: "revision:map.test:initial" },
      global: {
        stubs: {
          StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
        },
      },
    });

    expect(wrapper.text()).toContain("版本修订");
    expect(wrapper.text()).toContain("默认");
    expect(wrapper.text()).toContain("准备中");
    expect(wrapper.text()).not.toContain("公平边界");

    const buttons = wrapper.findAll("button.revision-card");
    expect(buttons[0]!.attributes("aria-pressed")).toBe("true");
    expect(buttons[1]!.attributes("aria-pressed")).toBe("false");

    await buttons[1]!.trigger("click");
    expect(wrapper.emitted("select")).toEqual([["revision:map.test:r2"]]);
  });
});
