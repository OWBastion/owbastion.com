import type { AdminSubmission, AdminSubmissionReviewCandidate, AdminSubmissionReviewPreview } from "~/composables/useAdminApi";

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
  SUBMISSION_CORRECTION_INVALID: "有字段值无法识别：通关用时、死亡次数、跳过次数需为整数。",
};

export const knownReviewBlockingMessage = (code: string | null | undefined) => code ? blockingMessages[code] ?? null : null;
export const reviewBlockingMessage = (code: string | null | undefined) => code ? knownReviewBlockingMessage(code) ?? `暂时无法通过（${code}）。` : "";

export const verifiedRunPreviewLabel = (verifiedRun: AdminSubmissionReviewPreview["verifiedRun"]) => verifiedRun.status === "recorded"
  ? "已记录 Verified Run"
  : verifiedRun.status === "eligible"
    ? "将按识别结果记录 Verified Run"
    : null;

const verifiedRunReasonLabels: Record<string, string> = {
  mastery_rollout_disabled: "Verified Run 尚未开启（平台未配置最低游戏版本与 OCR 布局版本）",
  unsupported_schema_version: "识别结果的数据版本不受支持",
  unsuccessful_response: "OCRKit 识别未成功",
  unsupported_layout: "截图布局版本不受支持",
  unreliable_challenge_completed: "通关标记识别可信度不足",
  unreliable_map_name: "地图识别可信度不足",
  unreliable_difficulty: "难度识别可信度不足",
  unreliable_version: "游戏版本识别可信度不足",
  unreliable_run_code: "对局码识别可信度不足",
  unreliable_duration_seconds: "通关用时识别可信度不足",
  invalid_map_variant: "地图版本无效",
  unreliable_map_variant: "地图版本识别可信度不足",
  gameplay_revision_not_found: "找不到该地图对应的玩法版本",
  submission_revision_mismatch: "地图玩法版本与提交记录不一致",
  mastery_run_invalidated: "该 Verified Run 已被作废",
  same_player_run_code: "该玩家已有相同对局码的记录",
  completion_not_confirmed: "通关标记不是已完成",
  missing_map: "缺少地图",
  canonical_map_not_found: "地图不在平台地图列表中",
  ambiguous_map: "地图名称对应多张地图",
  submission_map_mismatch: "地图与提交的目标地图不一致",
  invalid_difficulty: "难度无效",
  unsupported_game_version: "游戏版本缺失或不受支持",
  invalid_game_version: "识别到的游戏版本号格式异常，请在「更多字段」中核对版本",
  invalid_run_code: "对局码缺失或无效",
  invalid_completion_duration: "通关用时缺失或无效",
  invalid_settlement_value: "死亡或跳过次数无效",
  required_map_variant_mismatch: "该挑战要求经典版本",
  player_not_active: "玩家账号不可用",
  conflicting_run_code_evidence: "与已有的同对局码记录冲突",
};

/** Why no Verified Run would be recorded; null when none is expected to explain (eligible/recorded, or nothing to report). */
export const verifiedRunIneligibleLabel = (verifiedRun: AdminSubmissionReviewPreview["verifiedRun"]) => verifiedRun.status === "ineligible" && verifiedRun.reason
  ? `不会记录 Verified Run：${verifiedRunReasonLabels[verifiedRun.reason] ?? verifiedRun.reason}`
  : null;

const reviewDecisionText: Record<NonNullable<AdminSubmission["review"]>["decision"], string> = {
  approved: "通过",
  rejected: "驳回",
  resubmission_required: "要求重新提交",
};

export const reviewRecordLabel = (review: NonNullable<AdminSubmission["review"]>) => `${review.automatic ? "自动判定" : "维护者"}${reviewDecisionText[review.decision] ?? review.decision}`;
