import { describe, expect, it } from "vitest";
import { playerSubmissionStatusLabel, playerSubmissionStatusTone, submissionStatusTone } from "./submissionStatus";

describe("submission status tone", () => {
  it("uses distinct semantic tones for completed and action-required outcomes", () => {
    expect(submissionStatusTone("approved")).toBe("success");
    expect(submissionStatusTone("rejected")).toBe("error");
    expect(submissionStatusTone("resubmission_required")).toBe("warning");
  });

  it("uses an informational tone for pending review states", () => {
    expect(submissionStatusTone("ready_for_review")).toBe("info");
    expect(submissionStatusTone("ocr_review_required")).toBe("info");
  });

  it("shows a player rejection that asks for a new screenshot as resubmission, not failure", () => {
    expect([playerSubmissionStatusLabel("rejected", true), playerSubmissionStatusTone("rejected", true)]).toEqual(["需重新提交", "warning"]);
    expect([playerSubmissionStatusLabel("rejected", false), playerSubmissionStatusTone("rejected", false)]).toEqual(["未通过", "error"]);
    expect([playerSubmissionStatusLabel("needs_review"), playerSubmissionStatusTone("needs_review")]).toEqual(["等待核对", "info"]);
  });
});
