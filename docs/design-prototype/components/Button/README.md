只有一种按钮：`UButton`，主题只在 `app.config.ts` 里定义一次。

**角色**：主要 `color="primary"`；次要 `neutral outline`；低强调 `neutral soft`；三级和纯图标 `neutral ghost`；危险 `error soft`。一个区域只放一个主要按钮。

**尺寸**：`sm` 用 `control-sm`（密集表格、工具栏）；`md` 用 `control-md`（默认）；`lg` 用 `control-lg`（玩家流程的主操作）。粗指针下三种尺寸都变成 `control-lg`。

**规则**
- 圆角一律 `radius-control`，图标 16px，图标与文字间距 `space-2`。
- 悬停只改填充；按压用 `pressable`（`press-scale`）。
- 禁用用 `disabled` 加 0.5 透明度；忙碌用 `loading` 加文案（如“保存中…”），并阻止重复提交。
- 导航用 `NuxtLink` 或 `UButton to`，不用只做路由跳转的点击处理。
- 不要写 CSS 按钮类，也不要给原生 `<button>` 套样式。
