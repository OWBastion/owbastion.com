单行文本输入，配合 `UFormField` 使用。

**状态**：默认、聚焦（`accent` 描边）、错误（`danger` 描边加行内说明）、禁用（`disabled-surface` 和 `disabled-text`）。

**规则**
- 高度 `control-md`，圆角 `radius-control`，描边 `line-strong`。
- 只给必填字段加标记；标签和占位符里不写“（可选）”。可选控件不得阻止提交。
- 校验写在行内，说明具体、可执行。
