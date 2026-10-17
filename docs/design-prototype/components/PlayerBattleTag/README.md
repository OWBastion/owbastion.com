显示玩家战网名与 #ID，有行内与「身份」大号两种形态。

**使用**：传入 `playerName`、`playerId` 与可选 `mode`（`"inline"` 默认，或 `"identity"`）。

**结构**
- inline：名字后接 `#{playerId}`，ID 用 `quiet` 色。
- identity：48px 圆形首字标记（边框为 `accent` 与 `line` 混合，字 `accent`，底 `accent-surface`）＋「战网 ID」小标签（`quiet`）＋ 名字与 #ID 大字（clamp(1.25rem, 2.6vw, 1.75rem)，600）。

**状态**
- 无加载、空、错误态；长名通过 `overflow-wrap:anywhere` 换行，数字使用 `tabular-nums`。

**令牌**
- `quiet`、`accent`、`accent-surface`、`line`、`space-2`、`space-4`。

**无障碍**
- 首字标记 aria-hidden；无其他 aria。

**合并建议稿（2026-10）**：原 `PlayerIdentityCard` 只是给 `identity` 模式套一层 `UCard variant="subtle"`，以后在调用处直接写 `UCard` 加 `PlayerBattleTag mode="identity"`，删除该组件。
