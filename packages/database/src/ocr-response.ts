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
  data?: { map_name?: string | null; map_variant?: string | null; difficulty?: string | null; challenge_completed?: boolean | null; viewer_player?: string | null; achievement_titles?: string[] };
};

export type OcrQualityGate = {
  accepted: boolean;
  requiredFields: string[];
  reasons: string[];
};

const minOcrConfidence = 0.85;

export const assessOcrQuality = (challengeType: string, response: OcrResponse, requiredMapVariant?: string | null): OcrQualityGate => {
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
      continue;
    }
    const field = response.fields?.[name];
    if (!field) reasons.push(`${name}:missing_evidence`);
    else if (field.status !== "ok") reasons.push(`${name}:${field.status ?? "missing_status"}`);
    else if (typeof field.confidence !== "number" || field.confidence < minOcrConfidence) reasons.push(`${name}:low_confidence`);
  }

  return { accepted: reasons.length === 0, requiredFields, reasons };
};
