import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import AdminSubmissionReviewFields from "./AdminSubmissionReviewFields.vue";

mockNuxtImport("useAdminApi", () => () => vi.fn(() => Promise.resolve({ items: [] })));

const submission = {
  playerName: "玩家",
  ocrStatus: "succeeded",
  ocr: {
    data: { map_name: "萨摩亚", run_code: "7123-4567-8901" },
    fields: { map_name: { value: "萨摩亚", status: "ok" }, run_code: { value: "7123-4567-8901", status: "ok" } },
  },
};
const mountFields = () => mountSuspended(AdminSubmissionReviewFields, { props: { submission: submission as never } });
const chip = (wrapper: Awaited<ReturnType<typeof mountFields>>, label: string) => wrapper.get(`button[aria-label^="${label}："]`);
// One mark is the single-tick icon; the double-tick icon would read as two.
const checkMarks = (element: { findAll: (selector: string) => unknown[] }) => element.findAll('[class*="lucide"][class*="check"]:not([class*="check-check"])').length;

describe("AdminSubmissionReviewFields", () => {
  it("marks a recognized code with one check, and keeps it single once the code is confirmed", async () => {
    const wrapper = await mountFields();
    await wrapper.get('button[aria-expanded="false"][class*="ghost"], button:not([aria-label])[aria-expanded="false"]').trigger("click");
    const code = chip(wrapper, "对局码");
    expect(checkMarks(code)).toBe(1);
    await code.trigger("click");
    await wrapper.get('button[aria-label="核对对局码"]').trigger("click");
    expect(chip(wrapper, "对局码").attributes("aria-label")).toContain("已核对");
    expect(checkMarks(chip(wrapper, "对局码"))).toBe(1);
  });
});
