称号详情弹窗：带倾斜光泽的称号徽标、获得信息，以及跳转管理佩戴的入口。

**使用**：传入 `title: OwnedTitle | null`，用 `v-model:open` 控制开关。

**结构**
- 弹窗标题为称号名（无则「称号」），描述为「已佩戴」或「未佩戴」。
- 徽标：10rem 的 `PlayerTitleMark`，无边框、无倾斜；135° 斜向高光自左上扫向右下，弹窗打开时播放一次，指针悬停时再播放；`prefers-reduced-motion` 下不播放。
- 事实列表（按存在条件显示）：「地图」「系列」「槽位」「获得时间」（始终显示）「获得条件」。
- 页脚：「管理佩戴称号」（outline，前往 /achievements）、「关闭」（ghost）。

**状态**
- `title` 为 null 时内容为空。
- 高光扫过 .9s ease-in-out。

**令牌**
- `detail-grid`、`radius-card`、`text`、`space-5`。

**无障碍**
- 焦点管理与标题、描述由弹窗组件提供；无额外 aria。
