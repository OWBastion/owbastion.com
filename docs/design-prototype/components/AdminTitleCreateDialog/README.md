# AdminTitleCreateDialog

新建称号的对话框。只建称号，不建挑战；新称号固定为草稿。

**结构**
- 标题“新建称号”，说明“新称号先存为草稿，添加并开放挑战时一起启用。”
- 字段：称号名称*、系列*（选择已有或输入新的）、称号范围（分段：全局称号 / 地图称号，下方说明随选择变化）、展示方式、颜色、图标、自定义图标（选择文件）、“公开显示”复选框。
- 折叠区“更多设置”：唯一 key（留空自动生成，创建后不能修改）、游戏版本（留空使用最新版本）。
- 底部：“取消”、“仅创建称号”、主按钮“创建并添加挑战”（创建后直接打开 `AdminChallengeDialog` 的添加模式）。
- 没有生命周期字段：草稿是唯一起点。

**状态**
- 保存中全部输入禁用，提交按钮 loading。
- 名称或系列为空时两个创建按钮禁用。
- 服务端报错：顶部错误提示“无法创建称号”，字段级错误落到对应字段，例如唯一 key 冲突显示“已被「终极闪避」使用”，并自动展开“更多设置”。

**Token**：外壳 `AdminResponsiveDialog`（`radius-sheet`、`elevation-3`）；分段控件底 `surface-raised`，选中项 `surface` 加 `elevation-1`；错误用 `danger`。

**无障碍**
- 原生 form 与 `required`；分段控件是 radiogroup。
- 字段错误用 `aria-invalid` 和 `aria-describedby` 关联到错误文字。

**合并建议稿（2026-10，#450）**：原 `AdminAchievementCreateDialog`（一次建称号加挑战）拆成本对话框和 `AdminChallengeDialog`；原 `AdminAchievementEditorDialog` 编辑称号目录项的部分由本对话框的编辑模式承担（同一组字段，不含唯一 key，标题“编辑称号”，按钮“保存”）。`AdminAchievementCreateDialog` 删除。
