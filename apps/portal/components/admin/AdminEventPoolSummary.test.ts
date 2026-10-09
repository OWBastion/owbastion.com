import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminEventPoolSummary from "./AdminEventPoolSummary.vue";

const versions = [
  { gameVersion: "5.0", availability: "available" as const, mode: null, eventCount: 16 },
  { gameVersion: "2026周年", availability: "available" as const, mode: "2026镜中回响", eventCount: 7 },
];

describe("AdminEventPoolSummary", () => {
  it("marks only the pools a standalone mode owns and links to that mode's setup", async () => {
    const wrapper = await mountSuspended(AdminEventPoolSummary, { props: { poolSize: 16, poolWeight: 62.7, versions, saving: null } });
    const modeLinks = wrapper.findAll(".pool-summary__mode");
    expect(modeLinks.map((link) => link.text())).toEqual(["仅 2026镜中回响"]);
    expect(modeLinks[0]!.attributes("href")).toBe("/admin/modes");
  });
});
