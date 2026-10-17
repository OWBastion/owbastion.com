# AdminAchievementNav

成就管理三个子页面的下划线式导航：称号目录、通用挑战、地图挑战。无 props、事件和插槽，内部读取当前路由。

**结构**
- `nav` 内三个链接：称号目录（/admin/achievements/titles）、通用挑战（/admin/achievements/challenges）、地图挑战（/admin/achievements/map-challenges）
- 底部 1px `line` 分隔线，字重 600，无文字装饰

**状态**
- 当前路由：文字 `text`，底部 2px 下划线（currentColor），`aria-current="page"`
- 其余链接 `quiet` 色，下划线透明
- 没有禁用和加载态

**Token**：`line`、`quiet`、`text`、`space-2`、`space-4`。

**无障碍**
- `nav` 的 `aria-label` 为“挑战与称号”
- 当前页用 `aria-current="page"`，不只靠颜色
