import type { AdminAnnotationProposal } from "~/composables/useAdminApi";

export const annotationFieldItems: Array<{ label: string; value: AdminAnnotationProposal["fieldKey"] }> = [
  { label: "地图", value: "map_name" },
  { label: "难度", value: "difficulty" },
  { label: "玩家", value: "viewer_player" },
  { label: "通关标记", value: "challenge_completed" },
  { label: "成就", value: "achievement_titles" },
];

export function annotationFieldLabel(key: string) {
  return annotationFieldItems.find((item) => item.value === key)?.label ?? key;
}

const submissionUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const submissionTokenPattern = /^[A-Za-z0-9_-]{8,}$/;

export function looksLikeSubmissionId(value: string) {
  const id = value.trim();
  return submissionUuidPattern.test(id) || submissionTokenPattern.test(id);
}

type OcrPayload = { data?: Record<string, unknown> };

export function annotationOcrFieldValue(ocr: Record<string, unknown> | null | undefined, fieldKey: AdminAnnotationProposal["fieldKey"]) {
  const data = ocr && typeof ocr === "object" && "data" in ocr && ocr.data && typeof ocr.data === "object" && !Array.isArray(ocr.data)
    ? (ocr as OcrPayload).data
    : undefined;
  if (!data) return "";
  const value = data[fieldKey];
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).join("、");
  return typeof value === "string" ? value : "";
}
