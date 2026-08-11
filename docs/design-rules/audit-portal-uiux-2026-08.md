# Portal UI/UX 审计报告（2026-08）

## 元信息

| 项 | 值 |
| --- | --- |
| 日期 | 2026-08-12（含追加轮：提交 `204d9ea` / `70d6ee4` 之后） |
| 范围 | `apps/portal`（全部 235 个源文件） |
| 类型 | reference（设计规则合规性快照，不具约束力；正文引用的规则文档仍以 `docs/design-rules/` 权威文档为准） |
| 验收标准 | `docs/design-rules/` 全部 12 篇权威文档、apple-design（WWDC 流体交互）、kill-ai-slop 35 项 tell |
| 方法 | ① kill-ai-slop 扫描器全量扫描（296 处命中逐条人工核验）；② 4 路并行只读审计（公开目录 / 玩家中心与提交流 / 管理后台 / 内容与登录）；③ 主代理对全部 high-signal 发现二次读码复核；④ dev server 运行时验证（本环境不可达，见「待运行时验证」）；⑤ 追加轮：审计 `204d9ea feat(admin): add map revision editor` 引入的 4 个 Portal UI 文件 |

## 摘要

Portal 的**设计系统地基健康且高于平均水准**：语义 token / type scale / glass / elevation 统一在
`main.css`；全局 `prefers-reduced-motion` / `reduced-transparency` / `contrast` 策略完整；无
`position: fixed` 决策栏；无 `hover:scale` / `transition-all` 抖动；overlay 全部走
`AdminResponsiveDialog`；无原生 file input；icon-only 控件均有 `aria-label`。

**追加轮（204d9ea）**：重构后的 `pages/admin/maps.vue` 列表页合规良好，上一轮该文件的
弹窗重复发现已随之解决；新引入的地图 revision 编辑器（4 个文件）主要问题是**中英混排文案**
（全库中文 UI 中首次出现英文 h2 与英文产品词「Reset / Rework」「revision」），另有装饰性
渐变、选中态仅靠颜色、三文件重复的一次性 type 等，共 10 项新发现。

问题集中在四类：

1. **已发布内容含占位符**（阻断）：changelog `26.0801.1` 含 `xx` / `xxx` 占位与空章节。
2. **玩家侧文案与术语失守**：非规范状态词、「（可选）」标记（明令禁止）、地图挑战/成就挑战等管理台用词混入玩家页。（「不再发放」经产品确认合规，见[合规豁免记录](#合规豁免记录产品确认)。）
3. **状态重复表达与删除测试不过关**：同一状态在多个层级重复、解释性文案未过删除测试。
4. **首页与内容 markdown 的 AI 腔**：kicker 泛滥、emoji 标题、排比宣传句、整句加粗。

## 发现统计

| 严重度 | 数量（唯一） | 说明 |
| --- | --- | --- |
| blocker | 1 | 已发布内容含占位符，必须修复 |
| major | 11 | requiredness 违规、原生表格、证据顺序 / sticky 遮挡、状态重复；追加轮 +1（中英混排） |
| minor | 56 | 文案冗余、断点 / 单位、无障碍语义、非规范状态词；追加轮 +6 |
| nit | 29 | 一次性 type、装饰、格式 glitch、px 堆叠；追加轮 +3 |
| **合计** | **原轮 97 + 追加轮 10 = 107** | S-01 已剔除（见[合规豁免记录](#合规豁免记录产品确认)）；m-20（maps.vue 弹窗重复）已随 `204d9ea` 重构解决，当前待修 106 项 |

按页面集群分布：公开目录 31 · 玩家中心与提交流 32（S-01 剔除）· 管理后台 22（+10 追加轮）· 内容与登录 14。

## 阻断级发现（1）

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| B-01 | `content/changelog/26.0801.1.md:13-92` | 已发布 changelog（`releasedAt: 2026-08-01`）含 `#### xx`、`- **xx：**`、`> xxx`、`- xxx` 占位 20+ 处；「视觉效果更新 / 成就挑战调整 / 全新地图：/ 错误修复」四章节为空 | terminology.md §内容与更新：changelog 只收录已发布内容 | 补全内容后重新发布，或撤回该版本；发布前增加「无 xx/xxx 占位」检查 |

## 严重级发现（11，均经二次读码复核；追加轮 +1 见 R-01）

### 玩家侧文案与术语

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| S-02 | `components/AchievementSubmissionCatalog.vue:38,50-51` | 玩家侧把 `family=map` 写为「地图挑战」（管理台用词），另造「地图范围挑战」 | terminology.md：玩家页统一「地图通关」 | 统一「地图通关」 |
| S-03 | `components/AchievementSubmissionCatalog.vue:55-57` | scheduled 组用非规范词「暂未开放」+「即将开始」，且 `未开放，暂不接受截图提交。` 重复「未开放」事实 | terminology.md（scheduled → 未开放）；content-and-state §重复事实 | 单标签「未开放」 |

### requiredness（明令禁止项）

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| S-04 | `components/reviews/ReviewEditor.vue:36` | 可选字段「评价内容」标记「（可选）」 | portal-ui-guidelines §Form field requiredness：禁止 | 删除后缀 |
| S-05 | `pages/admin/player-reviews/index.vue:138-139` | `aria-label='操作理由（可选）'` + `placeholder='操作理由（可选）'` + 说明句「理由可选，不填写也可以完成操作。」×3 | 同上 | 全部去掉标记 |

### 组件选型

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| S-06 | `components/admin/AdminPlayerTitles.vue:137` | admin 原生 `<table class="title-table">` 取代 AdminDataTable；`min-width:560px` 横向滚动 | portal-ui-guidelines §Admin panels：默认必须用 AdminDataTable；interaction-accessibility §Responsive admin lists | 改用 AdminDataTable + `mobile-columns` + `row-key="grantId"` |

### 提交流程结构与定位

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| S-07 | `pages/submissions/[submissionId].vue:64-70,201-209,253` | 提交状态三层级重复：顶部 `statusAlert` + 概览卡 `SubmissionStatusBadge` + 进度条 | content-and-state §重复事实测试；§Badge/status「不得在独立状态区域重复」 | 保留 badge 与进度；alert 只留「需行动」的差异化事实 |
| S-08 | `pages/submissions/[submissionId].vue:499-513` | 移动端证据列在详情之后（规范要求 collapse above details）；桌面端 `grid-column:1` 反转证据到左列 | page-archetypes §Submission detail and status | 移动端顺序：状态 → 证据 → 识别结果 |
| S-09 | `pages/submissions/[submissionId].vue:504` | sticky 证据 `top:24px`，被悬浮头部（约 14–68px）遮挡约 44px | layout-and-spacing §Positioning（sticky 不得遮盖内容） | `top: var(--sticky-chrome-top)`（76px） |

### 无障碍状态表达

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| S-10 | `components/AchievementSubmissionCatalog.vue:53,65`、`components/MapSubmissionCatalog.vue:34-35` | 挑战选中态仅靠边框+底色（`.selected`），无 `aria-pressed` / 选中图标 | content-and-state §State presentation（颜色/图标/位置单独不足以表达状态） | 加 `aria-pressed` 与可见选中指示 |

### 首页信息架构

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| S-11 | `pages/index.vue:19,26,27` | 「未开放」在焦点面板 h2、轮换区段落、feature-detail 三处重复 | content-and-state §重复事实测试（「未开放」在分区标题与子卡片重复） | 保留一个事实状态，删除两段冗余 |
| S-12 | `pages/index.vue:12,15,18,33-37` | 首页 eyebrow + hero 描述 + 焦点面板 eyebrow/段落 + 每张卡片 `type-kicker` + 卡片描述，全部为默认不添加项 | content-and-state §Defaults（eyebrow/描述/kicker 默认不加）；kill-ai-slop tell 10（kicker 泛滥） | 删冗余，仅保留不可推断的信息（见修复批次 B） |

## 次要发现（56，按主题分组；追加轮 +6 见 R-02~R-07）

### 文案与状态词汇

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| m-01 | `components/submissions/SubmissionProgress.vue:10` | 步骤 detail「等待进入核对」非规范词 | terminology.md §提交状态：等待核对 | 改「等待核对」 |
| m-02 | `components/submissions/SubmissionProgress.vue:42` | 「处理未通过」不在状态表 | 同上 | 用表内词（未通过 / 需重新提交） |
| m-03 | `components/admin/AdminSubmissionReviewDetail.vue:170` | 操作「要求重传」 | terminology.md：需重新提交 | 改「要求重新提交」 |
| m-04 | `content/changelog/26.0729.1.md:64-143` | 已发布 changelog 大面积使用 审核 / OCR / 人工复核 / 发放（玩家侧禁用词） | terminology.md §玩家侧禁用词 | 统一核对 / 识别 / 获得 |
| m-05 | `content/blog/achievement-challenges-and-anniversary.md`、`title-system-rebuild.md` | blog 多处 审核 / OCR / 发放 | 同上 | 同上 |
| m-06 | `components/reviews/ReviewSummary.vue:24` | 加载文案「正在读取评价…」 | terminology.md §加载状态：读取中… | 改「读取中…」 |
| m-07 | `components/reviews/ReviewSummaryBadge.vue:12` | 「评分读取中」 | 同上 | 改「读取中…」/「暂无评分」 |
| m-08 | `pages/submissions/[submissionId].vue:64-70` | alert 用避免句式：「识别通过后确认…」（≈完成后会自动……）、「已提交处理申请，请稍后查看结果。」（误述自动路由）、「提交已通过。」（纯复述） | portal-copy-guidelines §避免的句式 | 只保留携带真实下一步的说明 |
| m-09 | `pages/bind.vue:42-43` | 「验证成功后将自动完成首次绑定并登录。」「处理完成后本页面会自动继续。」 | portal-copy-guidelines §避免的句式（完成后会自动……） | 改事实状态词（绑定待处理） |
| m-10 | `pages/submissions/[submissionId].vue:332` | 证据失败「无法读取截图」缺下一步 | portal-copy-guidelines §推荐写法：对象 + 请稍后重试 | 改「无法读取截图，请稍后重试。」 |

### 内容层级与删除测试

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| m-11 | `pages/events.vue:17`、`pages/maps.vue:40` | 页面描述「查看当前事件与开放挑战。」等默认添加，未过删除测试 | content-and-state §Page description default | 删除 |
| m-12 | `components/maps/MapDirectory.vue:61`、`components/maps/MapMasteryProfile.vue:34`、`components/player/MasteryMapOverview.vue:27` | UEmpty 标题+描述重复事实（暂无精通记录 + 尚无已验证通关 等） | content-and-state §Successful but empty / 删除测试 | 只留标题 |
| m-13 | `components/maps/MapMasteryProfile.vue:27,36` | 已验证通关次数在分区头 meta 与汇总行重复 | §重复事实 | 保留一处 |
| m-14 | `components/reviews/ReviewEditor.vue:27` | 「你的评价会帮助其他玩家了解这项内容。」未过删除测试 | §Deletion test | 删除 |
| m-15 | `components/reviews/PlayerReviewPanel.vue:47` | 「登录后可以提交或修改你的评价。」与「登录后评分」按钮重复 | §Deletion test and duplicate-fact test | 保留按钮，删句子 |
| m-16 | `components/submissions/SubmissionRequirements.vue:11,24` | 「请确保截图包含以下内容」冗余 + 「小贴士」UAlert 作常规描述 | content-and-state §UAlert 保留于异常状态；portal-copy-guidelines | 删引导句；tip 改普通辅助行 |
| m-17 | `components/submissions/SubmissionProcess.vue:9` | 流程卡加入第 5 步「游戏内同步」，超出术语表 4 步（上传截图/截图识别/核对结果/获得称号）；提交页整卡未过删除测试 | terminology.md §玩家侧流程步骤 | 对齐 4 步或删除卡片 |
| m-18 | `pages/me.vue:171-177` | 未来功能卡：kicker「限时目标」+ 非交互 `<article>` 用 `aria-disabled`（误用） | content-and-state §Defaults；a11y 语义 | 移除装饰卡或改 inert 内容 |
| m-19 | `pages/admin/achievements.vue:498` | 目录说明「目录称号为权威定义，可单独授予；与可提交挑战不同。」与「挑战关联」列重复 | portal-ui-guidelines §Admin copy 最小化 | 删除 |
| m-20 | `pages/admin/maps.vue:270-273` | 弹窗体重复 eyebrow + h2（标题已含） | §重复事实 | 删 eyebrow/h2 |
| m-21 | `components/admin/AdminReviewDetail.vue:26` | 「维护者仍可查看真实身份」与列表页描述重复 | §重复事实 | 保留一处 |

### 布局 / 单位 / 断点

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| m-22 | `pages/submissions/[submissionId].vue:528-530` | 44px 触控下限仅 ≤360px 生效，361–620px 主操作低于下限 | layout-and-spacing §Touch targets | ≤620px 统一 44px |
| m-23 | `components/AchievementSubmissionCatalog.vue:61` | `.catalog-section { max-height:min(65vh,620px); overflow:auto }` 内嵌纵向滚动，无文档化理由 | interaction-accessibility §Responsive admin lists（bounded 滚动为 opt-in） | 交给页面自然滚动 |
| m-24 | `pages/admin/titles.vue:385` | 批确认弹窗 `.pending-list { max-height:280px; overflow:auto }` 同上 | 同上 | 删 max-height/overflow |
| m-25 | `pages/index.vue:53-63,69` | 首页 page-local 容器（`.site-shell` padding、1100px/1280px max-width）绕过 page-shell | layout-and-spacing §Containers and gutters | 用 page-shell |
| m-26 | 多处（`bindings.vue:414`、`achievements.vue:567`、`maps.vue:378`、`[submissionId].vue:402,439` 等） | 系统性硬编码 px 间距堆叠 | layout-and-spacing §Units | 归入重构 backlog 批量转 rem |

### 组件 / 交互 / 无障碍

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| m-27 | `components/admin/AdminReviewQueue.vue:24` | 手写 `role="table"` 网格（功能即表格） | portal-ui-guidelines §Admin：默认用 AdminDataTable | 改纯记录列表或 AdminDataTable |
| m-28 | `pages/admin/bindings.vue:281-293` | 移动端 `mobile-columns` 未把「状态」提为主列（关键决策事实被折叠） | interaction-accessibility §Responsive admin lists | `mobile-columns` 状态列置首 |
| m-29 | `pages/admin/players/[playerAccountId].vue:87` | `placeholder="可选"` | portal-ui-guidelines §requiredness | 删除 |
| m-30 | `components/admin/BindingInvitePanel.vue:121` | 辅助文案以「可选。」开头 | 同上 | 删前缀，保留约束部分 |
| m-31 | `components/admin/AdminAchievementCreateDialog.vue:53,95-96` | 状态=未开放时开始/结束时间实际必填但未标记 | portal-ui-guidelines §requiredness（UI 与行为一致） | 条件标记 required |
| m-32 | `pages/admin/titles.vue:349-375` | 批确认缺「后果」步骤 | page-archetypes §Admin batch confirmation（选择→数量→后果→操作） | 补一行后果说明 |
| m-33 | `pages/admin/player-reviews/index.vue:130-141` | 「使评价失效」color=error 但未说明后果 | portal-ui-guidelines：破坏性操作说明后果 | 补后果（评价将不再公开展示） |
| m-34 | `components/maps/MapCard.vue:45-49` | 封面装饰：旋转十字线、双圆环、投影 | visual-foundation §Density and chrome；slop tell 06/16 | 移除装饰几何 |
| m-35 | `components/events/EventDirectory.vue:188-196` | `.event-card` 局部重定义材料（translucent color-mix）+ radius 14px | visual-foundation §Materials；components-and-patterns §Cards | 复用共享卡片类 |
| m-36 | `components/AchievementCatalog.vue:38,48` | sunsetting 自制 pill（嵌套版本 chip）而非 StatusBadge | components-and-patterns §Status | 用 StatusBadge（即将结束） |

### AI slop（内容与首页之外）

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| m-37 | `pages/submissions/[submissionId].vue:444-449` | resubmission tip 圆角图标块（icon in tint of itself） | slop tell 18/25（边缘项） | 可保留，或改普通行内图标 |
| m-38 | `components/AchievementSubmissionCatalog.vue:53,65`、`MapSubmissionCatalog.vue:34-35` | 一次性 `:active { transform: scale(.985) }` 绕过共享 pressable | motion-and-feedback §Allowed motion vocabulary | 用 `pressable-soft` |

### 文案 slop（内容 markdown，kill-ai-slop 重灾区）

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| m-39 | blog/changelog 6 个 md 文件 30+ 处 | emoji 标题前缀（🔎🛠️🏆✨🔄📊🤖🗃️🛡️🚫🎂💬🃏🧬🎰🔷🌟❤🚧📅❓🔃🌐…） | portal-copy-guidelines §基本规则（克制、事实性）；slop tell 15 | 去 emoji，用纯事实标题 |
| m-40 | 同上 | AI 文案腔：整句加粗、不是…而是…、破折号习惯、宣传收尾（「邀你共赴新的挑战！」「将被彻底终结」「绝不留下任何逻辑垃圾」） | kill-ai-slop tell 14；portal-copy-guidelines §避免的句式 | 去宣传性排比，还原事实陈述 |
| m-41 | `content/blog/event-preview-and-ssr-expectations.md` 等 | 半角空格夹在全角括号内（`:66,68,74-77` 等）、`——当然…` 破折号 | 文案格式 | 规范标点与空格 |
| m-42 | `content/changelog/26.0729.1.md:60,139-142`、`technical-optimization.md:20`、`title-system-rebuild.md:25` | markdown 格式 glitch（双空格、加粗断行） | 文案格式 | 规范化 |

## 细节发现（29；追加轮 +3 见 R-08~R-10）

| # | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| n-01 | `pages/index.vue:56-63` | h1/hero-topic/panel-eyebrow/card-label 一次性 type/tracking 绕过共享 scale | 用 type-display/type-title/type-kicker |
| n-02 | `pages/index.vue:61` | 焦点列表装饰圆点（`li::before` 4px accent） | 用标准列表或移除 |
| n-03 | `pages/index.vue:69` | 页脚 `.66rem` + `.07em` 一次性 type 对 | 用 type-caption |
| n-04 | `pages/events.vue:41`、`components/events/EventDirectory.vue:249` | 一次性 520px 断点 | 用 620px |
| n-05 | `pages/maps.vue:61,63`、`components/maps/MapDirectory.vue:68-69` | 一次性 860/560/360px 断点 | 用 820/620 |
| n-06 | `components/player/MasteryMapOverview.vue:43` | 一次性 700px 断点 | 用 620 或 760px |
| n-07 | `pages/events.vue:35-36`、`pages/maps.vue:58` | 骨架屏 px 间距堆叠 | 转 rem |
| n-08 | `components/events/EventDirectory.vue:68,201` | `.event-rarity` 自制 accent 徽标 | 复用 UBadge 或纯文本 |
| n-09 | `components/events/EventDirectory.vue:202` | `.event-card h3` 1.08rem 一次性字号 | 用 type-headline |
| n-10 | `components/maps/MapCard.vue:51` | `.map-card-heading h2` 1.32rem | 用 type-headline |
| n-11 | `components/maps/MapCard.vue:34` | 精通读取失败仅显示「暂不可用」 | 补推荐失败文案或重试路径 |
| n-12 | `components/maps/MapDetailModal.vue:74` | 一次性 `letter-spacing:-.025em` | 用共享 card-heading |
| n-13 | `components/AchievementCatalog.vue:47` | 组 h2/card title 一次性 clamp + tracking | 用 type-headline scale |
| n-14 | `components/TitleCollection.vue:78`、`PlayerBattleTag.vue:25`、`me.vue:287-289`、`bind.vue:60` | 一次性 heading tracking/size 覆盖 | 用共享 type 类 |
| n-15 | `components/player/MasteryMapOverview.vue:33-36` | 地图名单行截断（nowrap+ellipsis）截断主身份 | `overflow-wrap:anywhere` |
| n-16 | `components/PlayerBattleTag.vue:14` | `aria-hidden` 隐藏 #ID 数字部分，无障碍名不完整 | 组合完整字符串或不禁用 |
| n-17 | `pages/submissions/[submissionId].vue:57` | `ocrValue` 映射「已识别完成/未识别完成」措辞别扭 | 改「识别到/未识别到」 |
| n-18 | `pages/login/index.vue:84` | `.text-button` 40px 低于 44px 下限 | 用 .hit-44 |
| n-19 | `pages/login/index.vue:34` | 页面 eyebrow「玩家登录」重复 h1 | 删除 |
| n-20 | `pages/blog/index.vue:10`、`pages/changelog/index.vue:9` | SEO 描述用内部代号「Portal」 | 改「平台」 |
| n-21 | `content/editorial-schemas.ts:1-21` | schema 无 emoji 标题防护 | 可加 zod 防护 |
| n-22 | `components/admin/AdminDateTimePicker.vue:99-107` | time input 无 aria-label | 加 aria-label |
| n-23 | `components/admin/AdminTitleMigrationHolders.vue:33-44` | `role="tablist"` 无 tabpanel/键盘行为 | 改 `aria-pressed` 按钮组 |
| n-24 | `components/admin/AdminPlayerTitles.vue:139-140` | grants 切换仅 class 表达 | 加 aria-pressed |
| n-25 | `components/admin/AdminPlayerDetail.vue:152`、`AdminTitleMigrationDetail.vue:126` | 破坏性行操作用 `variant="link"` 裸文字 | 用 size=sm outline 按钮 |
| n-26 | `components/admin/AdminTitleMigrationMetrics.vue:27` | 成功色误用 `--accent` | 用 --success |
| n-27 | `components/admin/BindingInviteBatchPanel.vue:125-126` | 一次性 `:active scale(.98)` + 列表 enter/leave 位移动画 | 用 pressable + opacity 过渡 |
| n-28 | `components/admin/AdminTitleMigrationDetail.vue:60-109` | 卡片套卡片（UCard 包 AdminDataTable） | 中和内层容器边框/圆角 |
| n-29 | `pages/admin/index.vue:58-62` + `AdminDashboardMetrics.vue` | dashboard 概览层（指标+mini queue+详情文案）处于边界 | 视决策价值决定是否裁剪 |

## 追加轮发现（2026-08-12 · 提交 `204d9ea` 之后）

审计对象：`pages/admin/maps/[mapId].vue`（新）、`pages/admin/maps.vue`（重构）、
`components/admin/AdminMapRevisionEditor.vue`（新）、`components/admin/AdminMapRevisionList.vue`（新）。
重构后的 `maps.vue` 列表页合规良好（AdminWorkspace + AdminDataTable + mobile-columns + row-key +
aria-label 过滤控件），上一轮 m-20（弹窗 eyebrow 重复）已随之解决。新编辑器共 10 项发现。

### 严重级（1）

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| R-01 | `maps/[mapId].vue:143,208,210,222`、`AdminMapRevisionEditor.vue:108,150`、`AdminMapRevisionList.vue:26` | **中英混排文案贯穿新 UI**：全英文 h2「Gameplay revisions」、按钮/弹窗「Reset / Rework」、字段与 toast 中的英文词「revision」「Revision 配置」「Revision-scoped challenge assignments」、SEO 标题「地图 revision 编辑器」——全库中文界面中首次出现英文产品词与英文 h2 | terminology.md（中文唯一来源）；portal-copy-guidelines（克制、一致）；文案一致性 | 统一中文术语（如「修订版本 / 边界版本」），新增术语先入 terminology.md；「Reset / Rework」→「重置 / 重做」 |

### 次要级（6）

| # | 位置 | 问题 | 规则引用 | 修复 |
| --- | --- | --- | --- | --- |
| R-02 | `AdminMapRevisionEditor.vue:134`、`AdminMapRevisionList.vue:30` | 内部架构说明：「Portal 不复制挑战规则或实现自己的引用校验」「默认和可选 revision 才会同步到 Bastion」——删除测试不过关，且「Bastion」为内部服务名 | portal-ui-guidelines §Admin copy 最小化；content-and-state §Deletion test | 只保留操作约束（如「仅默认/可选会同步」），删实现细节 |
| R-03 | `AdminMapRevisionList.vue:36-40` | revision 选中态仅靠边框 + 底色 + inset 色条（`.revision-card--selected`），按钮无 `aria-pressed` | content-and-state §State presentation（颜色单独不足以表达） | 加 `aria-pressed` |
| R-04 | `maps/[mapId].vue:237` | `.map-summary { background: linear-gradient(135deg, var(--accent-surface), var(--surface)) }` 装饰性渐变 | visual-foundation §Density and chrome（操作面禁装饰渐变）；slop tell 06 | 用平面 `surface`/`accent-surface` |
| R-05 | `maps/[mapId].vue:240`、`AdminMapRevisionEditor.vue:158`、`AdminMapRevisionList.vue:58` | 同一 `.section-heading h2 { font-size:1.35rem; letter-spacing:-.02em }` 在三个新文件重复，绕过共享 type | css-ownership §规则（三处以上 → 抽取共享类）；visual-foundation §Typography | 抽共享 section-heading 类或改用 `type-headline` |
| R-06 | `AdminMapRevisionEditor.vue:120` | `UFormField label="游戏版本"` 未标 required，但内部 `UInput required`（行为必填、UI 未标） | portal-ui-guidelines §requiredness（UI 与行为一致） | UFormField 加 `required`（对齐 reset 弹窗写法） |
| R-07 | `maps/[mapId].vue:253` | 一次性 `@media (max-width: 850px)` 断点 | layout-and-spacing §Breakpoints | 用 820px |

### 细节级（3）

| # | 位置 | 问题 | 修复 |
| --- | --- | --- | --- |
| R-08 | `AdminMapRevisionEditor.vue:127` | 空间配置 `UTextarea aria-label="空间配置 JSON"` 与 `UFormField label="空间配置"` 重复/冲突 | 删 textarea 上的 aria-label |
| R-09 | `maps/[mapId].vue:150,162,189`、`AdminMapRevisionList.vue:23`、`AdminMapRevisionEditor.vue:108` | 每 section 均加 eyebrow（稳定地图身份/普通保存/可追溯变更/Revision 配置/公平边界），部分抽象 | 只保留有真实信息量的 eyebrow，或统一去掉 |
| R-10 | `pages/admin/maps.vue:92` | `empty="暂无地图记录。"` 带句号，与「暂无记录」短语风格不一致 | 改「暂无地图记录」（或按上下文省略） |

## 合规亮点（本轮未发现问题的部分）

- **全局 chrome**：AppHeader / layouts 完全合规——glass 悬浮、safe-area、移动导航对称过渡 + reduced-motion 折叠、焦点恢复、Escape 处理。
- **管理台主链路**：`AdminDataTable` / `AdminResponsiveDialog` / `AdminWorkspace` 使用正确；服务端分页跟随文档流、无无限滚动；`events.vue` 虚拟滚动有文档化理由（合规 opt-in）；批处理、绑定撤销、封禁等破坏性操作均 color=error + 后果 + loading。
- **requiredness**：除 S-04/S-05 外全库无其他「（可选）」违规。
- **术语强项**：全库无「版本记录」；事件/称号状态词基本统一；review 组件未混入 审核/OCR。
- **动效与偏好**：全局 reduced-motion 把 transform 折叠为 opacity/color、`prefers-contrast` 强化边框、`prefers-reduced-transparency` 固化 glass——实现完整。
- **无障碍基操**：icon-only 控件均有 aria-label；overlay 焦点恢复正确；记录 key 用稳定 ID；`EffectGlossaryTooltip` 为规范允许的低频澄清模式。

## 合规豁免记录（产品确认）

以下条目在初轮审计中被标记，后经产品确认合规，从发现清单中移除。未来轮次不得重复上报。

| 原编号 | 位置 | 原判定 | 豁免理由 |
| --- | --- | --- | --- |
| S-01 | `components/MyAchievementOverview.vue:69` | 玩家侧 badge「不再发放」使用禁用词「发放」 | 产品确认合规；已在 [terminology.md §玩家侧禁用内部词](terminology.md) 登记为「不再发放」例外（2026-08-12） |

## Apple-design 视角观察

| 原则 | 结论 |
| --- | --- |
| §1 响应优先 | `pressable` 在 pointer-down 生效、100ms 短过渡——达标 |
| §7/§11 空间一致、内容连续性 | **移动端证据顺序违反阅读连续性（S-08）；sticky 证据被头部吞掉（S-09）**——本轮最贴近 apple-design 的两处缺陷 |
| §14 减速偏好 | 全局策略完整，优于多数项目 |
| §1/§10 触控与直接操纵 | 上传预览 16:9 固定帧违背保真度精神（m-13 相关）；44px 下限覆盖不全（m-22） |

## Kill-ai-slop 视角观察

- 扫描器全量 296 处命中，**核验后绝大多数为误报**：`main.css` 的 `backdrop-filter` 是设计系统自有的材料语言（非玻璃滥用）；mono 字体仅用于 ID/代码/邀请码（非 tell 34）。
- 真实 slop 集中在：**内容 markdown**（emoji 标题、AI 文案腔、格式 glitch）、**首页**（kicker 压满标题 tell 10、未开放三连、焦点面板重复）、边缘项（tip-icon 圆角图标块、自制 sunsetting pill）。

## 待运行时验证（1 项）

本地 dev server 在本环境对 localhost 请求立即断开（`/healthz` 同样 000），无法做浏览器实测。
**颜色对齐问题**：`app.config.ts` 将语义色映射到 stock 调色板（`primary=orange / neutral=stone / info=sky / success=green / warning=amber / error=red`），而 `main.css` 定义的 `--ui-info/--ui-success/…`（oklch 定制 token）在 Nuxt UI v4 中仅 `Editor.vue` 消费 `--ui-primary`——**高度疑似组件实际渲染 Tailwind 出厂调色板**（slop tell 04），与「与 oklch token 对齐」的文档声明不符。
验证方式：在可运行环境打开任一 `color="success"` 的 badge，用 devtools 确认 computed color；若为 stock green-600 即坐实。

## 修复优先级（遵循 DESIGN.md Refactor contract：一次一表面、先补文档再铺开）

| 批次 | 内容 | 说明 |
| --- | --- | --- |
| **A · 立即（独立小修）** | B-01 占位符；S-02/S-03 术语；S-04/S-05（可选）；S-06 原生表格；S-07 alert 去重；S-09 sticky top；S-10 aria-pressed；m-01~m-10 状态词与句式；**R-01 中英混排、R-03 aria-pressed、R-04 渐变、R-06 required、R-07 断点** | 每项单文件单规则，可直接进 PR |
| **B · 独立重构轨道** | 首页 `index.vue` 重写（去 kicker/描述/重复事实，对齐公开目录范式）；R-05 抽取共享 section-heading type | 一次只动一个表面 |
| **C · 内容治理** | 全量清点 blog/changelog：删 emoji 标题、去 AI 腔、玩家侧 审核→核对 / OCR→识别 / 发放→获得 | 需人工判断语感，单独任务 |
| **D · 布局 backlog** | 系统性 px→rem、断点收敛到 620/760/820（含 R-07）、44px 触控下限统一 | 按 layout-and-spacing §Refactor backlog 执行 |

## 附录：高浓度文件索引

按发现数量排序（问题最集中的文件优先处理）：

| 文件 | 发现数 | 主要问题 |
| --- | --- | --- |
| `pages/submissions/[submissionId].vue` | 12 | 状态重复、证据顺序、sticky、句式、触控、px |
| `components/AchievementSubmissionCatalog.vue` | 8 | 术语、选中态、内嵌滚动、一次性 active |
| `pages/index.vue` | 14 | kicker 泛滥、重复事实、一次性 type/容器 |
| `pages/admin/maps/[mapId].vue`（新增） | 6 | 中英混排、内部词说明、渐变、一次性 type/断点、eyebrow |
| `components/admin/AdminMapRevisionEditor.vue`（新增） | 6 | 中英混排、内部架构说明、一次性 type、required 标记、aria 冲突 |
| `components/admin/AdminMapRevisionList.vue`（新增） | 4 | 英文 h2、选中态 aria、一次性 type、eyebrow |
| `components/admin/AdminPlayerTitles.vue` | 3 | 原生表格、tab aria、link 按钮 |
| `pages/admin/player-reviews/index.vue` | 3 | （可选）、后果说明 |
| `content/changelog/26.0801.1.md` | 1 | 占位符（阻断） |

---

*本文档为 2026-08-12 静态审计快照。修复落地后应更新本文档或归档，并以
`docs/design-rules/README.md` 中的权威文档作为新改动的验收标准。*
