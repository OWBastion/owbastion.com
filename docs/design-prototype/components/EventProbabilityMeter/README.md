事件出现概率的迷你横条：条长相对最大概率，数字为绝对值。

**使用**：传入 `probability: number | null`、`max` 与可选 `label`（如「概率」）。

**结构**
- 可选标签 → 横条（高 0.375rem，底 `line`，圆角 `radius-pill`，填充 `accent`）→ 数值（最小宽 3rem，右对齐，`text`，600，`tabular-nums`）。
- 条长为 `probability / max` 的百分比，最小 2%。
- 整体为 `muted` 色小字（caption 字号），间距 `space-2`。

**状态**
- `probability` 为 null 时整个组件不渲染。
- `max <= 0` 时比例为 0，条仍保持最小宽度 2%。
- 百分比的具体格式由 `formatProbability` 决定。

**无障碍**
- 根元素 `role="img"`，`aria-label="{label ?? 出现概率} {百分比}"`。
