# EditorialToc

文章目录导航，可选滚动监听高亮当前章节。

**属性**：`entries`（id、text、depth）、`spy?`。

**结构**
- `nav`（aria-label「本文目录」）：标题「本文目录」（--quiet，在文章内联 details 里隐藏）；有序列表，左侧 1px --line 竖线。
- 每项为指向 `#id` 的锚点链接，--muted；depth>2 的项缩进 `--space-4` 且字号小 1px。
- spy 模式：以视窗高度 30% 处为阅读线，最后一个越过该线的标题为当前项。

**状态**
- 当前项：左侧 2px --accent，字色 --text，600，`aria-current="location"`
- hover / focus-visible：字色 --text
- 非 spy 时无高亮

**无障碍**：nav 有名称；列表为有序列表。
