import type { AdminSubmissionReviewCandidate, AdminSubmissionReviewPreview } from "~/composables/useAdminApi";

export const reviewEvidenceFieldLabels: Record<AdminSubmissionReviewCandidate["requiredFields"][number], string> = {
  map_name: "地图",
  difficulty: "难度",
  challenge_completed: "通关标记",
  map_variant: "地图版本",
  achievement_titles: "成就面板",
};

export const reviewFieldList = (fields: readonly AdminSubmissionReviewCandidate["requiredFields"][number][]) => fields.map((field) => reviewEvidenceFieldLabels[field] ?? field).join("、");

export const reviewCandidateScopeLabel = (candidate: AdminSubmissionReviewCandidate) => candidate.kind === "title_achievement"
  ? "称号挑战"
  : candidate.kind === "map_title_achievement"
    ? "地图称号"
    : "地图挑战";

export const reviewCandidateStatus = (candidate: AdminSubmissionReviewCandidate): { label: string; tone: "success" | "warning" | "default" } => {
  if (candidate.evidence === "matched") return { label: "满足条件", tone: "success" };
  if (candidate.selectedBy === "reviewer") return { label: "已人工确认", tone: "success" };
  if (candidate.evidence === "needs_confirmation") return { label: candidate.missingFields.length ? `缺少${reviewFieldList(candidate.missingFields)}` : "证据不完整", tone: "warning" };
  if (candidate.evidence === "unsupported") return { label: "无法自动判定", tone: "warning" };
  return { label: "识别结果不满足", tone: "default" };
};

export const reviewCandidateSearchText = (candidate: AdminSubmissionReviewCandidate) => [candidate.label, candidate.titleName, candidate.mapName, candidate.difficulty, candidate.condition]
  .filter((value): value is string => Boolean(value))
  .join(" ")
  .toLocaleLowerCase();

const blockingMessages: Record<string, string> = {
  SUBMISSION_OUTCOME_NOT_CONFIGURED: "当前没有可产生的结果。请校正识别字段，或确认截图能证明的 Challenge。",
  CHALLENGE_CONFIRMATION_INELIGIBLE: "所选 Challenge 已不适用于该提交（可能已拥有、已被撤销或配置已变更），请重新选择。",
  CHALLENGE_NOT_COMPLETABLE: "所选 Challenge 在提交时不可完成（未开放、已结束或仅限手动发放）。",
  TITLE_GRANT_ADMINISTRATIVELY_REVOKED: "玩家的该称号已被管理员撤销，不能通过审核重新获得。",
  SUBMISSION_REVISION_MISMATCH: "所选 Challenge 的地图版本与提交记录不一致。",
  GAMEPLAY_REVISION_NOT_FOUND: "找不到所选 Challenge 对应的地图版本。",
  CHALLENGE_REWARD_NOT_CONFIGURED: "所选 Challenge 尚未配置可发放的称号。",
  CHALLENGE_NOT_FOUND: "所选 Challenge 的配置不存在。",
  TITLE_NOT_FOUND: "所选 Challenge 的称号不存在。",
  SUBMISSION_NOT_REVIEWABLE: "该提交没有可核对的识别结果。可以重新发送 OCRKit 请求，或要求重新提交。",
  SUBMISSION_CORRECTION_INVALID: "有字段值无法识别：通关标记填写“已完成”或“未完成”，地图版本填写“经典”或“标准”。",
};

export const knownReviewBlockingMessage = (code: string | null | undefined) => code ? blockingMessages[code] ?? null : null;
export const reviewBlockingMessage = (code: string | null | undefined) => code ? knownReviewBlockingMessage(code) ?? `暂时无法通过（${code}）。` : "";

export const verifiedRunPreviewLabel = (verifiedRun: AdminSubmissionReviewPreview["verifiedRun"]) => verifiedRun.status === "recorded"
  ? "已记录 Verified Run"
  : verifiedRun.status === "eligible"
    ? "将按识别结果记录 Verified Run"
    : null;
