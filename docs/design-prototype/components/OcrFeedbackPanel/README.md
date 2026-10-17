# OcrFeedbackPanel

让玩家标记 OCR 识别结果「准确 / 有误」的反馈卡。提交后向 `POST /v1/me/submissions/{id}/ocr-feedback` 写入标记（带 Idempotency-Key）。

**结构**
- 成功提示（`role="status"` `aria-live="polite"`）：「已记录」
- 失败提示：默认「无法记录，请稍后重试。」
- 卡片（`elevation-2`）：标题「识别是否准确」；不再单独显示“当前标记”（已选按钮的主色即表示）；说明一句「只用于改进识别，不影响审核结果。」
- 按钮「识别准确」「识别有误」（sm）：当前标记项为主色实心，其余次要描边。

**状态**：busy 时按钮 loading 且 disabled、卡片 `inert` + `aria-busy`；点击已选中项无动作。事件：`recorded`；服务端返回 OCR_PROMPT_STALE 时触发 `stale`。

**Token**：`card-heading`、`elevation-2`、--line、--muted、--space-2/-3。
