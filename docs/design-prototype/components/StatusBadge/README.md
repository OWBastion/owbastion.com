附在某个对象上的状态徽章。优先用它，不要临时拼 chip。已合并原 `SubmissionStatusBadge`（投稿状态映射）和 `ReviewSummaryBadge`（评分摘要）。

**语气**：`default`（muted）、`info`（处理中、提示）、`success`（完成、通过）、`warning`（等待、需重新提交）、`error`（失败）、`accent`（评分摘要，前置 ★，`icon` 属性）。

**规则**
- 必须带文字，颜色只是辅助。
- 高度至少 24px，内边距 `space-1` `space-2`，圆角 `radius-pill`。
- 成功色不表示“强调”，强调用 `accent`。

**投稿状态**（原 `SubmissionStatusBadge`，改为工具函数 `playerSubmissionStatusLabel` / `playerSubmissionStatusTone` 加 `StatusBadge`，不再是组件）
- 映射：`approved`、`completed` 为 success；`rejected` 为 error；`resubmission_required` 为 warning；`processing`、`needs_review`、`ocr_pending`、`awaiting_player_confirmation`、`ready_for_review`、`ocr_review_required` 为 info；其余为 default。
- 玩家接口把 `resubmission_required` 折进 `rejected`，用 `resubmissionRequired` 标记，展示为“需重新提交”（warning）。多个等待状态统一显示“等待核对”。

**评分摘要**（原 `ReviewSummaryBadge`，改为 `StatusBadge tone="accent" icon="★"`）
- 状态：有评分“4.6 分 · 12 条”；暂无评分；评分暂不可用（`default` 灰）；读取中“读取中…”。
- 条数少的评分照常显示，没有“样本不足”这个中间态；要么显示，要么“暂无评分”。
- 只展示平台已有数据，缺失显示“暂无评分”，不编造等级。

**合并建议稿（2026-10）**：三个组件的外观都是 24px 胶囊加文字，只差内容来源。以后只有 `StatusBadge` 一个组件，其他内容来源在调用处映射。
