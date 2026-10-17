# AdminTitleMigrationHolders

历史称号迁移左侧的持有者列表面板，支持搜索、状态筛选、选择和分页。

**结构**
- 头部：标题“迁移对象”加“N 位”徽章；搜索框占位“搜索持有者或称号”
- 筛选条：“全部”“有未关联”“已完成”，选中为 soft+primary，其余 ghost
- 持有者列表（最高 560px 可滚动）：34px 首字母头像、名称、“N 项称号 · M 项未关联”、状态徽章“有未关联”(warning)/“已完成”(success)
- 页数大于 1 时底部居中分页

**状态**
- 加载：居中“读取中…”（`role="status"`），分页禁用
- 空态：“暂无匹配持有者”
- 选中项背景 `accent-surface`；悬停混入 `surface-raised`；聚焦 3px `accent` 内描边

**Token**：`accent`、`accent-surface`、`on-accent`、`surface-raised`、`line`、`quiet`；每项最小高度 2.75rem。

**无障碍**
- 搜索区 `role="search"`，筛选按钮 `aria-pressed`
- 列表 `role="listbox"`（`aria-label="历史持有人"`），项 `role="option"` 加 `aria-selected`
- 头像 `aria-hidden`
