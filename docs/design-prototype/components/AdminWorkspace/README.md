# AdminWorkspace

管理后台页面的外壳：标题行、计数、操作区、消息区、工具栏和主内容插槽。每个后台页面都从它开始。

**结构**
- `main.admin-workspace.page-shell--wide`：标题 `h1`（`type-title`）加可选计数（`type-caption`、`quiet`），右侧是 `actions` 插槽。
- 自上而下：`messages` 提示区、`toolbar` 工具栏、默认插槽主内容。
- 属性：`title`（必填）、`count`（可选）；插槽 `actions`、`messages`、`toolbar`。

**状态**
- 没有 `count` 不渲染计数；没有 `actions`、`messages`、`toolbar` 插槽则整块不渲染。
- 窄于 47.99rem：标题行改纵向，操作按钮铺满；工具栏纵向堆叠。

**配套全局类**：`.admin-toolbar`（`line` 边框、`radius-control`）、`.admin-alert`（`danger` 浅底）、`.admin-feedback`（`accent-surface` 底）、`.admin-empty`（居中、`quiet`）。

**无障碍**：用语义 `main`、`header`、`h1`；操作区按钮和链接最小高度 2.75rem。
