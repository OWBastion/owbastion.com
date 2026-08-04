export const submissionStatusText: Record<string, string> = {
  upload_pending: "上传中…",
  received: "已收到",
  evidence_pending: "保存截图中",
  evidence_stored: "截图已保存",
  ocr_pending: "等待识别",
  awaiting_player_confirmation: "等待确认挑战",
  ready_for_review: "等待核对",
  ocr_review_required: "等待处理",
  approved: "已通过",
  rejected: "未通过",
  resubmission_required: "需重新提交",
};

export type SubmissionStatusTone = "default" | "info" | "success" | "warning" | "error";

export const submissionStatusTone = (status: string): SubmissionStatusTone => {
  if (status === "approved") return "success";
  if (status === "rejected") return "error";
  if (status === "resubmission_required") return "warning";
  if (["ocr_pending", "awaiting_player_confirmation", "ready_for_review", "ocr_review_required"].includes(status)) return "info";
  return "default";
};
