import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import type { AdminReviewDetail as Detail } from "~/composables/useAdminApi";
import AdminReviewDetail from "./AdminReviewDetail.vue";

const detail: Detail = {
  contractVersion: "1",
  review: {
    reviewId: "00000000-0000-4000-8000-000000000001",
    targetType: "map",
    targetId: "map.test",
    gameplayRevisionId: null,
    targetName: "测试地图",
    playerAccountId: "00000000-0000-4000-8000-000000000002",
    playerId: "1234",
    playerName: "Tester",
    rating: 4,
    comment: "不错",
    anonymous: false,
    commentStatus: "visible",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    withdrawnAt: null,
    invalidatedAt: null,
    invalidatedBy: null,
    invalidationReason: null,
  },
  audit: [],
};

describe("AdminReviewDetail", () => {
  it("shows the target and player by name without internal ids", async () => {
    const wrapper = await mountSuspended(AdminReviewDetail, { props: { detail } });

    expect(wrapper.text()).toContain("测试地图");
    expect(wrapper.text()).toContain("Tester#1234");
    expect(wrapper.text()).not.toContain("map.test");
    expect(wrapper.text()).not.toContain("00000000-0000-4000-8000-000000000002");
    expect(wrapper.get(".battle-tag__id").text()).toBe("#1234");
  });
});
