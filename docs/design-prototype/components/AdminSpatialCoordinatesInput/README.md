# AdminSpatialCoordinatesInput

粘贴并解析 Workshop 或 .opy 点位代码的输入框，带解析状态徽标、整理、复制、清空操作和解析结果摘要。

**结构**
- 标题按 scope 变化：“Workshop 点位代码”“全路线共享点位代码”“阶段专属点位代码”
- 状态徽标：“点位已解析”（success）、“缺少或异常”（error）、“待输入”
- 右侧操作：“整理”“复制”“清空”；11 行等宽文本框，占位示例 `全局.bastionPosition = 数组(矢量(…))`
- 成功时下方显示 AdminSpatialCoordinatesSummary，失败时显示 error 提示条

**状态**
- 空输入清空配置且视为有效；以 `{` 开头报“此处只接受当前路线或阶段的点位代码（Raw Workshop 或 .opy 赋值）。”
- toast：“已按标准格式整理点位代码”“点位代码已复制到剪贴板”“无法访问剪贴板，请手动复制”
- `disabled` 时输入禁用并隐藏“清空”

**Token**：`line`、`surface`、`text`、`radius-control`；等宽字体 `ui-monospace, SFMono-Regular, Menlo`；按钮 `.pressable`。

**无障碍**
- 错误提示条 `role="alert"`
- 按钮均有文字标签
