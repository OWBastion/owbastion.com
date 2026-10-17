import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminAchievementEditorDialog from "./AdminAchievementEditorDialog.vue";

const item = { challengeId: "a", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "T", titleName: "称号", icon: "trophy", iconUrl: null, category: "战斗", condition: "完成", evidenceRule: "", gameVersion: "26.0713.1", status: "active", submissionMode: "manual", scope: "global", mapIds: [] };

describe("AdminAchievementEditorDialog", () => {
  it("opens 更多设置 when a required field inside it is invalid", async () => {
    const wrapper = await mountSuspended(AdminAchievementEditorDialog, {
      props: { open: true, item: item as never, maps: [], modes: [], categories: [], saving: false, iconFile: null, iconUploading: false },
      global: { stubs: { AdminResponsiveDialog: { template: '<div><slot name="body" /></div>' } } },
    });
    const details = wrapper.get("details.more-settings");
    expect((details.element as HTMLDetailsElement).open).toBe(false);
    await wrapper.get("details.more-settings textarea").trigger("invalid");
    expect((details.element as HTMLDetailsElement).open).toBe(true);
  });
});
