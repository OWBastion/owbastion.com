# AdminCompositeSpatialConfigInput

复合（多阶段）空间配置编辑器的顶层：管理全路线共享点位与重生轴，嵌入阶段编辑，并统一校验和错误文案。

**结构**
- 仅 current 模式显示“全路线共享点位”区：说明“终点、重置点、英雄环和结算点作为整条组合路线的默认值；阶段可在下方覆盖。”
- 内含坐标输入（scope 为 composite-route）、“占领重生轴”（不设置 / X 轴 / Y 轴 / Z 轴）和“占领重生轴阈值”
- 下方嵌入 AdminCompositeStagesInput，透传模式与错误文案

**状态**
- 未选重生轴时阈值输入禁用
- 共享点位错误“请检查全路线共享点位。”；复合路线错误“复合路线必须设置一个重生轴及非负阈值。”
- legacy 阶段错误“请粘贴此阶段完整的点位代码（Raw Workshop 或 .opy 赋值）。”；current 阶段错误“请为此阶段提供 Bastion 出生点并检查阶段专属点位与路线锚点。”

**Token**：`line`、`radius-control`、`muted`；区块内边距 1rem。

**无障碍**
- section 以 `shared-route-heading` 作 `aria-labelledby`
- 重生轴选择和阈值有 aria-label，错误 `role="alert"`
