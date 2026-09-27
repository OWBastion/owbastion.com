export const submissionStatusText: Record<string, string> = {
  processing: "处理中",
  needs_review: "等待核对",
  completed: "已完成",
  rejected: "未通过",
  upload_pending: "上传中…",
  received: "已收到",
  evidence_pending: "保存截图中",
  evidence_stored: "截图已保存",
  ocr_pending: "等待识别",
  awaiting_player_confirmation: "等待确认挑战",
  ready_for_review: "等待核对",
  ocr_review_required: "等待处理",
  approved: "已通过",
  resubmission_required: "需重新提交",
};

export type SubmissionStatusTone = "default" | "info" | "success" | "warning" | "error";

export const submissionStatusTone = (status: string): SubmissionStatusTone => {
  if (["approved", "completed"].includes(status)) return "success";
  if (["rejected", "rejected_final"].includes(status)) return "error";
  if (status === "resubmission_required") return "warning";
  if (["processing", "needs_review", "ocr_pending", "awaiting_player_confirmation", "ready_for_review", "ocr_review_required"].includes(status)) return "info";
  return "default";
};

/** Player API folds resubmission_required into rejected and flags it with resubmissionRequired. */
export const playerSubmissionStatusLabel = (status: string, resubmissionRequired?: boolean) => status === "rejected" && resubmissionRequired
  ? submissionStatusText.resubmission_required!
  : submissionStatusText[status] ?? status;

export const playerSubmissionStatusTone = (status: string, resubmissionRequired?: boolean) => submissionStatusTone(status === "rejected" && resubmissionRequired ? "resubmission_required" : status);
