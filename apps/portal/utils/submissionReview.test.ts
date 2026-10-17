import { describe, expect, it } from "vitest";
import { verifiedRunIneligibleLabel } from "./submissionReview";

describe("verifiedRunIneligibleLabel", () => {
  it("explains why no 通关记录 is recorded in Chinese", () => {
    expect(verifiedRunIneligibleLabel({ status: "ineligible", reason: "mastery_rollout_disabled" })).toContain("尚未开启");
    expect(verifiedRunIneligibleLabel({ status: "ineligible", reason: "invalid_run_code" })).toBe("不会记录 通关记录：对局码缺失或无效");
  });

  it("stays silent unless a reason exists", () => {
    expect(verifiedRunIneligibleLabel({ status: "eligible", reason: null })).toBeNull();
    expect(verifiedRunIneligibleLabel({ status: "ineligible", reason: null })).toBeNull();
  });
});
