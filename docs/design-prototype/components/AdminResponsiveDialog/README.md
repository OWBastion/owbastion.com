# AdminResponsiveDialog

桌面端渲染为居中 `UModal`、窄屏渲染为底部 `UDrawer` 的响应式对话框容器。后台所有弹出表单和确认都用它。

**使用**
- `v-model:open` 必填；`title` 必填，`description` 可选；`size` 为 `sm`、`md`（默认）、`lg`、`xl`；`dismissible` 默认 true。
- 插槽 `body`、`footer`；没有 `footer` 插槽就没有页脚。页脚内容包在 `action-row` 里。

**外观**
- 断点 768px：以上是模态框，面板用 `glass-heavy`、`elevation-3`，圆角 `radius-sheet`；以下是底部抽屉，只圆上沿。
- 页眉页脚用 `glass-segment`；正文可滚动并 `overscroll-behavior: contain`。抽屉页脚底部留出安全区。

**状态**
- `dismissible=false`：点遮罩和按 Esc 都不能关闭（保存中使用）。
- 偏好减少动效时关闭过渡。仅在客户端 hydrate 之后渲染。

**无障碍**：打开时记录触发元素，焦点移到面板内第一个可聚焦元素；关闭后还原焦点；标题和说明交给 Nuxt UI 关联。
