# PlayerReviewPanel

地图或目标详情内的「玩家评分」区块：评价汇总 + 登录引导或评价编辑器 + 反馈提示。数据来自 `usePlayerReview`。

**属性**：`targetType`、`targetId`、`authenticated`、`gameplayRevisionId?`；事件 `review-changed`（保存或撤回成功后）。

**结构**
- 标题「玩家评分」+ 徽标：加载中「读取中」、不可用（warning）「暂不可用」、正常状态不显示徽标。
- ReviewSummary（透传汇总、评论与分页）。
- 其后按状态切换：
  - 不可用：警告提示「评价暂不可用」，无描述
  - 未登录：按钮「登录后评分」（跳转 `/login?returnTo=…`）
  - 已登录且非 loading：ReviewEditor
  - 有错误时：错误提示 +「重新读取评价」按钮（loading 时 disabled）；成功时显示成功提示（文案来自 composable）

**状态**：loading（编辑器隐藏）、unavailable、guest、signed-in editing、error（含重试）、success。

**无障碍**：section `aria-labelledby="review-title-{targetId}"`；错误 `role="alert"`；成功 `aria-live="polite"`。

**建议稿（2026-10）**：正常状态去掉“公开结果”徽标（无信息量）；平均分数字取消负字距，小数点两侧留出间隙，使“4.3”的小数点清晰可见（ReviewSummary 同步）。
