import { describe, expect, it } from "vitest";
import { deriveOcrFeedbackDecision, ocrFeedbackFieldKeys, ocrFeedbackPolicy, type OcrFeedbackFieldInput } from "./ocr-feedback";

const field = (key: string, overrides: Partial<OcrFeedbackFieldInput> = {}): OcrFeedbackFieldInput => ({
  key: key as OcrFeedbackFieldInput["key"],
  value: null,
  confidence: 0.95,
  status: "ok",
  ...overrides,
});

const highConfidenceFields = (): OcrFeedbackFieldInput[] => [
  field("map_name", { value: "萨摩亚" }),
  field("difficulty", { value: "困难" }),
  field("viewer_player", { value: "Player" }),
  field("challenge_completed", { value: true }),
  field("achievement_titles", { value: "征服者" }),
];

const baseInput = () => ({
  submissionId: "00000000-0000-4000-8000-000000000001",
  ocrResultId: "00000000-0000-4000-8000-000000000002",
  ok: true,
  schemaVersion: "1",
  fields: highConfidenceFields(),
});

describe("ocr feedback policy", () => {
  it("does not prompt when every relevant safe field is sufficiently reliable", async () => {
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), calibrationSampleRate: 0 });
    expect(decision.mode).toBe("none");
    expect(decision.promptOrigin).toBeNull();
    expect(decision.promptFieldKeys).toEqual([]);
    expect(decision.severeFailure).toBe(false);
  });

  it("marks unsupported recognition responses as severe failures without a prompt", async () => {
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), ok: false });
    expect(decision.severeFailure).toBe(true);
    expect(decision.mode).toBe("none");
    expect(decision.promptFieldKeys).toEqual([]);
  });

  it("marks unusable field statuses as severe failures that stay in the resubmission path", async () => {
    const decision = await deriveOcrFeedbackDecision({
      ...baseInput(),
      fields: [field("map_name", { status: "cropped" }), ...highConfidenceFields().slice(1)],
    });
    expect(decision.severeFailure).toBe(true);
    expect(decision.mode).toBe("none");
    expect(decision.promptFieldKeys).toEqual([]);
  });

  it("derives a targeted prompt for one uncertain field without prompting reliable fields", async () => {
    const fields = highConfidenceFields().map((item) =>
      item.key === "difficulty" ? { ...item, confidence: 0.6, status: "low_confidence" } : item,
    );
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), fields });
    expect(decision.mode).toBe("targeted");
    expect(decision.promptOrigin).toBe("uncertainty");
    expect(decision.promptFieldKeys).toEqual(["difficulty"]);
  });

  it("keeps a critical low-confidence field actionable when other fields are highly confident", async () => {
    const fields = highConfidenceFields().map((item) =>
      item.key === "viewer_player" ? { ...item, confidence: 0.5, status: "low_confidence" } : item,
    );
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), fields });
    expect(decision.mode).toBe("targeted");
    expect(decision.promptFieldKeys).toEqual(["viewer_player"]);
  });

  it("derives a grouped prompt when several safe fields are uncertain", async () => {
    const fields = highConfidenceFields().map((item) =>
      ["difficulty", "viewer_player", "challenge_completed"].includes(item.key)
        ? { ...item, confidence: 0.6, status: "ambiguous" }
        : item,
    );
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), fields });
    expect(decision.mode).toBe("grouped");
    expect(decision.promptOrigin).toBe("grouped");
    expect(decision.promptFieldKeys.sort()).toEqual(["challenge_completed", "difficulty", "viewer_player"]);
  });

  it("derives a conflict origin when a field status is conflicting", async () => {
    const fields = highConfidenceFields().map((item) =>
      item.key === "map_name" ? { ...item, status: "conflicting", confidence: 0.6 } : item,
    );
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), fields });
    expect(decision.mode).toBe("targeted");
    expect(decision.promptOrigin).toBe("conflict");
    expect(decision.promptFieldKeys).toEqual(["map_name"]);
  });

  it("applies a non-critical field's lower reliability gate", async () => {
    // achievement_titles at 0.85 is reliable (non-critical gate), while the
    // same confidence on a critical field would be uncertain.
    const fields = highConfidenceFields().map((item) =>
      item.key === "achievement_titles" ? { ...item, confidence: 0.85 } : item,
    );
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), fields });
    expect(decision.mode).toBe("none");
  });

  it("is deterministic: the same recognition always derives the same decision", async () => {
    const first = await deriveOcrFeedbackDecision({ ...baseInput(), calibrationSampleRate: 1 });
    const second = await deriveOcrFeedbackDecision({ ...baseInput(), calibrationSampleRate: 1 });
    expect(first).toEqual(second);
  });

  it("samples high-confidence results for calibration and distinguishes the origin", async () => {
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), calibrationSampleRate: 1 });
    expect(decision.mode).toBe("grouped");
    expect(decision.promptOrigin).toBe("calibration");
    expect(decision.promptFieldKeys).toEqual([...ocrFeedbackFieldKeys]);
    expect(decision.severeFailure).toBe(false);
  });

  it("does not calibrate-sample at a zero rate", async () => {
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), calibrationSampleRate: 0 });
    expect(decision.mode).toBe("none");
    expect(decision.promptOrigin).toBeNull();
  });

  it("never surfaces numeric gates or confidence values in the decision contract", async () => {
    const decision = await deriveOcrFeedbackDecision({ ...baseInput(), calibrationSampleRate: 1 });
    const serialized = JSON.stringify(decision);
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain(String(ocrFeedbackPolicy.criticalReliableConfidence));
    expect(serialized).not.toContain(String(ocrFeedbackPolicy.calibrationSampleRate));
  });
});
