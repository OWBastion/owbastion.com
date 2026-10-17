玩家个人页的焦点卡：头像、名称、佩戴称号和概览行。

**使用**：传入 `playerName`、`playerId`、`equippedTitles`、`stats`。没有佩戴称号时显示“还没有佩戴称号。去佩戴”。

**规则**
- 这是页面唯一的焦点卡：`surface-card elevation-2`，一个 `accent` 径向渐变，`accent` 描边头像。
- 头像 5rem（窄屏 3.5rem），名称用 `type-title`。
- 窄屏时称号换到名称下方，概览行改两列。
