import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminEventPoolSummary from "./AdminEventPoolSummary.vue";

const versions = [
  { gameVersion: "5.0", availability: "available" as const, mode: null, modeWeightTotal: null, eventCount: 16 },
  { gameVersion: "2026周年", availability: "available" as const, mode: "2026镜中回响", modeWeightTotal: 69.5, eventCount: 7 },
];

describe("AdminEventPoolSummary", () => {
  it("labels each pool's mode and opens its mode settings", async () => {
    const wrapper = await mountSuspended(AdminEventPoolSummary, { props: { poolSize: 16, poolWeight: 62.7, versions, saving: null } });
    const modeButtons = wrapper.findAll(".pool-summary__mode");
    expect(modeButtons.map((button) => button.text())).toEqual(["常规", "2026镜中回响"]);
    await modeButtons[1]!.trigger("click");
    expect(wrapper.emitted("configure")).toEqual([[versions[1]]]);
  });
});
