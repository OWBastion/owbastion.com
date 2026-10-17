# EditorialNeighbors

文章底部的「上一篇 / 下一篇」导航卡。

**属性**：`older`、`newer`，类型 `{ path, title, label }`。两者都为 null 时整个组件不渲染。

**结构**：`nav`（aria-label「上一篇和下一篇」），两列网格，间距 `--space-3`。
- older：整卡链接，label 行（--quiet，左箭头 + label）+ 粗体标题
- newer：同样的卡片，右对齐，位于第二列，右箭头
- 卡片使用 `surface-card`、`interactive-card`、`pressable-soft`，padding `--space-4`；标题用 `--type-card-title-size` / 600 / 行高 1.35

**状态**：只有 newer 时卡片仍占第二列；容器小于 48rem 变单列。

**无障碍**：整卡为链接；箭头图标 `aria-hidden`。
