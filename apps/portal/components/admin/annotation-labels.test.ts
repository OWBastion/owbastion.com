import { describe, expect, it } from "vitest";
import { annotationFieldLabel, annotationOcrFieldValue, looksLikeSubmissionId } from "~/utils/annotation-labels";

describe("annotation labels", () => {
  it("maps field keys and OCR values used by direct annotation", () => {
    expect(annotationFieldLabel("difficulty")).toBe("难度");
    expect(annotationOcrFieldValue({ data: { map_name: "皇家赛道", challenge_completed: true, achievement_titles: ["守望先锋"] } }, "map_name")).toBe("皇家赛道");
    expect(annotationOcrFieldValue({ data: { challenge_completed: true } }, "challenge_completed")).toBe("true");
    expect(annotationOcrFieldValue({ data: { achievement_titles: ["守望先锋", "征服者"] } }, "achievement_titles")).toBe("守望先锋、征服者");
  });

  it("accepts pasted submission identifiers", () => {
    expect(looksLikeSubmissionId("00000000-0000-4000-8000-000000000003")).toBe(true);
    expect(looksLikeSubmissionId("submission-1")).toBe(true);
    expect(looksLikeSubmissionId("皇家赛道")).toBe(false);
  });
});
