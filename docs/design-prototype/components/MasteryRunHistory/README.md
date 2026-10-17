某地图的已验证通关历史列表，带分页。

**使用**：传入 `mapName`、`history`（runs、total、page、pageSize、hasMore）、`loading`、`error`；触发 `change-page`、`retry`。

**结构**
- 标题行：「通关记录」＋右侧「{total} 条」（`quiet`）。
- 列表：左侧「{mapName} · {难度}」，下方 `time` 元素显示「{日期} · {时长}」（`quiet`）；右侧「{awardedXp} XP」（`accent`），状态不是有效时附「已失效」徽标。
- 分页（仅 total 大于每页数量时出现）：「上一页」「第 {page} / {totalPages} 页」「下一页」。

**状态**
- 读取中：`role="status"`，`aria-label="读取通关记录…"`，两块骨架。
- 错误：「无法读取通关记录」＋错误文案＋「重试」。
- 空：「暂无通关记录」。
- 「上一页」在第 1 页禁用；「下一页」在没有更多时禁用。
- 容器窄于 24rem 时行改纵向，分页变两列按钮、页码居中置顶。

**无障碍**
- section `aria-labelledby`；分页 `nav aria-label="通关记录分页"`；时间使用 `time datetime`。
