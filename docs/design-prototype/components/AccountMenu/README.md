头部右侧的圆形头像按钮，点开显示玩家账户下拉菜单（含管理后台与退出）。

**结构**
- 触发器：`button.account-trigger`，2.75rem 圆形，边框 `line-strong`，字色 `accent`，底 `accent-surface`；内含玩家名首字（aria-hidden）。
- 菜单第 1 组：标签项「{playerName}#{playerId}」。
- 第 2 组链接：「我的」「个人主页」「个人设置」；仅 `isAdmin` 时追加「管理后台」；最后「退出」（`color=error`，触发 `logout`）。

**状态**
- 打开态（`aria-expanded`）与悬停：触发器边框变 `accent`。
- `isAdmin` 控制「管理后台」项是否出现；无加载、空、错误态。

**令牌**
- `hit-target-lg`、`pressable`、`portal-menu-surface`、`elevation-2`、`line-strong`、`accent`、`accent-surface`。

**无障碍**
- 触发按钮 `aria-label="打开账户菜单"`；头像字 aria-hidden。
- 键盘交互由下拉菜单组件提供，菜单项最小高度 `min-h-11`。
