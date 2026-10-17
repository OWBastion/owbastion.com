# ChangelogRelativeDay

在版本更新日期后追加「 · 相对日」文字。仅在客户端挂载后渲染，避免 SSR 水合差异。

**属性**：`value`（string 或 Date）、`now?`、`timeZone?`。文案由 `formatRelativeCalendarDay` 生成（具体词汇以该函数为准，预览中的「昨天」仅为示例）。

**结构**：单个 `span`，内容为「 · {label}」，颜色 --quiet，字号继承父级。作为 `<time>` 内部的行内补充文字。

**状态**：挂载前（SSR / 首次渲染）label 为空，不渲染 span；label 为空字符串时同样不渲染。

**无障碍**：无额外 aria。
