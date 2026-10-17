把事件效果术语显示为徽标，悬停或点击弹出术语说明气泡。

**使用**：传入 `annotation: EffectAnnotation`，用到术语的名称、摘要、定义与规则列表。

**结构**
- 触发器：中性浅色徽标（术语中文名），按钮外扩至 2.75rem 触控高度，光标为帮助样式。
- 气泡：宽 min(20rem, 100vw - 2.5rem)，`role="tooltip"`，从上到下为术语名、摘要（`quiet`）、定义、规则列表（上方 1px `line` 分隔，每条以「• 」开头，`quiet`）。
- 点击与按下不向上冒泡，避免触发所在卡片。

**状态**
- 精细指针设备（hover: hover 且 pointer: fine）：鼠标进入与离开自动开合。
- 触屏：点击开合；开启时 `aria-expanded` 为 true。

**令牌**
- `pressable-soft`、`text`、`quiet`、`line`。

**无障碍**
- 触发按钮 `aria-label="{nameZh}，效果说明"`，带 `aria-expanded`，打开时带 `aria-controls`；气泡 `role="tooltip"`。
