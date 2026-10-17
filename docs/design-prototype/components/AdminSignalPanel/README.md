# AdminSignalPanel

带小标题的信息面板容器，用于后台“信号”类摘要区块，例如待办、识别核对、Challenge 判定。

**使用**：`title` 和 `titleId` 必填，`kicker` 可选；`aside` 插槽放标题右侧内容（计数、状态徽章），默认插槽放正文。

**结构**：`section` 用 `aria-labelledby` 指向 `h3#titleId`；页眉两端对齐。面板 `line` 边框、`radius-card`、`elevation-1`。

**插槽内约定类**
- `.signal-empty`：`muted`、`type-label-sm`。
- `.signal-note`：`type-caption`、上边距 `space-3`。
- `.signal-error`：同上，`danger` 色。

**状态**：`kicker` 缺省则不渲染；空、说明、错误都靠调用方在插槽里套对应类。

**无障碍**：`aria-labelledby` 关联标题；错误必须带文字。
