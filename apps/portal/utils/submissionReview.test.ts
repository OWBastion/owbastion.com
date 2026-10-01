import { describe, expect, it } from "vitest";
import { verifiedRunIneligibleLabel } from "./submissionReview";

describe("verifiedRunIneligibleLabel", () => {
  it("explains why no Verified Run is recorded in Chinese", () => {
    expect(verifiedRunIneligibleLabel({ status: "ineligible", reason: "mastery_rollout_disabled" })).toContain("尚未开启");
    expect(verifiedRunIneligibleLabel({ status: "ineligible", reason: "invalid_run_code" })).toBe("不会记录 Verified Run：对局码缺失或无效");
  });

  it("stays silent unless a reason exists", () => {
    expect(verifiedRunIneligibleLabel({ status: "eligible", reason: null })).toBeNull();
    expect(verifiedRunIneligibleLabel({ status: "ineligible", reason: null })).toBeNull();
  });
});
