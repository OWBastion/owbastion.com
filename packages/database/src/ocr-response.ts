import type { CanonicalChallengeConditions } from "@owbastion/domain";
import { isVerifiedRunGameVersionSupported, isVerifiedRunOcrLayoutSupported, normalizeMatchCode, verifiedRunDifficulties, verifiedRunEvidenceCompatibilityV1 } from "@owbastion/domain";
import type { VerifiedRunDifficulty, VerifiedRunEvidenceCompatibilityV1 } from "@owbastion/domain";

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

export type VerifiedRunOcrEvidenceAssessment =
  | {
    outcome: "eligible";
    mapName: string;
    mapVariant: "classic" | null;
    difficulty: VerifiedRunDifficulty;
    gameVersion: string;
    matchCode: string;
    completionDurationSeconds: number;
    deaths: number | null;
    skips: number | null;
  }
  | { outcome: "ineligible"; reason: string };

const normalizedOcrLabel = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
export const normalizeOcrDifficulty = (value: unknown) => {
  const label = normalizedOcrLabel(value);
  return label.startsWith("地狱:") || label.startsWith("地狱：") ? "地狱" : label === "普通" ? "一般" : label;
};

const verifiedRunRequiredOcrFields = ["challenge_completed", "map_name", "difficulty", "version", "run_code", "duration_seconds"] as const;
const hasReliableVerifiedRunField = (response: OcrResponse, fieldName: string, compatibility: VerifiedRunEvidenceCompatibilityV1) => {
  const field = response.fields?.[fieldName];
  return field?.status === "ok" && typeof field.confidence === "number" && field.confidence >= compatibility.requiredConfidence;
};

const ineligibleVerifiedRunEvidence = (reason: string): VerifiedRunOcrEvidenceAssessment => ({ outcome: "ineligible", reason });

export const assessVerifiedRunOcrEvidence = (
  response: OcrResponse,
  compatibility: VerifiedRunEvidenceCompatibilityV1 = verifiedRunEvidenceCompatibilityV1,
  humanConfirmed = false,
): VerifiedRunOcrEvidenceAssessment => {
  if (!compatibility.minimumGameVersion || !compatibility.supportedOcrLayoutVersions.length) return ineligibleVerifiedRunEvidence("mastery_rollout_disabled");
  if (!humanConfirmed && response.schema_version !== "1") return ineligibleVerifiedRunEvidence("unsupported_schema_version");
  if (!humanConfirmed && response.ok !== true) return ineligibleVerifiedRunEvidence("unsuccessful_response");
  if (!humanConfirmed && !isVerifiedRunOcrLayoutSupported(response.layout_version, compatibility)) return ineligibleVerifiedRunEvidence("unsupported_layout");
  for (const fieldName of verifiedRunRequiredOcrFields) {
    if (!humanConfirmed && !hasReliableVerifiedRunField(response, fieldName, compatibility)) return ineligibleVerifiedRunEvidence(`unreliable_${fieldName}`);
  }

  const data = response.data ?? {};
  if (data.challenge_completed !== true) return ineligibleVerifiedRunEvidence("completion_not_confirmed");
  const mapName = typeof data.map_name === "string" ? data.map_name.trim() : "";
  if (!mapName) return ineligibleVerifiedRunEvidence("missing_map");
  const gameVersion = typeof data.version === "string" ? data.version.trim() : "";
  if (!isVerifiedRunGameVersionSupported(gameVersion, compatibility)) return ineligibleVerifiedRunEvidence("unsupported_game_version");
  const difficulty = normalizeOcrDifficulty(data.difficulty);
  if (!verifiedRunDifficulties.includes(difficulty as VerifiedRunDifficulty)) return ineligibleVerifiedRunEvidence("invalid_difficulty");
  const completionDurationSeconds = data.duration_seconds;
  if (typeof completionDurationSeconds !== "number" || !Number.isInteger(completionDurationSeconds) || completionDurationSeconds <= 0) return ineligibleVerifiedRunEvidence("invalid_completion_duration");
  let matchCode: string;
  try {
    matchCode = normalizeMatchCode(typeof data.run_code === "string" ? data.run_code : "");
  } catch {
    return ineligibleVerifiedRunEvidence("invalid_run_code");
  }

  const rawVariant = typeof data.map_variant === "string" ? data.map_variant.trim() : "";
  if (rawVariant && rawVariant !== "classic") return ineligibleVerifiedRunEvidence("invalid_map_variant");
  if (rawVariant && !hasReliableVerifiedRunField(response, "map_variant", compatibility)) return ineligibleVerifiedRunEvidence("unreliable_map_variant");
  const settlementValue = (value: number | null | undefined, fieldName: "deaths" | "skips") => {
    if (value === null || value === undefined || !hasReliableVerifiedRunField(response, fieldName, compatibility)) return null;
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  };
  const deaths = settlementValue(data.deaths, "deaths");
  const skips = settlementValue(data.skips, "skips");
  if (deaths === undefined || skips === undefined) return ineligibleVerifiedRunEvidence("invalid_settlement_value");

  return {
    outcome: "eligible",
    mapName,
    mapVariant: rawVariant === "classic" ? "classic" : null,
    difficulty: difficulty as VerifiedRunDifficulty,
    gameVersion,
    matchCode,
    completionDurationSeconds,
    deaths: deaths ?? null,
    skips: skips ?? null,
  };
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
