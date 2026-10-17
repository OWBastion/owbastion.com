列出玩家最近的截图提交（地图、时间、状态徽标）；没有记录时引导去提交。

**使用**：传入 `submissions`（含 `mapName`、`status`、`resubmissionRequired`、`updatedAt`、可选 `verifiedRunOutcome`）。

**结构**
- 每项是整行链接（`interactive-card`、`pressable-soft`，圆角 `radius-card`）：左侧地图名＋更新时间（`quiet`，有验证结果时追加「 · {说明}」），右侧 `SubmissionStatusBadge`。

**状态**
- 空态：标题「暂无提交记录」，描述「提交完成截图，开始记录你的地图精通进度。」，主按钮「提交截图」。
- 容器窄于 24rem 时每行改为纵向。
- 验证结果的具体说明文案由 `verifiedRunOutcomePresentation` 决定。

**无障碍**
- 整行为链接，无额外 aria；列表由链接序列构成（无 ul）。
