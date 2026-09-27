import type { CanonicalChallengeConditions } from "@owbastion/domain";

export type OcrFieldEvidence = {
  confidence?: number;
  status?: string;
  value?: unknown;
};

export type OcrResponse = {
  schema_version?: string;
  ok?: boolean;
  request_id?: string;
  model_version?: string;
  layout_version?: string;
  warnings?: unknown;
  quality?: { warnings?: unknown; layout_version?: string; cropped?: boolean };
  fields?: Record<string, OcrFieldEvidence>;
  data?: {
    map_name?: string | null;
    map_variant?: string | null;
    difficulty?: string | null;
    challenge_completed?: boolean | null;
    viewer_player?: string | null;
    achievement_titles?: string[];
    achievement_panel_text?: string | null;
    version?: string | null;
    run_code?: string | null;
    duration_seconds?: number | null;
    deaths?: number | null;
    skips?: number | null;
  };
};

export type OcrQualityGate = {
  accepted: boolean;
  requiredFields: string[];
  reasons: string[];
};

export const submissionOcrQualityPolicy = {
  schemaVersion: "1",
  supportedLayoutVersions: ["1280x720-v6", "1280x800-v1"],
  minimumFieldConfidence: 0.85,
} as const;

const challengeEvidenceValueExists = (response: OcrResponse, field: string) => {
  const data = response.data ?? {};
  switch (field) {
    case "map_name": return typeof data.map_name === "string" && Boolean(data.map_name.trim());
    case "difficulty": return typeof data.difficulty === "string" && Boolean(data.difficulty.trim());
    case "challenge_completed": return typeof data.challenge_completed === "boolean";
    case "map_variant": return typeof data.map_variant === "string" && Boolean(data.map_variant.trim());
    case "achievement_titles": return Boolean(data.achievement_titles?.length || data.achievement_panel_text?.trim());
    default: return false;
  }
};

export const assessSubmissionOcrResponseQuality = (response: OcrResponse, humanConfirmed = false): OcrQualityGate => {
  const reasons: string[] = [];
  if (!humanConfirmed) {
    if (response.schema_version !== submissionOcrQualityPolicy.schemaVersion) reasons.push("unsupported_schema_version");
    if (response.ok !== true) reasons.push("unsuccessful_response");
    const layoutVersion = response.layout_version ?? response.quality?.layout_version;
    if (!layoutVersion || !submissionOcrQualityPolicy.supportedLayoutVersions.includes(layoutVersion as typeof submissionOcrQualityPolicy.supportedLayoutVersions[number])) reasons.push("unsupported_layout_version");
    if (response.layout_version && response.quality?.layout_version && response.layout_version !== response.quality.layout_version) reasons.push("conflicting_layout_version");
    if (response.quality?.cropped === true) reasons.push("cropped_input");
  }
  return { accepted: reasons.length === 0, requiredFields: [], reasons };
};

export const assessChallengeOcrQuality = (
  conditions: CanonicalChallengeConditions | null,
  response: OcrResponse,
  humanConfirmed = false,
  conditionIndexes?: readonly number[],
): OcrQualityGate => {
  const selectedConditions = conditions
    ? conditionIndexes
      ? conditionIndexes.flatMap((index) => conditions.conditions[index] ? [conditions.conditions[index]!] : [])
      : conditions.conditions
    : [];
  const requiredFields = conditions ? [...new Set(selectedConditions.map(({ type }) => ({
    achievement_title: "achievement_titles",
    map: "map_name",
    completed: "challenge_completed",
    difficulty_at_least: "difficulty",
    map_variant: "map_variant",
  }[type])))].sort() : [];
  const reasons = [...assessSubmissionOcrResponseQuality(response, humanConfirmed).reasons];
  if (!conditions) reasons.push("unsupported_challenge_conditions");

  for (const fieldName of requiredFields) {
    if (!challengeEvidenceValueExists(response, fieldName)) {
      reasons.push(`${fieldName}:missing_value`);
      continue;
    }
    if (humanConfirmed) continue;
    const field = fieldName === "achievement_titles"
      ? response.fields?.achievement_titles ?? response.fields?.achievement_panel_text
      : response.fields?.[fieldName];
    if (!field) reasons.push(`${fieldName}:missing_evidence`);
    else if (field.status !== "ok") reasons.push(`${fieldName}:${field.status ?? "missing_status"}`);
    else if (typeof field.confidence !== "number" || field.confidence < submissionOcrQualityPolicy.minimumFieldConfidence) reasons.push(`${fieldName}:low_confidence`);
  }

  return { accepted: reasons.length === 0, requiredFields, reasons };
};
