目录页里可叠加筛选的唯一开关，玩家端和管理端一致。

**使用**：传入 `label`、可选 `count`、`pressed`。按下时是 `primary soft`，未按下是 `neutral outline`，尺寸 `md`。计数用 `type-caption` 和 `quiet` 色，数字用 `tabular-nums`。

**规则**
- 筛选芯片必须可见、可清除，并带计数。
- 按下状态用 `aria-pressed` 表达，不能只靠颜色。
