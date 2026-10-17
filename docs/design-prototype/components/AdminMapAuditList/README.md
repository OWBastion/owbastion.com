# AdminMapAuditList

按时间序列列出地图编辑审计记录。传入 `audit`，无事件和插槽。

**结构**
- 有序列表，每项左侧操作名加详情，右侧时间（zh-CN，中等日期加短时间）
- 操作名：保存地图资料、创建版本修订、保存版本修订；未知操作显示原始 operation
- 详情：创建修订未复制进度时“复制配置；未复制进度”；保存修订“状态：旧 → 新；未复制进度”；其他“地图资料变更”

**状态**
- 空态：`UEmpty` 标题“暂无地图编辑记录”
- 没有加载态和错误态；缺失的生命周期显示“—”

**Token**：`line`、`quiet`、`muted`；条目上下 `space-3`，间距 1rem，1px 分隔线。

**无障碍**
- 语义 `ol` 和 `li`
- 没有额外 aria


**状态展示**（建议稿，预览已按此绘制，代码尚未实现）
- 版本修订的状态变化不再拼成「状态：preparing → default」文字：前后状态各用 `StatusBadge` 显示，文案和语气与 `AdminMapRevisionStrip` 一致（准备中 warning、可选 info、正式 success、历史 default），不显示内部 enum key。
