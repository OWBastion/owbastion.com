圆形图标按钮，点开下拉菜单选择浅色、深色或跟随系统主题。无 props、slots、emits，直接写入 `colorMode.preference`。

**结构**
- 触发器：2.75rem 圆形，边框 `line-strong`，透明底，色 `muted`，内含当前主题图标。
- 菜单单组：「浅色」「深色」「跟随系统」；选中项右侧带勾。

**状态**
- 水合前当前项视为「跟随系统」，且不显示勾选。
- 水合后按偏好显示图标与勾选。
- 悬停或打开：边框与图标变 `accent`，底为 `accent-surface`（过渡 160ms）。

**令牌**
- `hit-target-lg`、`pressable`、`portal-menu-surface`、`elevation-2`、`line-strong`、`muted`、`accent`、`accent-surface`。

**无障碍**
- 触发按钮 `aria-label` 形如「当前主题：跟随系统，打开主题菜单」；图标 aria-hidden。
- 菜单项最小高度 `min-h-11`。
