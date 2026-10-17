键值详情：`<dl class="detail-grid">`，每行 `<div class="detail-grid__row">`。

**规则**
- 标签列 7.5rem，列间距 `space-4`，行内边距 `space-3`，行间 1px `line` 分隔线。
- 标签用 `type-label-sm` 和 `muted`；值用 `type-label` 和 `text`，数字等宽，长文本 `overflow-wrap: anywhere`。
- 值是文字、数字、徽章或链接，不放按钮。缺失写“暂无记录”（`quiet`），不留空单元格也不写“-”。
- 容器小于 24rem 时每行改为上下堆叠，仍左对齐。
