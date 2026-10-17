# AdminAchievementDialogs

成就管理页的对话框容器：编辑对话框、结束挑战或退休称号的确认框、新建对话框。状态都来自 workspace composable。

**结构**
- 同级三个对话框：AdminAchievementEditorDialog、结束确认框（小尺寸）、AdminAchievementCreateDialog
- 结束确认框：退休称号时标题“退休称号”、正文“退休后该称号不再发放。”、按钮“确认退休”
- 结束挑战时标题“结束挑战”、正文“结束后不再接受新的截图提交。”、按钮“结束挑战”
- 确认按钮为 `error` 软按钮，取消为中性描边

**状态**
- `endTarget` 不为 null 时确认框打开，关闭时调用 `closeEnd`
- 保存中确认按钮 loading、取消禁用、不可关闭

**Token**：正文 `muted`，字号约 .86rem，行高 1.55；危险按钮用 `danger` 软色。

**无障碍**
- 标题与焦点管理由 AdminResponsiveDialog 提供
- 原生 form 提交
