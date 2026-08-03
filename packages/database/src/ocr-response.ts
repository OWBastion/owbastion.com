export type OcrFieldEvidence = {
  confidence?: number;
  status?: string;
};

export type OcrResponse = {
  schema_version?: string;
  ok?: boolean;
  request_id?: string;
  model_version?: string;
  layout_version?: string;
  warnings?: unknown;
  quality?: { warnings?: unknown };
  fields?: Record<string, OcrFieldEvidence>;
  data?: { map_name?: string | null; map_variant?: string | null; difficulty?: string | null; challenge_completed?: boolean | null; viewer_player?: string | null; achievement_titles?: string[]; achievement_panel_text?: string | null };
};

export type OcrQualityGate = {
  accepted: boolean;
  requiredFields: string[];
  reasons: string[];
};

const minOcrConfidence = 0.85;

export const assessOcrQuality = (challengeType: string, response: OcrResponse, requiredMapVariant?: string | null, requireAchievementEvidence = false): OcrQualityGate => {
  const requiredFields = challengeType === "title_achievement" || challengeType === "unknown"
    ? ["challenge_completed", "viewer_player"]
    : challengeType === "map_title_achievement"
      ? ["challenge_completed", "viewer_player", "map_name"]
    : ["challenge_completed", "viewer_player", "map_name", "difficulty"];
  const reasons: string[] = [];
  if (requiredMapVariant) requiredFields.push("map_variant");
  if (response.schema_version !== "1") reasons.push("unsupported_schema_version");
  if (response.ok !== true) reasons.push("unsuccessful_response");

  for (const name of requiredFields) {
    if (name === "map_variant") {
      if (response.data?.map_variant !== requiredMapVariant) reasons.push(`map_variant:expected_${requiredMapVariant}`);
      const field = response.fields?.[name];
      if (!field) reasons.push("map_variant:missing_evidence");
      else if (field.status !== "ok") reasons.push(`map_variant:${field.status ?? "missing_status"}`);
      else if (typeof field.confidence !== "number" || field.confidence < minOcrConfidence) reasons.push("map_variant:low_confidence");
      continue;
    }
    const field = response.fields?.[name];
    if (!field) reasons.push(`${name}:missing_evidence`);
    else if (field.status !== "ok") reasons.push(`${name}:${field.status ?? "missing_status"}`);
    else if (typeof field.confidence !== "number" || field.confidence < minOcrConfidence) reasons.push(`${name}:low_confidence`);
  }

  if (requireAchievementEvidence) {
    const evidenceField = response.fields?.achievement_titles ?? response.fields?.achievement_panel_text;
    if (!evidenceField) reasons.push("achievement_evidence:missing_evidence");
    else if (evidenceField.status !== "ok") reasons.push(`achievement_evidence:${evidenceField.status ?? "missing_status"}`);
    else if (typeof evidenceField.confidence !== "number" || evidenceField.confidence < minOcrConfidence) reasons.push("achievement_evidence:low_confidence");
  }

  return { accepted: reasons.length === 0, requiredFields, reasons };
};
