# AdminSpatialConfigInput

空间配置编辑入口：用分段切换在“单一地图”和“多合一（每局随机抽几段）”两种路线类型间切换，分别委托给坐标输入和复合输入。

**结构**
- 分段控件（`role="group"`，`aria-label="路线类型"`）：“单一地图”“多合一（每局随机抽几段）”
- 单一地图显示 AdminSpatialCoordinatesInput；多合一显示 AdminCompositeSpatialConfigInput
- 缺少 endPosition 的旧结构按 legacy 模式处理，否则为 current

**状态**
- 选中项（`aria-pressed=true`）文字 `text`、背景 `surface`、带阴影；`disabled` 时透明度 .6
- 切换时各自保留草稿；没有草稿时创建空复合配置；`revisionKey` 变化时按 modelValue 重新同步模式
- 空态和错误文案由子组件处理

**Token**：`surface-raised`、`surface`、`text`、`muted`、`radius-control`；按钮字号 0.875rem、字重 500。

**无障碍**
- 按钮 `aria-pressed`，原生按钮键盘行为
- 分段控件有 `aria-label`
