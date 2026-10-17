# EditorialEntryList

开发日志 / 版本更新的列表。blog 顶部精选最新一篇，其余按年份分组；changelog 按年份分组并标记最新版本。

**属性**：`entries`（path、title、description?、date、version?、tags?）、`kind`。

**结构**
- 精选卡（仅 blog）：「最新」药丸 + 日期、标题（headline 字阶）、描述、标签、「阅读全文」+ 右箭头（--accent）。边框 --line，`radius-card`，--surface 底。
- 年份分组：`section` aria-label「{year} 年」，h2 年份 + 延伸横线；`ul` 每行两列（5.5rem 日期 / 内容）。
- 行内：`<time>` 月日；changelog 显示版本药丸（sr-only「版本 」）和最新条目的「最新」药丸；标题；blog 另显示描述（两行截断）和标签。

**状态**：空 entries 只渲染空容器，无空态文案；容器小于 40rem 时行改单列、日期在上；hover/focus 行底 --surface；`contrast:more` 下精选卡边框 --text。

**无障碍**：年份 section 有名称；`<time datetime>`；列表语义 ul/li。
