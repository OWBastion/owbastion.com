# Portal Apple Design 审计修复清单

> 审计对象：`apps/portal`  
> 审计依据：Apple Design（WWDC *Designing Fluid Interfaces* 等）+ 现有 [`portal-ui-guidelines.md`](./portal-ui-guidelines.md)  
> 审计日期：2026-07-30（复核：2026-07-31）  
> 范围：玩家端与管理端前端交互、动效、材质、排版、可达性与空间一致性（不含业务规则与后端契约）

本清单按 **优先级** 与 **Apple Design 原则** 组织。每一项给出：问题现象、原则对照、涉及文件、建议修复与验收标准。

**图例**

| 标记 | 含义 |
| --- | --- |
| P0 | 体验断层或可达性缺口，建议优先修 |
| P1 | 明显可感知的流体感 / 材质 / 一致性问题 |
| P2 | 打磨项：弹簧、动量、愉悦感 |
| ✅ | 已有较好实践，保留并作为基准 |
| ⚠️ | 部分到位，需补齐 |
| ☐ | 待办（尚未落地） |
| ❌ | 缺失或与原则冲突 |

---

## 当前待办（截至 2026-07-31 复核）

Milestone A / B 全部落地，Milestone C 的轻量项（G-07 页面交叉淡入、全站 Drawer/modal 的 reduce-motion 旗标）已完成。逐项对照代码复核后，仍开放的 backlog 如下；按优先级推进，完成后勾选第 8 节对应 ID 并在 PR 描述引用。

| ID | 优先级 | 项 | 现状 |
| --- | --- | --- | --- |
| N-03 | P0 | 移动菜单焦点陷阱 + 完整键盘操作（Arrow/Home/End/焦点不泄漏） | ☐ |
| A-04 | P1 | 危险操作后列表就地更新反馈，避免整页 `await load()` 闪烁 | ☐ |
| M-04 | P1 | 账户/主题菜单阴影与材质接入 elevation token（现为 Nuxt UI 默认 shadow） | ⚠️ 部分 |
| ME-02 | P1 | 区块间距/卡片高度在大字号下弹性（`upcoming-card` 仍为固定 min-height） | ⚠️ 部分 |
| A-05 | P2 | Drawer 拖拽速度交接与 rubber-band 实测调参 | ☐ |
| H-03 | P2 | 首页区块节制入场动画（默认不做，可选） | ☐ |
| §7.2 | P2 | 弹簧库仅限手势表面（可选依赖，评估包体积与 SSR） | ☐ |
| §7.5 | P2 | Haptics（可选，产品需要时再加） | ☐ |

其余条目（G-01~G-07、N-01/02/04/05/06、M-01/02/03、H-01/02、E-01/02/04、MAP-01/02/03、S-01/02/04、ME-01、A-01/02/03/06、L-01/02、E-03）均已在代码中核验为落地，见第 8 节状态列。

---

## 0. 总体评估

### 0.1 已做对的部分（保留为系统基准）

| 领域 | 现状 | 关键位置 |
| --- | --- | --- |
| ✅ 系统字体与光学字号 | `-apple-system` / SF 栈 + `font-optical-sizing: auto` | `assets/css/main.css` |
| ✅ 标题负 tracking | 大标题 `letter-spacing: -.045em ~ -.065em`，body 宽松 leading | `page-title`、首页 hero、`AdminWorkspace` |
| ✅ 按下反馈 | 主按钮、地图卡、成就卡等有 `:active { transform: scale(.97~/.985) }` | `main.css`、`MapCard`、`AchievementSubmissionCatalog` 等 |
| ✅ 半透明顶栏 | sticky glass header + blur/saturate | `AppHeader.vue` |
| ✅ 无障碍偏好 | `prefers-reduced-motion` / `transparency` / `contrast` 有全局与局部覆盖 | `main.css`、多组件 |
| ✅ 触控最小高度（部分） | 主按钮 44px、移动导航项 44px | `main.css`、`AppHeader` |
| ✅ 管理端响应式浮层 | ≥768 用 Modal，<768 用 bottom Drawer + scale background | `AdminResponsiveDialog.vue`、`MapDetailModal.vue` |
| ✅ 焦点环 | 全局 `focus-visible` 描边 | `main.css` |
| ✅ 语义 token | page/surface/text/line/accent 统一 | `main.css` |

### 0.2 主要差距（按原则）

> 下表为 2026-07-30 审计时的初始评级。截至 2026-07-31 复核，绝大多数条目已落地，当前逐项状态见第 8 节。

| 原则 | 评级 | 摘要 |
| --- | --- | --- |
| 1. Response（即时反馈） | ⚠️ | 自定义按钮有 press；大量 `UButton`/链接/首页卡片无统一 press；菜单项无 `:active` |
| 2. Direct manipulation | ⚠️ | Drawer 依赖 Vaul/Nuxt UI（较好）；自研菜单无拖动手势、无 1:1 跟踪 |
| 3. Interruptibility | ❌ | 菜单/导航动画多为固定 CSS transition/keyframes，无法中途抓取改向 |
| 4. Springs | ❌ | 无弹簧库；全部 ease/cubic-bezier 定时长动画 |
| 5–6. Velocity / Momentum | ❌ | 无释放速度交接、无投影落点（除底层 Drawer 库可能具备） |
| 7. Spatial consistency | ⚠️ | 菜单 `transform-origin: top right` 较好；事件详情仅 Modal 无移动端对称路径；进出路径未统一 |
| 9. Materials & depth | ⚠️ | Header/Dialog 有玻璃；菜单面板多为不透明 raised；硬 1px 分割线多，缺 scroll-edge 渐隐 |
| 12. Multimodal | ❌ | 无 haptics/音效（可接受为 P2；有意义的完成点可后加） |
| 14. Reduced motion | ⚠️ | 全局将 transition 压到 120ms，非「交叉淡入」语义；部分组件遗漏 reduce 分支 |
| 15. Typography | ✅/⚠️ | 层级清晰；中等标题 tracking 不完全按尺寸阶梯；少数 quiet 文案对比偏弱 |
| 16. Foundations | ⚠️ | 空间与文案克制较好；交互反馈与方式不一致；部分导航与可点击区域偏小 |

---

## 1. P0 — 即时响应与触控可达

### 1.1 统一「按下即反馈」交互 token

| 字段 | 内容 |
| --- | --- |
| **原则** | Response：feedback on pointer-down，约 100ms 内 scale |
| **现象** | `primary-button` / `secondary-button` 有 active scale；`UButton`、首页 `content-card` 链接、多数 nav 链接、表格操作无统一 press；`PlayerRecentSubmissions` 仅 hover 上移 |
| **文件** | `assets/css/main.css`；`pages/index.vue`；`components/player/PlayerRecentSubmissions.vue`；全局 Nuxt UI 按钮覆盖 |
| **修复** | 1. 在 `main.css` 定义共享交互 class，例如 `.pressable`：`transition: transform 100ms ease-out` + `:active { transform: scale(0.97) }`，`prefers-reduced-motion` 下取消 transform。2. 覆盖 Nuxt UI 默认按钮 active（`:deep` 或 `ui` 主题）。3. 可点击卡片/行（首页 content-card、submission-row、event-card 已部分）统一接入。4. **禁止**仅在 hover 做位移反馈而缺少 active。 |
| **验收** | 触摸/鼠标按下 100ms 内可见反馈；松开后回弹；reduce motion 时仅颜色/opacity 变化 |

### 1.2 触控目标与命中余量（Hit padding）

| 字段 | 内容 |
| --- | --- |
| **原则** | Gesture：~10px hysteresis / 最小约 44×44pt |
| **现象** | `ThemeMenu` / `AccountMenu` 触发器 36×36；桌面 `main-nav` 链接 min-height 36；`login-link` 34；`theme-option` 38；管理端 `grants-tab` / 部分 table action 更小 |
| **文件** | `AppHeader.vue`；`ThemeMenu.vue`；`AccountMenu.vue`；`AdminPlayerTitles.vue`；`pages/admin/achievements.vue`（`.table-action`） |
| **修复** | 1. 图标按钮视觉可 36，**命中区**用 padding 或 `::before` 扩到 ≥44×44。2. 桌面导航项 min-height ≥40（理想 44）。3. 表格行内操作至少 36 高 + 足够 padding，移动端改为完整按钮行。 |
| **验收** | iOS 辅助功能审计或手工：密集操作区误触率可接受；所有主路径控件 ≥44 逻辑像素（桌面可 40） |

### 1.3 菜单：按下高亮与取消手势

| 字段 | 内容 |
| --- | --- |
| **原则** | Tap：highlight on down；拖离可取消 |
| **现象** | `AccountMenu` / `ThemeMenu` 菜单项仅有 hover/focus-visible 背景，无 `:active`；`v-show` 打开后点击项立即关闭，无中间态 |
| **文件** | `AccountMenu.vue`；`ThemeMenu.vue` |
| **修复** | 菜单项增加 `:active` 背景加深；可选：pointerdown 高亮、pointerup 在目标内才 commit（标准 menu 行为） |
| **验收** | 按住菜单项时可见按压态；拖出后松开不触发动作（若实现 commit-on-up） |

### 1.4 首页与目录卡片可点击性反馈

| 字段 | 内容 |
| --- | --- |
| **原则** | Response + Familiarity |
| **现象** | `pages/index.vue` 中成就卡为 `NuxtLink.content-card`，无 hover/active 样式；事件/天梯/版本部分为静态 `article`，与可点击卡视觉同级，映射弱 |
| **文件** | `pages/index.vue` |
| **修复** | 可导航卡：hover 边框/阴影 + active scale；不可点卡保持静态且**不**使用与链接相同的强调 hover。明确「未开放」与可进页面的差异（已有 copy 边界，需视觉映射）。 |
| **验收** | 用户不依赖 hover 光标也能区分可点/不可点 |

---

## 2. P0 — 减少动画与可达性补齐

### 2.1 修正全局 `prefers-reduced-motion` 策略

| 字段 | 内容 |
| --- | --- |
| **原则** | Reduced motion：用短 opacity cross-fade，**不是**把所有 transition 压成 120ms 仍带 transform |
| **现象** | `main.css`：`transition-duration: 120ms !important` + 取消 `:active` transform；但未强制 `transform: none` 于 enter/leave；组件级 reduce 质量不一 |
| **文件** | `assets/css/main.css`；`AppHeader.vue`（mobile-nav transition）；`AccountMenu` / `ThemeMenu`（仅 `animation: none`）；`BindingInviteBatchPanel.vue` |
| **修复** | 1. reduce 下默认：`transition-property: opacity, color, background-color, border-color`；`transform: none !important`。2. 菜单/抽屉进入改为 150–200ms opacity。3. 组件级 reduce 与全局一致，避免双重规则冲突。 |
| **验收** | 系统「减少动态效果」开启时：无位移动画、无 scale 进场、无视差感；状态变化仍有轻微 opacity/颜色反馈 |

### 2.2 主题切换勿突变亮度

| 字段 | 内容 |
| --- | --- |
| **原则** | Reduced motion / Craft：dark↔light 缓变 |
| **现象** | `ThemeMenu` 切换 preference 无页面级过渡；`color-scheme` 与 CSS 变量瞬间切换 |
| **文件** | `ThemeMenu.vue`；`app.vue`；`main.css` |
| **修复** | 在 `html`/`body` 上对 `background-color`、`color` 使用短时 `transition`（~200ms ease）；reduce 时禁用。注意：勿对所有属性 transition 导致布局卡顿。 |
| **验收** | 切换浅/深色时背景与主表面有短淡变，无闪白/闪黑 |

### 2.3 半透明菜单面板的 reduce-transparency

| 字段 | 内容 |
| --- | --- |
| **原则** | prefers-reduced-transparency：提高不透明度、去掉 blur |
| **现象** | Header / mobile-nav / Admin dialog 有处理；`AccountMenu` / `ThemeMenu` 面板用 solid `surface-raised`（可接受）；若未来改为 glass 需同步 reduce。`coming-soon-label` 有 blur 但 me 页未见 reduce 覆盖 |
| **文件** | `pages/me.vue`（`.coming-soon-label`）；`BindingInviteBatchPanel.vue`（已有） |
| **修复** | 所有 `backdrop-filter` 使用点统一在 `main.css` 用属性选择器或共享 class `.glass` + reduce 规则，避免遗漏 |
| **验收** | 开启「降低透明度」后无 blur 残留、文字对比足够 |

### 2.4 键盘与焦点：自定义菜单不完整

| 字段 | 内容 |
| --- | --- |
| **原则** | Agency + Familiarity（平台菜单行为） |
| **现象** | `AccountMenu` / `ThemeMenu`：Escape 关闭、打开后 focus 首项；**无** Arrow 上下、Home/End、typeahead、焦点陷阱；Tab 可离开菜单到页面其余部分 |
| **文件** | `AccountMenu.vue`；`ThemeMenu.vue`；`AppHeader.vue`（mobile-nav 类似） |
| **修复** | 优先改用 Nuxt UI `UDropdownMenu` / `UPopover`（焦点与键盘已处理）；或补齐 roving tabindex + Arrow 键。移动导航打开时考虑焦点陷阱与 inert 背景。 |
| **验收** | 键盘可完整操作菜单；焦点不泄漏；关闭后焦点回触发器（已有 returnFocus） |

---

## 3. P1 — 材质、深度与滚动边缘

### 3.1 滚动边缘效果替代硬分割线（Sticky chrome）

| 字段 | 内容 |
| --- | --- |
| **原则** | Materials：scroll edge effect，非 1px 硬边 |
| **现象** | Sticky header 为独立 floating pill（设计合理），内容滚过时与 header 关系靠 `scroll-padding-top`；Admin `detail-tabs` sticky 有 glass 但底边仍是 solid border；表格/section 大量 `border-bottom: 1px solid var(--line)` |
| **文件** | `AppHeader.vue`；`AdminPlayerDetail.vue`；`AdminDataTable.vue`；各类 section heading |
| **修复** | Sticky 栏在内容**重叠**时用底部 soft gradient mask 或极轻 shadow，重叠消失时减弱；列表分隔可保留细线，但 sticky 与滚动内容交界优先 mask。 |
| **验收** | 内容从 sticky 栏下滚过时边缘柔和，不出现「切断」感 |

### 3.2 菜单与浮层材质层级

| 字段 | 内容 |
| --- | --- |
| **原则** | 材料重量编码层级；大表面更厚 blur + 更深阴影；避免 light glass 叠 light glass |
| **现象** | Header：`blur(20px)` + 半透明；Mobile nav：`blur(22px)`；Admin dialog：`blur(22px)` + header/footer 再一层 blur（叠 glass）。Account/Theme 菜单：不透明 raised + 浅阴影 |
| **文件** | `AdminResponsiveDialog.vue`；`AppHeader.vue`；菜单组件 |
| **修复** | 1. Dialog：content 一层 glass 即可，header/footer 用略高不透明度**无**二次 blur，或 solid 分段。2. 菜单可轻微 glass + 比 header **更重**阴影（浮在 header 上）。3. 禁止两层 light translucent 叠放导致字糊。 |
| **验收** | 深色/浅色下浮层文字清晰；叠层不出现发灰/发糊 |

### 3.3 振动/Vibrancy 文本

| 字段 | 内容 |
| --- | --- |
| **原则** | 半透明表面上文案用更高对比、略重字重，而非 flat muted gray |
| **现象** | Header nav 用 `var(--muted)` 在 glass 上；quiet 标签在 accent-surface / glass 上对比可能不足 |
| **文件** | `AppHeader.vue`；`AdminResponsiveDialog`；badge/kicker 用法 |
| **修复** | Glass 上的主交互文案使用 `var(--text)` 或专用 `--text-on-glass`；muted 仅用于非关键元数据 |
| **验收** | WCAG 对比在 glass 背景抽样通过（含滚动内容透出时的最差情况） |

### 3.4 Materialize 进入，而非纯 fade

| 字段 | 内容 |
| --- | --- |
| **原则** | Materialize：blur + scale 同步进入 |
| **现象** | Account/Theme 菜单：`opacity + translateY + scale(.98)` 150ms ease-out（接近）；mobile-nav 类似；**未**动画 blur；Admin modal 依赖 Nuxt UI 默认 transition |
| **文件** | `AccountMenu.vue`；`ThemeMenu.vue`；`AppHeader.vue`；`AdminResponsiveDialog.vue` |
| **修复** | 短时 scale 0.98→1 + opacity 保留；可选 `backdrop-filter` 从 0 到目标（注意性能）；reduce 时仅 opacity |
| **验收** | 浮层像「材料落位」而非平面闪现 |

### 3.5 阴影 token 语义化

| 字段 | 内容 |
| --- | --- |
| **原则** | Craft：可辩护的 elevation 阶梯 |
| **现象** | 阴影多为一次性 `box-shadow: 0 12px 34px -30px` 等，跨组件不一致 |
| **文件** | `main.css`；各 `surface-card` 与组件 |
| **修复** | 定义 `--elevation-1/2/3`（或 soft/mid/high），卡片/菜单/模态各用一档；暗色用更深 ambient |
| **验收** | 同级组件阴影视觉一致；模态高于菜单高于卡片 |

---

## 4. P1 — 空间一致性与浮层路径

### 4.1 事件详情：移动端应对称为 Drawer

| 字段 | 内容 |
| --- | --- |
| **原则** | Spatial consistency + Flexibility（平台适配） |
| **现象** | 地图详情与 Admin 浮层：桌面 Modal / 移动 Drawer；**事件目录** `EventDirectory` 全程 `UModal`，小屏无 bottom sheet、无 `should-scale-background` |
| **文件** | `components/events/EventDirectory.vue` |
| **修复** | 复用 `MapDetailModal` / `AdminResponsiveDialog` 模式：`useMediaQuery(768)` + Modal/Drawer 分支；内容用 reusable template |
| **验收** | ≤767 从底部进入/退出；≥768 居中；路径进出对称 |

### 4.2 菜单锚定与进出路径镜像

| 字段 | 内容 |
| --- | --- |
| **原则** | Enter/exit same path；`transform-origin` 指向触发源 |
| **现象** | Account/Theme：`transform-origin: top right` ✅；`v-show` 关闭时 **无 leave 动画**（直接消失），违反对称退出 |
| **文件** | `AccountMenu.vue`；`ThemeMenu.vue` |
| **修复** | 使用 `<Transition>` 包裹，enter/leave 镜像 easing（或 inverse cubic-bezier）；关闭时走同一路径 |
| **验收** | 打开与关闭视觉路径可逆；无「闪没」 |

### 4.3 移动导航进出与手势打断

| 字段 | 内容 |
| --- | --- |
| **原则** | Interruptibility；对称路径 |
| **现象** | `AppHeader` mobile-nav 有 enter/leave transition；快速连点菜单按钮时 CSS transition **不可中途改向**，可能抖动 |
| **文件** | `AppHeader.vue` |
| **修复** | P1：确保 leave 可被新 enter 打断（Vue Transition mode 与 `from` 取当前计算样式）。P2：改为 spring/可中断动画。 |
| **验收** | 动画进行中再次点击，无卡死、无跳变 |

### 4.4 页面切换无空间过渡

| 字段 | 内容 |
| --- | --- |
| **原则** | Wayfinding + Spatial consistency（克制） |
| **现象** | `NuxtPage` 无 view transition / layout transition；路由跳变硬切 |
| **文件** | `app.vue`；`layouts/default.vue` |
| **修复** | 可选：View Transitions API 或轻量 opacity 交叉（150–200ms）；**reduce 禁用**；避免大位移页面转场 |
| **验收** | 路由切换不晕眩；reduce 时瞬时或仅 opacity |

---

## 5. P1 — 交互一致性与反馈四类

### 5.1 Hover 上浮 vs Press 缩放 混用

| 字段 | 内容 |
| --- | --- |
| **原则** | Familiarity：相同外观相同行为 |
| **现象** | `event-card`：hover `translateY(-2px)` + active scale；`submission-row`：仅 hover 上移；`map-card`：无 hover 位移、有 active scale |
| **文件** | `EventDirectory.vue`；`PlayerRecentSubmissions.vue`；`MapCard.vue` |
| **修复** | 统一「目录卡片」交互规范：hover = 边框/阴影（可选 1px 上浮）；active = scale 0.985；reduce 取消位移 |
| **验收** | 事件/地图/成就/提交列表卡片行为一致 |

### 5.2 加载、完成、错误反馈

| 字段 | 内容 |
| --- | --- |
| **原则** | Feedback 四类：status / completion / warning / error |
| **现象** | 管理端多用 `UAlert` / AdminWorkspace messages ✅；玩家端 loading 多为「读取中…」静态文案；进度步骤 `SubmissionProgress` 无步骤切换过渡 |
| **文件** | 各 page loading；`SubmissionProgress.vue` |
| **修复** | 1. 骨架屏或确定性 spinner（已有 U 组件则复用）。2. 步骤状态变化时 marker 用 150ms color/background 过渡（非弹跳）。3. 成功提交后短确认，不刷屏。 |
| **验收** | 加载不会被误认为空数据；状态变更可感知且不依赖颜色 alone（已有文案） |

### 5.3 危险操作与撤销感（Agency）

| 字段 | 内容 |
| --- | --- |
| **原则** | Agency：确认仅用于真正不可逆；Admin 决策不得强制填原因（项目规则） |
| **现象** | 业务上已符合「原因可选」；UI 上危险按钮需保持 `color="error"` + loading（指南已有） |
| **文件** | Admin 各页 |
| **修复** | 审计所有撤销/删除/封禁：即时 loading、禁用双击；成功后列表就地更新动画（opacity），避免整页刷新闪烁 |
| **验收** | 危险操作路径清晰；无多余阻塞式「必须填理由」 |

---

## 6. P1 — 排版阶梯与布局弹性

### 6.1 Tracking / Leading 尺寸阶梯表

| 字段 | 内容 |
| --- | --- |
| **原则** | 大字负 tracking，小字近 0 或微正；leading 随尺寸反向 |
| **现象** | Display/hero 优秀；`.eyebrow` / badge 有时 `letter-spacing: .05–.14em` 对全大写合理；中等标题（~1rem）tracking 从 `-.02` 到 `-.05` 不统一；`.group-heading h2` 在 EventDirectory 为 `+.01em` 与全局标题风格冲突 |
| **文件** | `main.css`；`EventDirectory.vue`；各 section header |
| **修复** | 在 `main.css` 定义类型 scale： |
| | `.type-display` / `.type-title` / `.type-headline` / `.type-body` / `.type-caption` 绑定 size + weight + tracking + leading |
| | 替换散落的一次性 letter-spacing |
| **验收** | 同级标题 tracking 一致；中文大标题仍紧凑不挤 |

### 6.2 用户文字缩放（Dynamic Type 友好）

| 字段 | 内容 |
| --- | --- |
| **原则** | 间距用 rem/em，布局随字号增长 |
| **现象** | 大量 `px` 固定 gap/padding/min-height；`clamp` 用于标题较好；`min-width: 320px` 固定 |
| **文件** | 全局 |
| **修复** | 关键垂直节奏改为 rem；避免固定高度裁切多行文案；测试浏览器默认字体 150%–200% |
| **验收** | 放大字体后导航与卡片不严重重叠/溢出 |

### 6.3 筛选栏与窄屏触控

| 字段 | 内容 |
| --- | --- |
| **原则** | Flexibility |
| **现象** | `EventDirectory` filters：桌面 4 列，760 以下 2 列；select 默认高度依赖 Nuxt UI，需确认 ≥44 |
| **文件** | `EventDirectory.vue`；`MapSubmissionCatalog.vue`（native select 42px） |
| **修复** | 表单控件统一 min-height 44（移动）/ 40（桌面）；filter 间距 ≥10px |
| **验收** | 320–430 宽可单手操作筛选 |

---

## 7. P2 — 流体交互（弹簧、动量、抽屉）

> 在 P0/P1 稳定后再做。优先增强**已有手势表面**（bottom drawer），勿为装饰加弹簧。

### 7.1 Bottom sheet 速度交接与 rubber-band

| 字段 | 内容 |
| --- | --- |
| **原则** | Velocity handoff、rubber-banding、interruptibility |
| **现象** | `UDrawer`（Vaul）通常支持拖拽与阻尼；需验证：释放速度是否传入、越界是否 rubber-band、关闭中再拖是否可打断 |
| **文件** | `AdminResponsiveDialog.vue`；`MapDetailModal.vue`；Nuxt UI Drawer 配置 |
| **修复** | 对照 Vaul/Nuxt UI 文档开启/调参；手动测：快甩关闭、慢拖取消、中途反向 |
| **验收** | 拖拽 1:1；松手无「刹停再动画」接缝；越界有阻尼 |

### 7.2 引入可控弹簧（可选依赖）

| 字段 | 内容 |
| --- | --- |
| **原则** | Behavior over animation：damping 1.0 / response 0.3–0.4；动量场景 damping ~0.8 |
| **现象** | 项目无 Motion/spring；全 CSS 定时长 |
| **文件** | 新建 `composables/useSpring` 或轻量 `motion` 依赖（需评估包体积与 Nuxt SSR） |
| **修复** | 仅用于：菜单出现、sheet、可拖卡片。默认 critically damped；**禁止**菜单淡入用 bounce |
| **验收** | 可中途打断；无无故 overshoot |

### 7.3 列表插入/删除动画

| 字段 | 内容 |
| --- | --- |
| **原则** | Continuity |
| **现象** | `BindingInviteBatchPanel` 有 list transition；多数 Admin 表格行增删硬切 |
| **文件** | `BindingInviteBatchPanel.vue`（可作参考）；`AdminDataTable` 周边 |
| **修复** | 行增删：opacity + 高度 collapse（谨慎）或仅 opacity；reduce 关闭 |
| **验收** | 批量生成邀请码等操作连续可跟 |

### 7.4 进度步骤「当前」态微反馈

| 字段 | 内容 |
| --- | --- |
| **原则** | Utility：有意义反馈；勿过度 |
| **现象** | `SubmissionProgress` current marker 静态 accent 填充 |
| **文件** | `SubmissionProgress.vue` |
| **修复** | 可选极轻呼吸 opacity（仅 current，>3s 周期避免 0.2Hz 眩晕带）；**reduce 禁用** |
| **验收** | 不分散注意力；关闭动态后无动画 |

### 7.5 Haptics（可选）

| 字段 | 内容 |
| --- | --- |
| **原则** | Multimodal：因果、同步、有用 |
| **现象** | 无 Vibration API |
| **修复** | 仅在：提交成功、审核通过/驳回确认、sheet snap。与视觉同一帧；提供关闭入口 |
| **验收** | 默认不吵；失败路径可测 |

---

## 8. 按表面的修复清单（执行用）

### 8.1 全局 token 与基础样式

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| G-01 | P0 | 抽取 `.pressable` / 按钮 active 规范 | ✅ |
| G-02 | P0 | 修正 `prefers-reduced-motion`：禁 transform，保留语义 fade | ✅ |
| G-03 | P1 | 抽取 `.glass` + reduce-transparency / contrast | ✅ |
| G-04 | P1 | Elevation 阴影阶梯 token | ✅ |
| G-05 | P1 | Type scale（display/title/body/caption） | ✅ |
| G-06 | P1 | 主题切换背景缓变 | ✅ |
| G-07 | P2 | 可选 View Transitions（opacity only） | ✅ |

**文件：** `apps/portal/assets/css/main.css`，`app.vue`

### 8.2 App 壳与导航

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| N-01 | P0 | 图标按钮命中区 ≥44 | ✅ |
| N-02 | P0 | 桌面 nav / 登录链接触控高度 | ✅ |
| N-03 | P0 | 移动菜单焦点陷阱 + 键盘 | ☐ |
| N-04 | P1 | mobile-nav leave 与 enter 对称、可打断 | ✅ |
| N-05 | P1 | Glass 导航文字对比 | ✅ |
| N-06 | P1 | Sticky 与内容滚动边缘 | ✅ |

**文件：** `AppHeader.vue`，`layouts/default.vue`

### 8.3 账户 / 主题菜单

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| M-01 | P0 | 改用 UDropdownMenu 或补齐 Arrow 键 | ✅ |
| M-02 | P0 | 菜单项 active / press | ✅ |
| M-03 | P1 | 关闭 leave 动画（与 enter 镜像） | ✅ |
| M-04 | P1 | 阴影/材质与 header 层级 | ⚠️ UDropdownMenu 默认 shadow/glass，未接入 `elevation-2` 等 token |

**文件：** `AccountMenu.vue`，`ThemeMenu.vue`

### 8.4 首页

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| H-01 | P0 | 可点击 content-card 的 hover/active | ✅ |
| H-02 | P1 | 可点 vs 静态卡片视觉分化 | ✅ |
| H-03 | P2 | 节制的区块入场（可选，默认不做） | ☐ |

**文件：** `pages/index.vue`

### 8.5 事件目录

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| E-01 | P1 | 详情改为 Modal/Drawer 响应式 | ✅ |
| E-02 | P1 | 卡片交互与地图卡对齐 | ✅ |
| E-03 | P1 | group 标题 tracking 纳入 type scale | ✅ `group-heading h2` 已改用 `--type-caption-size` + `.01em`，与 caption 阶梯一致 |
| E-04 | P0 | 筛选控件触控高度 | ✅ |

**文件：** `components/events/EventDirectory.vue`

### 8.6 地图

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| MAP-01 | P1 | MapDetailModal 材质与 Admin dialog 对齐（glass 可选） | ✅ |
| MAP-02 | P1 | Drawer reduced-motion 配置（对齐 AdminResponsiveDialog 的 transition flag） | ✅ |
| MAP-03 | ✅ | 卡片 active scale + reduce | 保持 |

**文件：** `MapCard.vue`，`MapDetailModal.vue`，`MapDirectory.vue`

### 8.7 成就 / 提交流

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| S-01 | P1 | SubmissionProgress 状态色过渡 | ✅ |
| S-02 | P1 | 提交列表行 press 反馈 | ✅ |
| S-03 | ✅ | 成就选择卡 active | 保持 |
| S-04 | P0 | 上传/提交主按钮 loading + disabled 双保险（对照指南） | ✅ |

**文件：** `SubmissionProgress.vue`，`PlayerRecentSubmissions.vue`，`pages/submissions/*`，catalog 组件

### 8.8 玩家中心

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| ME-01 | P1 | coming-soon glass 的 reduce-transparency | ✅ |
| ME-02 | P1 | 区块间距在大字号下的弹性 | ⚠️ 区块 margin 已用 clamp/rem；`upcoming-card` min-height 仍固定 272/220px，大字号下可能裁切 |

**文件：** `pages/me.vue`，`TitleCollection.vue`，`PlayerIdentityCard.vue`

### 8.9 管理端

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| A-01 | P1 | AdminResponsiveDialog 避免 header/footer 双层 blur | ✅ |
| A-02 | P1 | AdminPlayerDetail sticky tabs 滚动边缘 | ✅ |
| A-03 | P0 | 表格/行内操作触控目标 | ✅ |
| A-04 | P1 | 危险操作后列表局部更新反馈 | ☐ bindings/achievements 仍整页 `await load()`；`channels.vue` 的 `Object.assign` 就地更新可作基准 |
| A-05 | P2 | Drawer 手势与速度交接实测与调参 | ☐ |
| A-06 | ✅ | reducedMotion 关闭 modal transition | 保持 |

**文件：** `AdminResponsiveDialog.vue`，`AdminPlayerDetail.vue`，`AdminDataTable.vue`，各 `pages/admin/*`

### 8.10 登录 / 绑定

| ID | 优先级 | 项 | 状态 |
| --- | --- | --- | --- |
| L-01 | P1 | 挑战码面板与主按钮 press 一致 | ✅ 登录页 `primary-button` / `secondary-button` 已接入统一 press |
| L-02 | P1 | 错误/警告状态不单靠颜色（已有文案则核对） | ✅ `notice warning/error` 均有文案；bind 页用 `UAlert` description |

**文件：** `pages/login/index.vue`，`pages/bind.vue`

---

## 9. 建议实施顺序（里程碑）

### Milestone A — 响应与可达（约 1–2 PR）

1. G-01, G-02, N-01, N-02 — ✅  
2. M-01, M-02, H-01 — ✅  
3. E-04, A-03, S-04 — ✅  
4. 回归：键盘、reduce motion、320px 宽  

**状态：已完成（2026-07-30）**

### Milestone B — 材质与空间（约 1–2 PR）

1. G-03, G-04, G-05, G-06 — ✅  
2. E-01, M-03, N-04, N-05, N-06 — ✅  
3. A-01, MAP-01, ME-01 — ✅；A-02, MAP-02 待做  
4. 统一卡片 hover/active（E-02, S-02, H-02）— ✅  

**Milestone B 状态：已完成**

### Milestone C — 流体增强（可选）

1. A-05 Drawer 实测调参  
2. G-07 页面交叉淡入 — ✅（Nuxt `pageTransition` opacity only）  
3. 7.2 弹簧库仅限手势表面  
4. 7.5 Haptics（若产品需要）  

**轻量 C 项：** G-07、MAP-02 / 全站 Drawer reduce 旗标已完成；弹簧与 haptics 仍为可选。

### Milestone D — 收尾 backlog（截至 2026-07-31）

1. **N-03（P0）** 移动导航焦点陷阱 + 完整键盘操作（Arrow 上下 / Home / End / 焦点不泄漏到背景），参照 Nuxt UI 焦点管理
2. **A-04（P1）** 管理列表危险操作后就地更新：以 `channels.vue` 的 `Object.assign` 就地更新为基准，扩展至 bindings/achievements/maps；行变化用 opacity 过渡，避免整页刷新闪烁
3. **M-04（P1）** 账户/主题菜单 content 接入 `elevation-2` / 材质 token，替换 Nuxt UI 默认 shadow
4. **ME-02（P1）** `upcoming-card` 固定 min-height 改为弹性（`min-height: min()` 或 rem），验证浏览器 150%–200% 字号
5. **A-05（P2）** 真机/浏览器实测 Drawer：快甩关闭、慢拖取消、中途反向、越界阻尼
6. **H-03（P2，可选）** 首页区块入场动画，默认不做；若做需 reduce 禁用
7. **§7.2 / §7.5（P2，可选）** 弹簧库仅限手势表面；Haptics 按产品需要

---

## 10. 验收矩阵（每 PR 自检）

| 检查 | 方法 |
| --- | --- |
| 按下反馈 | 真机触摸 + 鼠标：主按钮、卡片、菜单项 |
| 命中区 | 44px 规则；拇指区常用操作 |
| 对称进出 | 打开/关闭菜单、modal、drawer 各 3 次 |
| 打断 | 动画中连续点击触发器 |
| reduce-motion | 系统开关后无位移/scale 进场 |
| reduce-transparency | 无 blur；对比足够 |
| prefers-contrast | 边框与焦点可见 |
| 键盘 | Tab / Esc / 菜单方向键（修复后） |
| 320 / 768 / 1280 | 布局无横向溢出 |
| 主题 | 浅↔深无刺眼闪烁 |
| 回归测试 | `pnpm --dir apps/portal` 相关 vitest + typecheck（见 testing policy） |

---

## 11. 明确非目标（本审计不强制）

- 不为「更像 iOS」重做整站视觉品牌或改动业务 copy 体系  
- 不在迁移/种子/API 契约层引入动效  
- 不为静态文档页添加视差或循环装饰动画  
- 不强制引入 haptics/音效作为上线门槛  
- 不把 Admin 表格改成无限滚动或手势驱动表（与现有分页/数据表规范冲突）

---

## 12. 与现有指南的关系

| 文档 | 关系 |
| --- | --- |
| [`portal-ui-guidelines.md`](./portal-ui-guidelines.md) | 布局骨架、组件选型、状态机、token 基线；本清单**扩展**其交互与动效层 |
| [`portal-copy-guidelines.md`](./portal-copy-guidelines.md) | 文案语气；Apple「简洁/明确」与之对齐，不重复规定用词 |
| 本文件 | 专项：流体界面、材质、排版光学、手势与 reduce 偏好的修复 backlog |

完成某 ID 后，在上表勾选，并在 PR 描述中引用 ID（如 `Apple Design: E-01`），便于追踪。

---

## 13. 组件对照速查（原则 × 现状）

| 组件/页面 | Response | Materials | Spatial | Reduce | 备注 |
| --- | --- | --- | --- | --- | --- |
| `main.css` | ✅ | ✅ token | — | ✅ | pressable / glass / type / elevation 已落地 |
| `AppHeader` | ✅ | ✅ glass | ✅ 对称 | ✅ | 剩 N-03 移动焦点陷阱 |
| `AccountMenu` / `ThemeMenu` | ✅ UDropdownMenu | ⚠️ 默认 shadow | ✅ | ✅ | 剩 M-04 接入 token |
| `AdminResponsiveDialog` | — | ✅ glass-segment | ✅ M/D | ✅ | 无二次 blur |
| `MapDetailModal` | — | ✅ | ✅ M/D | ✅ | 已对齐 Admin |
| `EventDirectory` | ✅ 卡 press | ⚠️ 部分玻璃 | ✅ M/D | ✅ | 已响应式 |
| `MapCard` | ✅ | ✅ | — | ✅ | 基准 |
| `SubmissionProgress` | — | ✅ | — | ✅ | 状态色 160ms 过渡 |
| `pages/index` | ✅ 链接卡 press | ✅ | — | ✅ | 可点/静态已分化 |
| `pages/me` | — | ✅ glass-chip | — | ✅ | reduce 已覆盖；剩 ME-02 弹性 |

---

*本清单为设计/工程 backlog，不表示所列缺口均为产品缺陷；按 Milestone 渐进落地，并始终服从业务边界与 `portal-ui-guidelines` 的组件复用规则。*
