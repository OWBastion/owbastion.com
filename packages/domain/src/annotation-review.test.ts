import { describe, expect, it } from "vitest";
import { annotationProposalPriority } from "./annotation-review";

describe("annotation proposal priority", () => {
  it("ranks a player correction above a routine confirmation", () => {
    const correction = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "difficulty", originalValue: "困难", proposedValue: "一般" });
    const confirmation = annotationProposalPriority({ feedbackType: "confirmed", promptOrigin: "uncertainty", fieldKey: "difficulty" });
    expect(correction.score).toBeGreaterThan(confirmation.score);
    expect(correction.category).toBe("correction");
    expect(confirmation.category).toBe("confirmation");
  });

  it("marks a high-confidence calibration failure above ordinary corrections", () => {
    const calibration = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "calibration", fieldKey: "difficulty", originalValue: "困难", proposedValue: "一般" });
    const ordinary = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "difficulty", originalValue: "困难", proposedValue: "一般" });
    expect(calibration.score).toBeGreaterThan(ordinary.score);
    expect(calibration.category).toBe("calibration_failure");
  });

  it("prioritizes uncertain or conflicting corrections", () => {
    const uncertain = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "conflict", fieldKey: "map_name", originalValue: "萨摩亚", proposedValue: "皇家赛道" });
    expect(uncertain.category).toBe("correction");
    expect(uncertain.reasons).toContain("correction");
  });

  it("adds weight for critical fields such as identity or run-code families", () => {
    const critical = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "viewer_player", originalValue: "A", proposedValue: "B" });
    const ordinary = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "achievement_titles", originalValue: "A", proposedValue: "B" });
    expect(critical.score).toBeGreaterThan(ordinary.score);
  });

  it("boosts repeated error patterns that may indicate a systematic problem", () => {
    const repeated = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "difficulty", originalValue: "困难", proposedValue: "一般", repeatCount: 2 });
    const single = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "difficulty", originalValue: "困难", proposedValue: "一般", repeatCount: 0 });
    expect(repeated.score).toBeGreaterThan(single.score);
    expect(repeated.reasons).toContain("repeat");
  });

  it("keeps priority explainable and free of raw scoring internals in the queue projection", () => {
    const priority = annotationProposalPriority({ feedbackType: "corrected", promptOrigin: "uncertainty", fieldKey: "difficulty", originalValue: "困难", proposedValue: "一般" });
    expect(typeof priority.score).toBe("number");
    expect(priority.category).toBeTruthy();
    expect(priority.reasons.length).toBeGreaterThan(0);
  });
});
