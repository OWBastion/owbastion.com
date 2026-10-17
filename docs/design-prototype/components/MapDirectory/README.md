地图卡片网格。选中一张地图时打开详情弹层，并把 `mapId` 同步到 URL query。

**使用**：传入 `maps`、`challenges`、`authenticated` 与可选 `selectedMapId`。内部为每张地图渲染 `MapCard`，末尾挂载 `MapDetailModal`。

**结构**
- `section`，`aria-label="地图列表"`，间距 `space-6`。
- 网格最多三列（每列至少 17rem），间距 `space-4`。
- 评价汇总的加载、错误状态透传给 `MapCard`。

**URL 同步**
- 打开地图写入 `?mapId=`；关闭则清除。
- `selectedMapId` 不在地图列表中时清除 query。

**状态**
- 空态：「暂无地图」。

**令牌**
- 仅使用布局间距 `space-4`、`space-6`；卡片与弹层的样式见 `MapCard` 与 `MapDetailModal`。

**无障碍**
- `aria-label="地图列表"`；其余由 `MapCard` 与弹层负责。
