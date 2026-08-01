import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import SubmissionProgress from "./SubmissionProgress.vue";

describe("SubmissionProgress", () => {
  it.each([
    ["ocr_pending", ["已完成", "进行中", "待处理", "待处理"]],
    ["ready_for_review", ["已完成", "已完成", "进行中", "待处理"]],
    ["approved", ["已完成", "已完成", "已完成", "已完成"]],
    ["rejected", ["已完成", "已完成", "未通过", "待处理"]],
    ["resubmission_required", ["已完成", "未通过", "待处理", "待处理"]],
  ])("maps %s to its lifecycle state", async (status, states) => {
    const wrapper = await mountSuspended(SubmissionProgress, { props: { status, updatedAt: 0 } });

    expect(wrapper.findAll(".progress-title span").map((item) => item.text())).toEqual(states);
  });

  it("shows player confirmation as the current OCR step", async () => {
    const wrapper = await mountSuspended(SubmissionProgress, { props: { status: "awaiting_player_confirmation", updatedAt: 0 } });

    expect(wrapper.text()).toContain("等待确认挑战");
    expect(wrapper.get('[aria-label="截图识别：进行中"]').exists()).toBe(true);
  });
});
