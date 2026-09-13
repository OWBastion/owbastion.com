# 管理侧移动端编辑 / 新增 / 审核审计 · 2026-09-13

本次只读 `apps/portal` 管理侧实现，对照：

- 设计支柱：[`DESIGN.md`](DESIGN.md)、[`layout-and-spacing.md`](layout-and-spacing.md)、[`interaction-accessibility.md`](interaction-accessibility.md)、[`page-archetypes.md`](page-archetypes.md)、[`portal-ui-guidelines.md`](portal-ui-guidelines.md)
- Apple Design：Agency、Flexibility、Wayfinding、Simplicity、材料层级、直接操纵、空间一致性（WWDC *Designing Fluid Interfaces* / *Principles of Great Design*）

**范围：** `/admin` 的编辑、新增、审核交互。重点是 `AdminResponsiveDialog`、抽屉内选择器、审核详情 sticky 决策面。不含 Studio 第三方编辑器内部。

**方法：** 源码与 Nuxt UI 4.10 Drawer / Modal 主题对照。未登录管理后台做真机点击；未测 iOS 键盘顶起后的 `dvh`。

严重度沿用 2026-08-17 档：

| 级 | 含义 |
| --- | --- |
| P0 | 决策面不可用，或关键操作被组件契约吞掉 |
| P1 | 找路失败、控件不可点、布局导致误触 |
| P2 | 层级 / 密度降低扫描效率 |
| P3 | 单位、断点、密度债务；不挡功能 |

---

## 1. 总体判断

桌面居中 `UModal`、窄屏底部 `UDrawer` 的分流是对的，和页面范式、Portal UI 细则一致。不可用的原因不在视觉皮肤，而在共享弹层的高度 / 滚动契约，以及审核页 sticky 没有让开顶栏。

用户报告的两类症状都能从实现推出来：

1. 弹出层看不到保存 / 提交。
2. 组件叠在一起，点不到。

Apple 原则上被打穿的是 Agency（完不成主操作）、Flexibility（窄屏仍按桌面两列和浮动 Popover 塞进 Sheet）、Wayfinding（任务面没有稳定的完成落点）。材料上顶栏玻璃、审核操作玻璃、Vaul 缩放背景叠在同一条带上。

不作为本轮问题：

- `AdminResponsiveDialog` 的 `#body` / `#footer` 具名槽（2026-08-17 的空对话框问题，当前调用方已走具名槽）
- Header / Footer 用 `.glass-segment` 避免毛玻璃叠毛玻璃
- 管理列表默认文档流滚动
- 审核详情窄屏「认领 → 决定 → 证据」的阅读顺序

---

## 2. 发现

### P0-01 Drawer 裁切 footer，保存按钮出视口

`AdminResponsiveDialog` 在 `<768px` 渲染 `UDrawer`。Nuxt UI Drawer 主题（`apps/portal/.nuxt/ui/drawer.ts`）：

- `content`：`flex` + `h-auto` + `max-h-[96%]`
- `container`：`overflow-y-auto`，没有 `flex-1` / `min-h-0`
- `footer` 和 header、body 一起排在 container 里，不是钉在底部

组件又给 content 加了 `max-h-[calc(100dvh-1rem)]` 和 `overflow: hidden`。内容一高，父级把 container 裁掉；container 自己没有限高，内部滚不动。Footer 落在裁切线下面。

窄屏 footer 还改成纵向全宽 44px 按钮。两个操作加 `safe-area` 大约 140–180px。长表单几乎必然把「保存 / 创建」顶出视口。

桌面 `scrollable` Modal 有同类冲突：Nuxt UI 期望 overlay 滚整张卡；这里给 content 加了 `max-h` + `overflow: hidden`。矮窗口上的长表单同样会裁 footer。

规范：[`layout-and-spacing.md`](layout-and-spacing.md) 决策面须在文档流或 sticky，高度不能在没人注意时超过视口。Apple Sheet 是 header + 可滚 body + 钉死的 action bar。

高发调用：

- `AdminAchievementCreateDialog` / `AdminAchievementEditorDialog`
- `pages/admin/events.vue` 新建 / 编辑事件
- `AdminMapAchievementWorkspace` 规则 / 例外
- `pages/admin/maps/[mapId].vue` 新建修订
- `AdminAnnotationDirectDialog`
- `pages/admin/player-reviews/index.vue`（确认块还塞进 footer，含 textarea）

### P0-02 `should-scale-background` 让下拉 / 日历错位叠层

`AdminResponsiveDialog` 在允许动效时打开 Vaul 的 `should-scale-background` 和 `set-background-color-on-scale`。Vaul 给页面根节点加 `transform`，`position: fixed` 的包含块变成缩放后的根。Drawer 里的 `USelect`、`USelectMenu`、`UPopover`+`UCalendar` 传送后坐标相对该根，而不是视口：菜单叠在输入上、偏到 Sheet 外，点中的是下面一层。

`AdminDateTimePicker` 整棵日历都在 Popover 里。地图例外开放窗口、成就排期必走这条路径。

Apple：直接操纵要求触点和内容 1:1。根节点 `transform` 破坏浮动层定位。管理表单也不需要 iOS 卡片缩放；dim scrim 就够。

### P0-03 审核决定条 sticky 钻进顶栏

`AdminSubmissionReviewDetail`：

- `--review-sticky-top: max(0.75rem, env(safe-area-inset-top))`
- `.flow-actions { position: sticky; top: var(--review-sticky-top); z-index: 5; }`

系统已有 `--sticky-chrome-top`（窄屏 ≈ safe-area + 52px 顶栏 + 4px）。决定条只用约 12px，`z-index: 5`，顶栏是 `10`。一滚，「通过 / 要求重新提交 / 驳回」进到玻璃顶栏下面，点到的是菜单或主题按钮。

`max-width: 51.25rem` 只取消了证据列 sticky，没有取消操作条 sticky。

---

### P1-01 表单两列断点（560px）晚于 Drawer 断点（768px）

成就创建 / 编辑、地图称号规则编辑要到 560px 才收成一列。事件编辑用 `sm:grid-cols-2`（640px）。375–767 的 Sheet 里仍是两列 `USelect`，标签和控件抢行。标注 OCR 预览同样两列到 560px。

### P1-02 Drawer 内用桌面 Popover 做日期

[`portal-ui-guidelines.md`](portal-ui-guidelines.md)：`UPopover` 只给贴着触发器的单字段动作。排期和地图例外却把整月日历塞进可拖 Sheet。Vaul 手势下，拖日历容易被当成关抽屉。

### P1-03 评价审核把确认面放进 footer

`pages/admin/player-reviews/index.vue` 的 `#footer` 含说明、后果、textarea、按钮。Footer 本应是短操作条；确认块抬高 footer 后更容易被 P0-01 裁掉。

### P1-04 Sheet 里再塞 `AdminDataTable`

`AdminMapAchievementWorkspace` 的「开放地图」管理器在 Dialog 里用 `AdminDataTable`（`table-min-width: 620px`），还可再开筛选 Drawer。Sheet 套表格再套 Sheet。

---

### P2-01 玩家详情 tab 同样没让 `--sticky-chrome-top`

`AdminPlayerDetail` 的 `.detail-tabs` 是 `top: 12px; z-index: 3`。滚动后会顶进 AppHeader。活动卡 `.detail-card--activity` 的 `top: 72px` 是手写偏移，和 token 不同步。

### P2-02 地图修订保存条 sticky bottom

`AdminMapRevisionEditor` / 地图属性工具条：`position: sticky; bottom: …; z-index: 1`。空间配置 textarea 一高会盖住字段。底栏至少还看得见保存，比弹层裁 footer 轻。规范允许 sticky，但高度增长时仍会挡内容。

### P2-03 窄屏 footer 无故改成纵向全宽

两个主操作（取消 + 保存）叠成两行 44px 按钮，进一步抬高被裁切的 footer。横排即可。

---

## 3. 按表面对照

| 表面 | 症状 | 条目 |
| --- | --- | --- |
| 新增 / 编辑成就、事件、地图规则 | 看不到保存 / 创建 | P0-01、P1-01 |
| 地图例外 / 成就排期 | 日历、下拉叠在表单上点不到 | P0-02、P1-02 |
| 提交审核详情 | 滚一下决定按钮失灵 | P0-03 |
| 评价审核弹层 | 确认按钮被挤出 | P0-01、P1-03 |
| 地图修订（页内，非 Modal） | 保存条盖住空间配置 | P2-02 |
| 列表行「更多操作」菜单 | 相对可用 | 非本轮主因 |

---

## 4. 建议改法

一次共享层修复能覆盖绝大多数编辑 / 新增弹层。不要在每个页面各写一套 footer。

1. **`AdminResponsiveDialog` Drawer**
   - 关掉 `should-scale-background` / `set-background-color-on-scale`
   - content：`flex flex-col; max-h: calc(100dvh - 1rem); min-h: 0`
   - container：`flex-1 min-h-0 overflow-hidden flex flex-col`
   - body：唯一纵向滚动（`flex-1 min-h-0 overflow-y-auto`）
   - footer：`flex-none`，钉在 Sheet 底，吃 `safe-area-inset-bottom`
   - 两个主操作保持横排

2. **审核详情**
   - 窄屏取消 sticky top，决定条留在证据附近的文档流；或 `top: var(--sticky-chrome-top)`
   - 若要始终可见：窄屏用高度固定的 sticky bottom（规范允许 sticky，禁止长高的 `fixed`）

3. **Drawer 内选择器**
   - 日期改为行内时间控件或嵌套 Drawer，去掉 `UPopover`+`UCalendar`
   - 根节点不再 `transform` 之后，现有 `USelect` portal 才可靠

4. **表单栅格** 在 `<768px` 一律单列，不要用 560px。

5. **不要把 `AdminDataTable` 放进 Sheet**；规则「开放地图」改成记录列表。

6. **评价审核** 把确认文案和理由留在 `#body`，footer 只放取消 / 确认。

---

## 5. 未验证

- 未用 Brave 登录 `/admin` 做真机点按
- 未测软件键盘顶起后 footer 是否仍在可视区内
- Studio 内部布局不在范围

本地实现、集成证据、部署、生产核对应分开记。本档只记录源码审计。
