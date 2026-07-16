import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ReviewsPage from "./reviews.vue";

const adminApi = vi.fn((path: string) => {
  if (path === "/v1/submissions?status=ready_for_review,ocr_review_required&page=1&pageSize=20") return Promise.resolve({ items: [{ submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review" }, { submissionId: "submission-2", mapName: "釜山", difficulty: "专家", playerName: "他又", status: "ocr_review_required" }], total: 2 });
  if (path === "/v1/submissions/submission-1") return Promise.resolve({ submissionId: "submission-1", mapName: "帕拉伊苏", difficulty: "困难", playerName: "他又", status: "ready_for_review" });
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useAdminApi", () => () => adminApi);

describe("admin reviews page", () => {
  it("opens the submission detail sheet", async () => {
    adminApi.mockClear();
    const wrapper = await mountSuspended(ReviewsPage, { attachTo: document.body });
    await flushPromises();
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(2);
    await wrapper.findAll(".admin-table button").find((button) => button.text() === "查看")!.trigger("click");
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
