# AdminPlayerIdentityEditor

在对话框中编辑玩家名称（数字 ID 不变），并实时预览战网 ID。

**结构**：基于 `AdminResponsiveDialog`，标题“编辑战网 ID”，说明为当前 “名称#ID”，尺寸 `sm`。
- “玩家名称”（必填，最长 64 字符）。
- “玩家 ID”只读，等宽、`muted` 色，禁用样式即表明不可改，不加提示
- 预览 `output`：小字“预览”加 `strong` “名称#ID”，`accent-surface` 底。
- 页脚：“保存战网 ID”（提交）和“取消”。

**状态**
- 打开时草稿等于当前名称；预览用去掉首尾空白的名称，为空时回退原名。
- 保存按钮禁用：名称为空、与原名相同或正在保存。
- `loading`：输入和取消禁用，对话框不可关闭。

**无障碍**：预览 `aria-live="polite"`；必填字段带 `required`；回车提交表单。
