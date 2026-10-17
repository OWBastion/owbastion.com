# AdminMapRevisionStrip

横向滚动的地图修订选择条（tablist），用来选择当前编辑的修订或新建修订。

**结构**
- 每个修订一张卡：名称（`mode`，否则经典版或标准版）、生命周期徽章、有未保存修改时的圆点
- 次行显示“游戏版本 · N 项分配”，N 为启用的挑战分配数
- 末尾虚线边框“＋ 新建修订”

**状态**
- 生命周期：准备中（warning）、正式（success）、可选（info）、历史（默认）
- 选中：accent 边框、`surface-raised` 底、3px `accent-surface` 外环
- 有未保存修改的修订显示 8px accent 圆点；`disabled` 时全部按钮禁用

**Token**：`line`、`line-strong`、`accent`、`accent-surface`、`surface-raised`、`quiet`、`radius-card`；边框 1.5px。

**无障碍**
- `role="tablist"`，`aria-label="版本修订"`；卡片 `role="tab"` 加 `aria-selected`
- 圆点 `role="img"`，`aria-label="有未保存的修改"`
- 源码未见方向键处理
