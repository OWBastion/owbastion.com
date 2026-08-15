# Portal UI/UX 综合审计报告（2026-08-15）

## 1. 审计元信息

| 维度 | 信息 |
| --- | --- |
| **审计日期** | 2026-08-15 |
| **审计范围** | `apps/portal`（全部 255 个源文件，涵盖页面、组件、样式、内容及配置） |
| **对标规范** | 1. 仓库设计系统宪章与权威文档：[`docs/design-rules/DESIGN.md`](DESIGN.md) 及 12 篇主题规范<br>2. **Apple Design**（WWDC 流体交互、响应优先、弹簧物理、材料与深度、动态排版、8 大设计原则、无障碍与系统偏好）<br>3. **Kill-AI-Slop**（35 项 AI 视觉与文案陈词滥调识别与消除分类体系） |
| **审计方法** | ① `kill-ai-slop` 扫描器代码级全量扫描 + 260 处命中逐条人工辨析；② 静态源文件全路由与组件覆盖排查；③ Apple Design WWDC 交互、无障碍与材料深度对标；④ 与历史审计（2026-08-12、2026-08-13 独立审计）对比验证闭环状态。 |
| **文档定位** | 执行级审计报告与治理指引（Reference & Action Plan） |

---

## 2. 执行摘要与系统健康度评分

### 2.1 整体结论

OWBastion Portal 的 UI/UX 实现处于**极高水平的工业级健康状态**。
与市面常见的 AI 模板化项目截然不同，Portal 具备深度防御的设计系统底座：
- **设计地基统一**：`main.css` 集中管理 OKLCH 语义色、动态字阶（Tracking/Leading 负向联动）、层级海拔（Elevation 1-3）、统一按压反馈（`.pressable` / `.pressable-soft`）、材料系统（`.glass` / `.glass-heavy` / `.glass-chip` / `.glass-segment`）。
- **无障碍与偏好策略完备**：全局系统偏好钩子完整响应 `prefers-reduced-motion`（降级为无物理位移的透明度过渡）、`prefers-reduced-transparency`（毛玻璃降级为实体表面）、`prefers-contrast: more`（强化边缘描边与焦点环）。
- **流体交互与微交互规范**：无 `transition-all` 滥用，无悬浮位移（hover lift）抖动，全部主要触控目标达标 $\ge 44\text{px}$，弹窗/抽屉使用响应式分流（Desktop Modal / Mobile Drawer）并内置焦点捕获与还原。

### 2.2 历史缺陷闭环验证（对比 2026-08-12 与 2026-08-13 审计）

前序两轮审计提出的核心阻断与方向性缺陷已全部完成整改：
1. **产品诚实性与虚假导航（F-001）**：公共导航已精简为真实有效的 4 大核心路由（事件、地图、成就、版本更新），移除了未开放的天梯排名与轮换挑战死胡同。
2. **提交中心主次层级（F-003）**：玩家中心（`pages/me.vue`）修正了主操作区，「开发日志」不再与「提交截图」同级竞争。
3. **已发布内容占位符（B-01）**：`content/changelog/26.0801.1.md` 等已发布版本的 `xx/xxx` 占位符已彻底清除。
4. **共享段落标题（R-05）**：已抽取 `PageSectionHeader.vue` 统一标题与副标题层级。
5. **管理台表格架构**：全面落地 `AdminDataTable.vue` 移动端列优先级收拢与定高虚拟化稳定视口。

### 2.3 综合质量评分卡

| 评估支柱 | 得分 | 评级 | 现状特征与主要留存债务 |
| --- | :---: | :---: | --- |
| **1. 视觉底座与 Token 系统** | **96 / 100** | A+ | OKLCH 语义化统一；无随意硬编码色值；Elevation 与毛玻璃分级明确。 |
| **2. Apple Design 交互与物理感** | **94 / 100** | A | Pointer-down 按压反馈全面；对称路由/抽屉过渡；全局无障碍偏好降级完整。 |
| **3. Kill-AI-Slop 纯净度** | **88 / 100** | B+ | 骨架干净，但存在局部容器过度嵌套（3层卡片）、全局 Eyebrow 滥用、少量装饰性描边几何体。 |
| **4. 布局弹性与单位制** | **90 / 100** | A- | PageShell 容器规范；主操作全流式；仍有少数页面 scoped CSS 留存历史像素堆叠（`clamp(px, vh, px)`）。 |
| **5. 组件与模式一致性** | **92 / 100** | A | Nuxt UI + 领域组件为主；个别遗留页面（如 `login/index.vue`）使用原生 raw HTML 控件。 |
| **6. 文案、术语与真实性** | **89 / 100** | B+ | 术语严格符合规范；博客/更新日志 markdown 正文仍留存 69 处 Emoji 标题。 |

---

## 3. 问题清单（按严重等级分类）

### 3.1 P0 · 阻断级发现（0 项）
当前版本无破坏核心任务流、状态造假或键盘焦点死锁的 P0 缺陷。

---

### 3.2 P1 · 重要级发现（3 项）

#### F-101 · 卡片多层嵌套与容器层级过厚（Kill-AI-Slop Tell 23）
- **位置**：
  1. `components/TitleCollection.vue:39-77`
  2. `components/MyAchievementOverview.vue:59-92`
  3. `components/submissions/SubmissionRequirements.vue:17-24`（嵌入在 `pages/submissions/new.vue:54` 的 `UCard` 内）
- **表现与违规原因**：
  - 在 `TitleCollection.vue` 中：外部为 `title-group`（带边框和背景的 `<details>` 容器）$\rightarrow$ 内部嵌套 `map-group`（第二层带边框和背景的 `<details>` 容器）$\rightarrow$ 最内层为 `title-card`（第三层带边框和背景的卡片）。形成了「卡片套卡片套卡片」的视觉厚重感，增加了不必要的视觉噪声。
  - 在 `MyAchievementOverview.vue` 中：外部为 `achievement-section`（带边框卡片）$\rightarrow$ 内部为 `map-title-group`（带边框卡片）$\rightarrow$ 最内层为 `achievement-card`（第三层卡片）。
  - 在 `submissions/new.vue` 中：外层包裹了 `<UCard class="submission-card">`，内部右侧栏又通过 `SubmissionRequirements.vue` 循环生成 5 个 `<UCard class="requirement-card">`。
- **修复方案**：
  - 去除中间层的背景和描边，将子分组退化为纯排版分割（仅通过字阶与间距分组），保留最底层卡片或最外层容器，维持单层视觉深度。
  - `SubmissionRequirements.vue` 改用无背景描边的纯语义列表（`<dl>` 或 `<ul>`），移除嵌套的 `<UCard>`。

---

#### F-102 · 全局 Eyebrow / Kicker 机械化复用（Kill-AI-Slop Tell 10）
- **位置**：
  1. `components/admin/AdminWorkspace.vue:12`：`<p class="eyebrow">管理后台</p>`
  2. `components/admin/BindingInvitePanel.vue:116`：`<p class="invite-panel__eyebrow">定向邀请</p>`
  3. `components/admin/BindingInviteBatchPanel.vue:102`：`<p class="batch-invites__eyebrow">定向邀请</p>`
  4. `pages/bind.vue:36`：`<p class="eyebrow">目标账号</p>`
- **表现与违规原因**：
  - 违反 Kill-AI-Slop 原则：「不添加仅重复主标题已知上下文的小标题（Kicker/Eyebrow）」。
  - 在所有管理后台页面中，`AdminWorkspace` 都在 `<h1>` 上方机械输出 `<p class="eyebrow">管理后台</p>`。管理员已处于管理后台路径中，该 Eyebrow 纯属格式套话。
  - `bind.vue` 与 `BindingInvite*.vue` 中的「目标账号」「定向邀请」同理，直接看表单或主标题即可明白意图。
- **修复方案**：
  - 在 `AdminWorkspace.vue` 中移除固定的 `<p class="eyebrow">管理后台</p>`，直接展示具体的工作区大标题（如「事件管理」「审核管理」），将视觉焦点留给页面核心内容。
  - 清理 `bind.vue` 及绑定面板中多余的 Eyebrow。

---

#### F-103 · 局部页面绕过 Nuxt UI 控件系统（DESIGN 原则 #4 Familiar Controls）
- **位置**：
  - `pages/login/index.vue:43, 51, 62, 65`
- **表现与违规原因**：
  - `pages/login/index.vue` 中存在大量原生 HTML 标签与一次性手写类名：
    - `<button class="primary-button">`、`<button class="secondary-button">`、`<button class="text-button">`
    - `<select v-model="selectedAccountId">`（本地开发账号选择器）
  - 整个 Portal 其余页面统一采用 Nuxt UI（`<UButton>`、`<USelect>`、`<UCard>`）。原生 `<select>` 缺乏设计系统的统一样式、焦点环和无障碍增强。
- **修复方案**：
  - 将 `login/index.vue` 中的按钮与下拉选择器重构为 `<UButton>` 和 `<USelect>`，统一复用 Nuxt UI 状态体系。

---

### 3.3 P2 · 次要级与工艺级发现（5 项）

#### F-201 · 触控热区与按压行为局域不一致（Apple Design §10 & §1）
- **位置**：
  - `components/admin/BindingInviteBatchPanel.vue:125-126`
- **表现与违规原因**：
  - 样式定义了 `.batch-invites__actions { min-height: 34px; }`，低于 Apple Design 和仓库布局规范的 $44\text{px}$（`2.75rem` / `.hit-44`）底线。
  - 内部编写了局部按钮按压动效 `.batch-invites :deep(button:active) { transform: scale(.98); }`，脱离了全局 `main.css` 的 `--press-scale: 0.97` 与 `.pressable` 体系。
- **修复方案**：
  - 容器提升至 `min-height: 44px` 或 `.hit-44`；移除局部 `scale(.98)`，统一使用 Nuxt UI 默认按压或 `.pressable`。

---

#### F-202 · 地图缩略图硬编码装饰性几何线条与圆环（Kill-AI-Slop Tell 06）
- **位置**：
  - `components/maps/MapCard.vue:28, 46-49`
- **表现与违规原因**：
  - HTML 中硬编码了无语义的占位节点：`<i></i><b></b>`
  - CSS 中针对这些节点及伪元素定义了斜角线条和悬浮圆环：
    ```css
    .map-card-visual::before, .map-card-visual::after { ... transform: rotate(-19deg); }
    .map-card-visual i { width: 170px; height: 170px; ... }
    .map-card-visual b { width: 92px; height: 92px; ... }
    ```
  - 这属于典型的 AI 模板装饰性线条插画（Gradients / Shapes as atmosphere），与纯粹的功能型设计冲突。
- **修复方案**：
  - 移除 HTML 中的 `<i></i><b></b>` 节点及其对应的 CSS 伪元素规则，缩略图纯净展示封面图、背景或文字编号徽标。

---

#### F-203 · 管理看板指标卡发光脉冲点（Kill-AI-Slop Tell 18）
- **位置**：
  - `components/admin/AdminDashboardMetrics.vue:24`
- **表现与违规原因**：
  - 指标卡使用了彩色发光光晕圆点：
    ```css
    .metric--accent::before {
      background: var(--accent);
      box-shadow: 0 0 0 5px color-mix(in oklch, var(--accent) 16%, transparent);
    }
    ```
  - 静态统计卡片无需模拟即时在线状态的发光光晕（glowing status dot）。
- **修复方案**：
  - 移除 `box-shadow: 0 0 0 5px ...`，改为朴素的实体小圆点或直接移除该点，依靠数值和文字排版建立层级。

---

#### F-204 · 截图要求表单图标堆叠与小贴士图标（Kill-AI-Slop Tell 13）
- **位置**：
  - `components/submissions/SubmissionRequirements.vue:4-10, 25`
- **表现与违规原因**：
  - 5 项截图要求（游戏 ID、地图名称、游戏难度、通关数据与标志、相关挑战数据）每一项都配了一个 Lucide 图标（`user-round`, `map`, `chart-no-axes-column`, `badge-check`, `star`）。
  - 下方的建议行也带有 `<UIcon name="i-lucide-lightbulb" />`。
  - 这种「每一个名词都必须配一个图标」的模式分散了用户的阅读注意力（Icon Stuffing）。
- **修复方案**：
  - 截图要求采用清晰的数字序号或要点列表（`1. 2. 3.` 或粗体引导词），移除装饰性图标；小贴士改为简洁的文本备注。

---

#### F-205 · 历史页面 Scoped CSS 中残留的绝对像素堆叠（Layout & Spacing 规范）
- **位置**：
  - `pages/index.vue:55-64`（如 `clamp(56px, 9vh, 96px)`）
  - `pages/me.vue:231, 238, 239`（如 `clamp(64px, 9vh, 104px)`、`clamp(56px, 8vw, 88px)`）
  - `pages/submissions/new.vue:105`（如 `clamp(56px, 8vw, 88px)`）
- **表现与违规原因**：
  - 仓库布局规范明确要求：「间距结构优先采用 `rem`、`clamp()` 与语义 CSS 变量，避免连续硬编码像素堆叠」。
  - 目录类页面已统一采用 `.directory-page`（`padding-block: clamp(4rem, 9vh, 6.5rem) 4.5rem;`），但个别页面仍保留了历史像素 clamp。
- **修复方案**：
  - 将各页面的外边距与内边距统一收归至 `rem` 单位制，或复用 `main.css` 中已有的 archetype 类。

---

### 3.4 P3 · 内容与文案级发现（2 项）

#### F-301 · 博客与开发日志中的 Emoji 标题堆叠（Kill-AI-Slop Tell 15）
- **位置**：
  - `content/blog/achievement-challenges-and-anniversary.md:31-318`（69 处命中）
- **表现与违规原因**：
  - 博客正文的每一个小节标题均以 Emoji 开头（如 `## 🔎 TL;DR`、`## 🛠️ 5.0 的优化与改进`、`## 🏆 成就挑战系统的改进`、`### ✨ 为什么要改造成就系统？`、`### 🔄 轮换挑战即将加入`、`### 🤖 提交与核对流程优化`）。
  - 这属于典型的 AI 营销腔排版，降低了长文的可读性与严肃感。
- **修复方案**：
  - 清理 Markdown 正文标题中的 Emoji，恢复干净纯粹的中文排版层级。

---

#### F-302 · 测试 Stub 中的历史遗留文案漂移
- **位置**：
  - `pages/admin/maps/[mapId].test.ts:56`
- **表现与违规原因**：
  - 测试用例中仍包含旧英文测试模板「Gameplay revisions」，而生产界面已根据术语表完全规范为「版本修订」。
- **修复方案**：
  - 将测试桩文案同步对齐最新中文术语。

---

## 4. Apple Design 深度评估与对标

基于 WWDC *Designing Fluid Interfaces*、*The Details of UI Typography* 与 *Principles of Great Design*，对 Portal 交互与质感进行系统级检视：

```
Apple Design WWDC 交互与质感模型
┌─────────────────────────────────────────────────────────────┐
│ 1. 响应与流体 (Response & Fluidity)                           │
│    ├─ Pointer-down 按压即刻反馈 (100ms Scale 0.97)           │ [PASS]
│    ├─ 路由与弹窗连续性 (无输入阻塞，Symmetric Transitions)       │ [PASS]
│    └─ 触控热区底线 (≥44px / .hit-44)                         │ [PASS - 1 Nit]
├─────────────────────────────────────────────────────────────┤
│ 2. 材料与层级 (Materials & Depth)                             │
│    ├─ 浮动功能层材料 (backdrop-filter: blur + saturate)      │ [PASS]
│    ├─ 严禁毛玻璃多层叠叠 (Solid Segment on Glass Shells)     │ [PASS]
│    └─ 阴影与海拔阶梯 (Elevation 1-3)                          │ [PASS]
├─────────────────────────────────────────────────────────────┤
│ 3. 排版与度量 (Typography & Metrics)                          │
│    ├─ 字阶与追踪联动 (大标题 -0.052em 负追踪，正文 0 追踪)       │ [PASS]
│    ├─ 行高反向缩放 (Leading: Display 0.94 -> Body 1.65)      │ [PASS]
│    └─ 系统级字体回退栈 (SF Pro / PingFang SC / Segoe UI)      │ [PASS]
├─────────────────────────────────────────────────────────────┤
│ 4. 无障碍与偏好 (Accessibility & Preferences)                 │
│    ├─ prefers-reduced-motion (降级为纯透明度淡入淡出)          │ [EXCELLENT]
│    ├─ prefers-reduced-transparency (毛玻璃降级为实体背景)      │ [EXCELLENT]
│    └─ prefers-contrast: more (边缘线强制强化高对比)          │ [EXCELLENT]
└─────────────────────────────────────────────────────────────┘
```

### 深度对标要点说明：
1. **§1 Response（消除一切感知延迟）**：
   Portal 在 `main.css` 中定义了全局 `.pressable` / `.pressable-soft`，在 `pointerdown` / `:active` 瞬间即触发 `scale(0.97)` / `scale(0.985)`，并在 `100ms` 内完成弹性过渡，手感扎实且无点击延迟。
2. **§7 Spatial Consistency（空间路径一致性）**：
   移动端下拉菜单 `mobile-nav` 的展开与收起使用了对称的贝塞尔曲线（`cubic-bezier(.2, .7, .2, 1)` 进入 / `cubic-bezier(.8, 0, .8, .3)` 离开），且在 `prefers-reduced-motion` 下自动消除位移 transform，仅保留透明度淡入。
3. **§12 Materials & Depth（半透明材料与视觉层级）**：
   `AppHeader.vue` 浮动在页面上方，内容在下方滚动穿透；对话框 `AdminResponsiveDialog.vue` 的 Header/Footer 采用了 `.glass-segment`（高不透明度实体段），严格杜绝了在毛玻璃底层上再叠一层毛玻璃导致文字可读性崩溃的问题。
4. **§15 Typography（排版的光学尺寸与追踪）**：
   字阶规范严格执行：
   - `--type-display-size: clamp(3.2rem, 8vw, 6.5rem)` 搭配 `--type-display-tracking: -0.052em` 与 `leading: 0.94`（大字紧凑严密）
   - `--type-body-size: 1rem` 搭配 `tracking: 0` 与 `leading: 1.65`（正文舒适透气）

---

## 5. Kill-AI-Slop 35 项 Tells 逐条扫描与判定

扫描器在 255 个文件中检索出 260 处潜在代码特征，经人工逐条复核判定如下：

| Tell 编号与名称 | 扫描特征 | 命中数量 | 判定结论 | 处置说明 |
| --- | --- | :---: | :---: | --- |
| **01. 紫色/靛蓝渐变滥用** | `from-indigo`, `to-purple` | 0 | **清洁** | 全局统一使用品牌主色（OKLCH Accent）与语义中性色。 |
| **02. 文字渐变裁切标题** | `bg-clip-text` | 0 | **清洁** | 标题全部为实体墨色（`var(--text)`），无彩虹渐变字。 |
| **06. 氛围性背景装饰渐变** | `linear-gradient` | 2 | **保留** | 仅用于 `scroll-edge` 边缘柔和阴影，属于 Apple 风格滚动边缘，非 AI 氛围图。 |
| **09. 装饰性下划线/删除线** | `text-decoration` | 7 | **保留** | 仅用于富文本链接 `:hover` / `:focus-visible` 及正常 Markdown a 标签，符合可访问性。 |
| **10. 机械式标题上方小标** | `.eyebrow`, `.type-kicker` | 42 | **部分超标** | 见 F-102。已在部分业务页清理，但 `AdminWorkspace` 等仍有机械重复。 |
| **13. 到处乱插的小图标** | `i-lucide-*` 紧邻标签 | 8 | **轻度超标** | 见 F-204。`SubmissionRequirements` 存在 5 个图标堆叠。 |
| **15. 正文与标题 Emoji 泛滥** | Emoji in titles | 69 | **超标** | 见 F-301。博客文章正文存在大量 Emoji 标题。 |
| **18. 发光状态脉冲圆点** | `box-shadow` 扩散环 | 1 | **轻度超标** | 见 F-203。`AdminDashboardMetrics` 存在 1 处发光点。 |
| **19. 毛玻璃与大圆角滥用** | `backdrop-filter` | 6 | **合规保留** | 仅用于全局 Header、Drawer 与 Dialog 浮层，内容卡片全部为实体表面。 |
| **22. 边框在圆角处断裂** | 边框与圆角分离 | 1 | **合规保留** | `UFileUpload` 预览插槽正常布局。 |
| **23. 卡片套卡片套卡片** | 3+ 层嵌套 Card | 3 | **超标** | 见 F-101。`TitleCollection` 与 `MyAchievementOverview` 存在 3 层嵌套。 |
| **32. 全局一个固定 gap** | 无层次 gap | 1 | **合规保留** | 管理页折叠面板内部网格。 |
| **34. 假装终端的等宽字体** | `font-mono` | 13 | **合规保留** | 仅用于真正的业务数据：提交 ID、BattleTag、绑定码、地图 ID。符合规范。 |

---

## 6. 治理与重构路线图

建议按以下 3 个低风险独立批次开展代码优化，各批次均可独立合并与验证：

```
重构批次规划
┌─────────────────────────────────────────────────────────────┐
│ 批次 A：结构降噪与容器去层 (预计解决 F-101, F-102, F-202, F-203) │
│  ├─ TitleCollection / MyAchievementOverview 容器扁平化       │
│  ├─ SubmissionRequirements 移除嵌套 UCard 及冗余图标        │
│  ├─ AdminWorkspace 移除机械固定的「管理后台」Eyebrow          │
│  └─ MapCard 移除 `<i></i><b></b>` 几何装饰线条               │
├─────────────────────────────────────────────────────────────┤
│ 批次 B：组件与交互规范收拢 (预计解决 F-103, F-201, F-205)         │
│  ├─ login/index.vue 重构为标准 UButton / USelect            │
│  ├─ BindingInviteBatchPanel 触控区补齐至 44px 并收拢按压类   │
│  └─ index.vue / me.vue 间距收归 rem 单位制                   │
├─────────────────────────────────────────────────────────────┤
│ 批次 C：内容排版纯净化 (预计解决 F-301, F-302)                  │
│  ├─ 清理 blog / changelog Markdown 正文中的 Emoji 标题      │
│  └─ 同步 maps/[mapId].test.ts 过时测试桩文案                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. 验收与回归验证清单

在后续执行重构时，每个批次必须通过以下验证矩阵：
1. **构建与类型验证**：`pnpm check`（全库类型检查 + Lint + 单元测试 100% 通过）。
2. **Apple Design 交互体验验证**：
   - 移动端视口（$360\text{px} \sim 390\text{px}$）下无横向溢出滚动。
   - 所有按钮与点击区在触控按下瞬间即刻给出反馈，且最小高度满足 $44\text{px}$。
   - 在 macOS 辅助功能开启「减少动态效果」「降低透明度」「增强对比度」时，界面平滑降级。
3. **视觉纯净度验证**：
   - 重新运行 `node /Users/teakowa/.gemini/skills/kill-ai-slop/scripts/scan.mjs apps/portal`，确认 Tells 违规项归零。
