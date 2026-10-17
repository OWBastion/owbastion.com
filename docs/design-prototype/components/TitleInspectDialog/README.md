称号详情弹窗：带倾斜光泽的称号徽标、获得信息，以及跳转管理佩戴的入口。

**使用**：传入 `title: OwnedTitle | null`，用 `v-model:open` 控制开关。

**结构**
- 弹窗标题为称号名（无则「称号」），描述为「已佩戴」或「未佩戴」。
- 徽标舞台：7.5rem 的 `PlayerTitleMark`，随指针倾斜，悬停时叠加径向光泽。
- 事实列表（按存在条件显示）：「地图」「系列」「槽位」「获得时间」（始终显示）「获得条件」。
- 页脚：「管理佩戴称号」（outline，前往 /achievements）、「关闭」（ghost）。

**状态**
- `title` 为 null 时内容为空。
- 倾斜过渡 .45s ease-out（倾斜中 .08s linear），光泽透明度 0→1。

**令牌**
- `detail-grid`、`radius-card`、`text`、`space-5`。

**无障碍**
- 焦点管理与标题、描述由弹窗组件提供；无额外 aria。
