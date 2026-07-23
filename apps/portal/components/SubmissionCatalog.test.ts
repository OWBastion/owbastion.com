import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import SubmissionCatalog from "./SubmissionCatalog.vue";

describe("SubmissionCatalog", () => {
  it("renders UTabs with variant='link'", async () => {
    const wrapper = await mountSuspended(SubmissionCatalog, {
      props: {
        maps: [],
        mapChallenges: [],
        achievementChallenges: [],
        selectedChallengeId: "",
      },
    });

    const tabs = wrapper.findComponent({ name: "UTabs" });
    expect(tabs.exists()).toBe(true);
    expect(tabs.props("variant")).toBe("link");
  });
});
