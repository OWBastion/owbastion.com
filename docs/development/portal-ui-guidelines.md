# Portal UI 规范

这份规范面向修改 `apps/portal` 的 AI agent 和开发者。它把现有 Portal 的布局、组件、状态和业务边界整理成可执行的约定。新增页面或组件前，先确认是否可以复用这里已有的模式；只有现有模式无法表达需求时，才引入新的变体。

## 目标和边界

- Portal 是 API 的渲染层，不在组件中复制业务规则，也不直接访问 D1、R2、OCRKit 或 Bastion。
- 页面只展示当前用户有权看到的事实。未开放、处理中和未来规划必须保持可区分。
- 面向玩家的 UI 使用简洁、克制、事实性的中文；管理后台可以更精确地表达操作和数据字段。
- 设计优先保证清晰的层级、可操作性和移动端可用性，不为了装饰增加新的视觉系统。

## 先选页面骨架

### 公共目录页

适用于事件、地图、成就等公开内容：

```vue
<main class="<page-name>-page page-shell">
  <section class="page-intro" aria-labelledby="<title-id>">
    <h1 id="<title-id>" class="page-title">页面标题</h1>
    <p class="body-copy">只补充范围或查看目的。</p>
  </section>
  <section class="<directory>-panel surface-card" aria-label="内容列表">
    <!-- 读取中 / 读取失败 / 目录组件 -->
  </section>
</main>
```

目录加载、失败和空态必须在同一内容区域内切换。列表有筛选时，筛选器放在目录组件顶部；没有结果时使用 `UEmpty`，不要用一段解释性长文替代空态。

### 玩家中心

适用于 `/me` 及玩家私有数据：

- 页面顶部使用身份/登录状态和 `page-title`。
- 身份事实优先使用 `PlayerIdentityCard`、`PlayerBattleTag` 和 `StatusBadge`。
- 有标题和操作按钮的区块使用 `PageSectionHeader`，操作放在 `actions` slot。
- 最近记录使用已有的领域组件，例如 `TitleCollection`、`PlayerRecentSubmissions`。
- 没有记录使用 `UEmpty`，标题保持短语，例如“暂无称号”“暂无记录”。
- 尚未实现的内容使用 `未开放`，不把未来计划写成可执行按钮。

### 提交流程

适用于截图上传、提交状态和结果页：

- 上传页使用 `UCard` 作为表单容器，字段使用 `UFormField`，文件使用 `UFileUpload`。
- 提交按钮是表单唯一的主要操作；提交中使用 `loading`，同时禁用不能重复提交的输入和操作。
- 挑战选择复用 `SubmissionCatalog`、`MapSubmissionCatalog` 或 `AchievementSubmissionCatalog`，不要在页面内复制目录分组规则。
- 状态显示复用 `SubmissionStatusBadge`；状态文案以 `docs/development/portal-copy-guidelines.md` 为准。
- 提交详情可以按“概览 → 截图证据 → 识别结果”组织，但私有证据和内部识别字段只能出现在有权限的页面。

### 管理后台

适用于 `/admin`：

- 页面根节点使用 `AdminWorkspace`，页面标题、数量、消息和工具栏分别放入对应 slot/prop。
- 列表优先使用 `AdminDataTable`，筛选器放入 `filters` slot，列操作放入 table slot。
- 分页数据必须保留分页控件和当前页状态；不要把服务端分页数据一次性改成无限滚动。
- 反馈使用 `UAlert` 或 `AdminWorkspace` 的消息区域。成功、错误和危险操作不要只依靠颜色表达。
- 编辑和确认操作使用 `UModal`、`UPopover` 或 `USlideover`，根据内容量选择：短确认用 Modal，表格上下文中的小表单用 Popover，详情/审核工作区用 Slideover。
- 危险操作使用 `color="error"`，并明确写出后果；保存、下线、封禁等操作要有 loading 和禁用状态。

## 组件选择顺序

1. 先复用领域组件：`PageSectionHeader`、`StatusBadge`、`SubmissionStatusBadge`、`AdminWorkspace`、`AdminDataTable` 及 `components/<domain>/` 下的组件。
2. 再使用 Nuxt UI 基础组件：`UButton`、`UCard`、`UAlert`、`UEmpty`、`UFormField`、`UInput`、`USelect`、`UTabs`、`UTable`、`UModal`、`USlideover`、`UPopover`、`UPagination`。
3. 只有在基础组件无法表达页面特有布局时，才添加页面 scoped CSS。
4. 新组件必须有明确的领域职责；不要为了包一层 HTML，或为了单次使用而抽象通用组件。

按钮约定：主要动作使用默认/primary 按钮；次要动作使用 `color="neutral"` 配合 `outline` 或 `soft`；危险动作使用 `color="error"`；表格行内的查看/编辑优先使用 `variant="link"` 或带有明确 `aria-label` 的紧凑按钮。链接导航优先使用 `NuxtLink` 或 `UButton to`，不要用 click handler 模拟跳转。

## 视觉 token 和布局

优先使用 `apps/portal/assets/css/main.css` 中的语义 token，不直接写新的颜色值：

- 页面背景：`var(--page)`；普通容器：`var(--surface)`；抬升层：`var(--surface-raised)`。
- 正文：`var(--text)`；辅助说明：`var(--muted)`；弱化信息：`var(--quiet)`。
- 分隔线：`var(--line)`；强调边界：`var(--line-strong)`。
- 品牌动作：`var(--accent)` / `var(--accent-surface)`；错误和警告：`var(--danger)` / `var(--warning)`。
- 普通页面使用 `page-shell`；卡片使用 `surface-card`。不要为每个页面重新定义容器宽度、圆角、按钮高度或字体系统。

现有基线：页面内容最大宽度约 `1100px`，普通页面横向留白为 `24–28px`，主要按钮最小高度为 `44px`。这些值是现有系统的基线，不应在单个页面里随意漂移；需要改变全局规则时，先修改 token 或共享组件并说明影响范围。

## 状态、权限和数据表达

每个会请求数据的区域至少考虑以下状态：

| 状态 | UI | 规则 |
| --- | --- | --- |
| 首次读取 | `读取中…` 或 loading 状态 | 不显示容易被误认为真实数据的空态 |
| 读取失败 | `UAlert` / `role="alert"` | 指出对象和最小下一步，例如“无法读取地图，请稍后重试。” |
| 成功但为空 | `UEmpty` | 只说当前状态，必要时提供一个明确动作 |
| 已开放 | 正常内容或可提交控件 | 不额外加“已开放”说明，除非它帮助区分内容 |
| 未开放/未来 | `未开放` | 不显示不可执行的提交或管理操作 |
| 操作中 | 组件 loading + 禁用重复操作 | 不用静态文字掩盖按钮状态 |
| 操作完成 | 短反馈或状态更新 | 不重复整条流程 |

权限边界：公开页面不渲染 QQ OpenID、私有截图、审核备注、内部风险信号或未批准草稿；玩家页只渲染当前玩家数据；管理页面通过现有服务端代理和会话访问管理 API。不要只在 CSS 中隐藏不该返回的数据。

## 响应式和可访问性

- 先保证 `320px` 宽度可用；现有移动断点主要为 `620px`、`760px` 和 `820px`，优先沿用已有断点。
- 网格在窄屏变为单列；管理表格允许横向滚动，但不能让整个页面横向溢出。
- 所有交互元素使用原生按钮、链接或 Nuxt UI 组件；图标按钮必须有可读的 `aria-label`。
- 标题按页面层级使用 `h1`、`h2`、`h3`；每个主要 section 有标题或 `aria-label`。
- 弹层、菜单和表单使用 Nuxt UI 的焦点管理；不要自行实现会话式弹层。
- 状态和错误同时提供文本，不能只用颜色、图标或位置传达。
- 保留 `prefers-reduced-transparency`、`prefers-contrast` 和 `prefers-reduced-motion` 的可用性；新增动画必须是必要的，并提供减少动效后的静态表现。

## Agent 工作流

修改 Portal UI 前：

1. 阅读本规范、`portal-copy-guidelines.md`，并查看相邻页面和共享组件。
2. 写下页面属于公共目录、玩家中心、提交流程还是管理后台，并确认数据/权限边界。
3. 搜索是否已有可以复用的领域组件或 Nuxt UI 组件；不要先创建新的 CSS 体系。
4. 保留读取中、失败、空态、处理中、成功和权限受限状态；如果某状态不适用，在变更说明中说明原因。
5. 检查移动布局、键盘操作、ARIA、私有字段和文案状态词。
6. 运行受影响的 Portal 测试和 `pnpm --dir apps/portal exec nuxt typecheck`；涉及构建或共享样式时再运行 Portal build。

## 完成检查

- [ ] 页面结构符合对应业务场景，标题和 section 层级清楚。
- [ ] 已复用现有领域组件和语义 token，没有新增一次性通用抽象。
- [ ] 加载、失败、空态、权限和操作中状态均有明确表现。
- [ ] 文案符合 Portal 文案规范，未将未来能力写成当前能力。
- [ ] 移动端、键盘、焦点、ARIA 和非颜色状态表达已检查。
- [ ] 未把私有证据、QQ 标识或内部字段暴露给不应看到的用户。
- [ ] 运行了受影响测试和 Portal typecheck，并记录无法运行的验证。
