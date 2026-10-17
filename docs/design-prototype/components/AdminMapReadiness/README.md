# AdminMapReadiness

状态条，显示某地图修订是否具备设为正式版的条件（点位完整、已关联成就或称号），并提供“设为正式版”入口。

**结构**
- 两个检查项：点位（有问题时显示第一条，多于一条追加“ 等 N 项”）和成就/称号关联数
- `isDefault` 时整条换成功色调，显示“这是正式版：玩家的挑战、称号和精通进度都记在这里。”并隐藏按钮
- `canPromote` 且非正式版时显示“设为正式版”主按钮

**状态**
- 待办项用 `warning`，完成项用 `success`，图标和文字同时表达
- “设为正式版”在 `disabled`、有点位问题或没有关联时禁用
- 文案：“点位完整”“已关联 N 项成就与称号”“尚未关联成就或称号”

**Token**：`line`、`surface`、`success`、`success-surface`、`warning`、`radius-card`；边框按 30% 混入 `line`。

**无障碍**
- 容器 `role="status"`
- 图标 `aria-hidden="true"`
