import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ReviewsPage from "./reviews.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?status=ready_for_review") return Promise.resolve({ items: [{ submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review" }] });
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review" });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin reviews page", () => {
  it("opens the submission detail sheet", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewsPage, { attachTo: document.body });
    await flushPromises();
    await wrapper.get(".row").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').attributes("aria-labelledby")).toBe("submission-detail-title");
  });
});
