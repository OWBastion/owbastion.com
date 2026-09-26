import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import SubmissionProgress from "./SubmissionProgress.vue";

describe("SubmissionProgress", () => {
  it.each([
    ["processing", ["已完成", "进行中", "待处理", "待处理"]],
    ["needs_review", ["已完成", "已完成", "进行中", "待处理"]],
    ["completed", ["已完成", "已完成", "已完成", "已完成"]],
    ["rejected", ["已完成", "已完成", "未通过", "待处理"]],
  ])("maps %s to its lifecycle state", async (status, states) => {
    const wrapper = await mountSuspended(SubmissionProgress, { props: { status, updatedAt: 0, resubmissionRequired: false } });

    const actualStates = wrapper.findAll("[aria-label]")
      .map((item) => item.attributes("aria-label"))
      .filter((label) => label?.includes("："))
      .map((label) => label!.split("：")[1]);
    expect(actualStates).toEqual(states);
  });

  it("shows resubmission-required rejection at the OCR step", async () => {
    const wrapper = await mountSuspended(SubmissionProgress, { props: { status: "rejected", resubmissionRequired: true, updatedAt: 0 } });

    expect(wrapper.get('[aria-label="截图识别：未通过"]').exists()).toBe(true);
  });
});
