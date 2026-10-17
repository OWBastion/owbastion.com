import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import TitleInspectDialog from "./TitleInspectDialog.vue";

const title = { label: "速通者", icon: "award", iconUrl: null, slot: "achievement", equipped: true, grantedAt: Date.UTC(2025, 9, 9) };
const stubs = { UModal: { template: '<div><slot name="body" /><slot name="footer" /></div>' } };

describe("TitleInspectDialog", () => {
  it("shows a frameless, untilted badge stage that sweeps on open", async () => {
    const wrapper = await mountSuspended(TitleInspectDialog, { props: { open: true, title: title as never }, global: { stubs } });
    const stage = wrapper.get(".inspect__stage");

    expect(stage.classes()).toContain("is-opening");
    expect(stage.attributes("style") ?? "").not.toContain("tilt");
    expect(stage.classes()).not.toContain("is-tilting");
    await stage.trigger("animationend");
    expect(stage.classes()).not.toContain("is-opening");
  });
});
