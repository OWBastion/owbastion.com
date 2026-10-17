# AdminSpatialCoordinatesSummary

点位代码解析结果的摘要卡：总点位数、分类计数标签、可展开的坐标明细，点击坐标可复制。

**结构**
- 头部：32px 圆形成功色图标、“已识别 N 个点位”、展开按钮（无副标题）
- 分类胶囊：每个字段“名称 数量”
- 展开后分三组：核心点位、传送与跳板、占领机制（右侧显示“重生轴：Y 轴 · 阈值：2.5”）
- 点位卡：名称、序号 `#i`、坐标按钮 `X | Y | Z`

**状态**
- 默认收起，按钮文案“展开”/“收起”
- 坐标整数原样，否则最多 3 位小数并去尾零
- 复制成功 toast“已复制 Vector(x, y, z)”，失败静默；窄容器单列

**Token**：`success`、`success-surface`、`line`、`surface-raised`、`quiet`、`radius-control`、`radius-pill`、`elevation-1`。

**无障碍**
- `role="status"`，`aria-label="点位识别结果"`
- 坐标按钮 `aria-label` 为“复制 {名称} 坐标”，装饰图标 `aria-hidden`
