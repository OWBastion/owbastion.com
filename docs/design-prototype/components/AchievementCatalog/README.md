按分类分组展示公开成就目录（图标、称号名、完成条件、状态）。

**使用**：传入 `challenges: PublicAchievement[]`（`family="achievement"`，用到 `category`、`titleName`、`condition`、`iconUrl`、`icon`、`status`、`retiredVersion`）。分类与卡片均按 zh-CN 排序。

**结构**
- 每个分类一个 section：标题（type-headline）＋「{n} 项」（`quiet`），相邻分类间距 `space-8`。
- 卡片网格：3.5rem 虚线边框图标框（`line-strong`）、称号名、完成条件（`muted`）。
- 图标：有 `iconUrl` 用图片（60%，alt 为空），否则使用图标名。

**状态**
- `scheduled`：纯文字「未开放」（`quiet`）。
- `sunsetting`：警告徽标「即将结束」＋小字显示 `retiredVersion`。

**建议稿（预览已按此绘制，代码尚未实现）**
- 两种状态统一为同一位置的徽标行：「即将结束」警告徽标＋`endsAt` 截止时间；「未开放」中性徽标＋`startsAt` 开放时间；已开放不显示。
- 公开 Challenge 契约的成就类已有可选 `startsAt` / `endsAt`；没有时间时回退到现状（`retiredVersion` 或只显示徽标）。
- `MyAchievementOverview` 里的同类状态文字也应对齐。
- 空态：「暂无记录」。
- 容器窄于 24rem 时图标缩至 2.5rem。

**无障碍**
- 每个分类 section 以标题 id 做 `aria-labelledby`；图标 aria-hidden。
