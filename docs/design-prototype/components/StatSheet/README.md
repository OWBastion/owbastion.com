概览行：3 到 4 个大数字，标签在下，1px 分隔。

**使用**：传入 `stats: { label, value, unit? }[]`。宽于 36rem 时按数量横排，窄时两列。

**规则**
- 数值用 `type-headline` 的尺寸、字重 700、等宽数字；单位和分母用 `type-caption` 和 `quiet`。
- 只展示平台已有数据，缺失写“—”。
