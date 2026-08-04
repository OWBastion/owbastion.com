import { describe, expect, it } from "vitest";
import { submissionStatusTone } from "./submissionStatus";

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
});
