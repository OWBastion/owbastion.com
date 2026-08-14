// Player OCR-result feedback policy.
//
// The platform derives whether (and how) to ask a player to confirm or
// correct recognized OCR fields. All numeric gates live here, in one
// maintainable domain location; Portal components receive only a small
// presentation contract (a derived mode and safe field identifiers/values)
// and must never contain independent confidence thresholds.

export const ocrFeedbackFieldKeys = [
  "map_name",
  "difficulty",
  "viewer_player",
  "challenge_completed",
  "achievement_titles",
] as const;

export type OcrFeedbackFieldKey = (typeof ocrFeedbackFieldKeys)[number];

export const ocrFeedbackModes = ["none", "targeted", "grouped"] as const;
export type OcrFeedbackMode = (typeof ocrFeedbackModes)[number];

export const ocrFeedbackPromptOrigins = ["uncertainty", "conflict", "grouped", "calibration"] as const;
export type OcrFeedbackPromptOrigin = (typeof ocrFeedbackPromptOrigins)[number];

// Centralized, evidence-driven policy. These constants are the single source
// of truth for prompt thresholds; they are never copied into Portal code and
// never exposed to players. Operators may override the calibration sample rate
// at the API boundary; every other value is a domain decision.
export const ocrFeedbackPolicy = {
  // Fields whose recognized value matters for the business path. They use a
  // stricter reliability gate so a critical low-confidence field stays
  // prompt-eligible even when every other field is highly confident.
  criticalFieldKeys: ["map_name", "difficulty", "viewer_player", "challenge_completed"] as const,
  // A critical field is reliable only when OCRKit reports status "ok" and
  // confidence is at or above this gate.
  criticalReliableConfidence: 0.9,
  // A non-critical field (e.g. achievement text) is reliable at a slightly
  // lower gate.
  nonCriticalReliableConfidence: 0.8,
  // When at least this many safe fields are uncertain, the prompt becomes a
  // compact grouped interaction instead of a targeted one.
  groupedPromptFieldCount: 3,
  // Default deterministic calibration sample rate for otherwise high-confidence
  // results (0.02 = 2%). Conservative and configurable; the sampled decision is
  // recorded as origin "calibration" so it is distinguishable from
  // uncertainty-triggered prompts in provenance.
  calibrationSampleRate: 0.02,
  // Field statuses that mean the evidence itself is unusable. Such records
  // belong to the existing resubmission/manual-review path, never to a player
  // annotation task.
  severeFieldStatuses: ["unreadable", "cropped", "unsupported", "unsupported_crop", "obscured"],
} as const;

export type OcrFeedbackFieldInput = {
  key: OcrFeedbackFieldKey;
  value: string | boolean | null;
  confidence?: number | null;
  status?: string | null;
};

export type OcrFeedbackPolicyInput = {
  // The OCR result this policy is derived from. Used to make calibration
  // sampling deterministic per recognition.
  submissionId: string;
  ocrResultId: string;
  // Whether the recognition response itself is usable (ok: true, schema v1).
  ok: boolean | null | undefined;
  schemaVersion: string | null | undefined;
  // Safe fields with their recognized value and optional OCRKit evidence.
  fields: OcrFeedbackFieldInput[];
  // Override for the calibration sample rate (0..1). Defaults to the
  // centralized rate when omitted.
  calibrationSampleRate?: number;
};

export type OcrFeedbackDecision = {
  mode: OcrFeedbackMode;
  promptOrigin: OcrFeedbackPromptOrigin | null;
  promptFieldKeys: OcrFeedbackFieldKey[];
  severeFailure: boolean;
};

const hexToFraction = (hex: string) => Number.parseInt(hex.slice(0, 8), 16) / 0xffffffff;

// Deterministic per-recognition sample so retries and replays always select
// the same decision and calibration prompts are distinguishable in provenance.
const calibrationSampled = async (submissionId: string, ocrResultId: string, rate: number) => {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ocr-feedback-calibration:${submissionId}:${ocrResultId}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hexToFraction(hex) < rate;
};

const isCriticalField = (key: OcrFeedbackFieldKey) => (ocrFeedbackPolicy.criticalFieldKeys as readonly string[]).includes(key);

const fieldReliabilityGate = (key: OcrFeedbackFieldKey) =>
  isCriticalField(key) ? ocrFeedbackPolicy.criticalReliableConfidence : ocrFeedbackPolicy.nonCriticalReliableConfidence;

export const isOcrFeedbackFieldKey = (value: string): value is OcrFeedbackFieldKey =>
  (ocrFeedbackFieldKeys as readonly string[]).includes(value);

export const isOcrFeedbackPromptOrigin = (value: string): value is OcrFeedbackPromptOrigin =>
  (ocrFeedbackPromptOrigins as readonly string[]).includes(value);

export const deriveOcrFeedbackDecision = async (input: OcrFeedbackPolicyInput): Promise<OcrFeedbackDecision> => {
  if (input.ok !== true || (input.schemaVersion !== undefined && input.schemaVersion !== null && input.schemaVersion !== "1")) {
    return { mode: "none", promptOrigin: null, promptFieldKeys: [], severeFailure: true };
  }
  const severeField = input.fields.find((field) => field.status && (ocrFeedbackPolicy.severeFieldStatuses as readonly string[]).includes(field.status));
  if (severeField) {
    return { mode: "none", promptOrigin: null, promptFieldKeys: [], severeFailure: true };
  }
  const reliable = (field: OcrFeedbackFieldInput) => {
    if (field.status === "ok" && typeof field.confidence === "number") return field.confidence >= fieldReliabilityGate(field.key);
    return false;
  };
  const uncertain = input.fields.filter((field) => !reliable(field));
  if (uncertain.length === 0) {
    const rate = typeof input.calibrationSampleRate === "number" && Number.isFinite(input.calibrationSampleRate) && input.calibrationSampleRate >= 0 && input.calibrationSampleRate <= 1
      ? input.calibrationSampleRate
      : ocrFeedbackPolicy.calibrationSampleRate;
    if (!await calibrationSampled(input.submissionId, input.ocrResultId, rate)) {
      return { mode: "none", promptOrigin: null, promptFieldKeys: [], severeFailure: false };
    }
    const keys = input.fields.map((field) => field.key);
    return {
      mode: keys.length >= ocrFeedbackPolicy.groupedPromptFieldCount ? "grouped" : "targeted",
      promptOrigin: "calibration",
      promptFieldKeys: keys,
      severeFailure: false,
    };
  }
  const promptFieldKeys = uncertain.map((field) => field.key);
  const conflicting = uncertain.some((field) => field.status === "conflicting");
  const origin: OcrFeedbackPromptOrigin = conflicting
    ? "conflict"
    : promptFieldKeys.length >= ocrFeedbackPolicy.groupedPromptFieldCount
      ? "grouped"
      : "uncertainty";
  return {
    mode: promptFieldKeys.length >= ocrFeedbackPolicy.groupedPromptFieldCount ? "grouped" : "targeted",
    promptOrigin: origin,
    promptFieldKeys,
    severeFailure: false,
  };
};
