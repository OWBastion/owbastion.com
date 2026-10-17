# AdminDateTimePicker

把毫秒时间戳拆成日期输入和时间输入的组合选择器，可清除。

**使用**：`v-model` 是毫秒时间戳或 `null`；可选 `disabled`、`placeholder`（默认“选择日期”）。选日期后按本地时区和时间合成时间戳，秒和毫秒为 0。

**结构**：`UInput type="date"`（占满剩余宽度）、`UInput type="time"`（宽 `w-32`，`aria-label` “具体时间”）、清除按钮（`i-lucide-x`，ghost，仅有值时出现）。

**状态**
- 无值：日期为空，时间显示 “00:00”；清除或清空日期都会发出 `null`。
- `disabled`：日期框和清除按钮禁用；时间框在 `disabled` 或日期为空时禁用。

**无障碍**：日期框 `aria-label` 取 `placeholder`，缺省为“日期”；清除按钮 `aria-label` “清除时间”，点击区域用 `hit-target-lg`。没有自有 CSS，只用工具类。
