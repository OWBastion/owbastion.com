# ReviewSummary

展示评价汇总（平均分与 1–5 星分布）和分页的玩家文字评价。

**属性**：`summary`（averageRating、reviewCount、ratingDistribution、sampleInsufficient）、`comments`、`loading`、`page`、`total`、`hasMore`；事件 `page`。

**结构**
- 概览：左侧平均分大字 + 「{n} 条有效评价」；右侧「评分分布」5→1 星各一行（「{r} 星」、7px 进度条、数量），条宽按最大值归一化，填充 --accent，轨道 --surface-raised。
- 评论区：「玩家评价」+ 「{total} 条」；每条显示「{昵称或匿名评价}」、「{n} 星 · {日期}」和正文。
- 分页（total>0）：「上一页」「第 {page} 页」「下一页」。

**状态**
- 加载：「读取中…」（`role="status"`）
- 无评分：平均分显示「暂无评分」
- 无评论：「暂无文字评价。」；评论为空：「未填写文字内容」
- 上一页在 loading 或第 1 页时 disabled；下一页在 loading 或 `!hasMore` 时 disabled
- 容器小于 24rem 时概览改单列

**无障碍**：外层 `aria-live="polite"`；进度条 `role="progressbar"` aria-label「{r} 星评价数量」；分页容器 aria-label「评价分页」。

**建议稿（2026-10）**：移除“样本不足，评分仅供参考。”状态，不再有该中间态。
