/** OCR 识别状态文案，唯一来源见 docs/design-rules/terminology.md。仅用于管理后台。 */
export const ocrStatusText: Record<string, string> = {
  not_started: "未开始",
  pending: "识别中",
  matched: "已匹配",
  mismatch: "未匹配",
  review_required: "需人工核对",
  error: "识别失败",
};

export const ocrStatusLabel = (status: string) => ocrStatusText[status] ?? status;

export const ocrStatusTone = (status: string) => status === "matched" ? "success" : status === "mismatch" || status === "review_required" || status === "error" ? "warning" : "default";
