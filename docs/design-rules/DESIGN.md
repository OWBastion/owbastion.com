# OWBastion Design System

这是 `apps/portal` 设计规则的**主题索引与宪章**。各主题文档按职责维护当前
约束；`README.md` 负责目录治理和文档状态；Portal 细则负责页面实现、文案和术语。

**规范优先于代码现状。** 仓库中可能存在与规范不一致的历史实现（固定 `px`
布局、页面级 fixed 操作条、局部颜色等）。新功能与专门重构以本目录文档为准，
不得以复制旧页面为默认标准。大范围对齐规范应单独开重构任务，避免与无关
功能 PR 混做。

## Design pillars

| 支柱 | 文档 | 负责内容 |
| --- | --- | --- |
| 视觉语言 | [visual-foundation.md](visual-foundation.md) | 语义 token、颜色状态、字体、材料、深度 |
| 布局与间距 | [layout-and-spacing.md](layout-and-spacing.md) | 单位制、容器、栅格、sticky/fixed、溢出、断点 |
| 组件与模式 | [components-and-patterns.md](components-and-patterns.md) | 选型顺序、Nuxt UI / Tailwind 边界、控件模式 |
| 交互与无障碍 | [interaction-accessibility.md](interaction-accessibility.md) | 响应式行为、管理列表、触控、ARIA、系统偏好入口 |
| 动效与反馈 | [motion-and-feedback.md](motion-and-feedback.md) | 按压、路由过渡、允许/禁止的 motion、反馈类型 |
| 页面范式 | [page-archetypes.md](page-archetypes.md) | 公开目录、玩家中心、提交流程、管理工作区 |
| CSS 归属 | [css-ownership.md](css-ownership.md) | main.css / 共享组件 / scoped 边界与单位落地 |
| 内容与状态 | [content-and-state.md](content-and-state.md) | 内容层级、状态表达、权限与公开/私有边界 |
| Portal 实现 | [portal-ui-guidelines.md](portal-ui-guidelines.md) | 页面骨架、表单、Admin 细则、agent 工作流 |
| 文案 | [portal-copy-guidelines.md](portal-copy-guidelines.md) | 中文文案、状态词、空状态和错误 |
| 版本更新 | [changelog-guidelines.md](changelog-guidelines.md) | `apps/portal/content/changelog` 结构、排版与文案规范 |
| 术语 | [terminology.md](terminology.md) | 称号、挑战、提交、事件和 QQ 绑定术语 |

## Cross-cutting principles

1. **Purpose.** Make content, state, and next action obvious; omit decoration
   that does not aid operation.
2. **One system.** Tokens, type, materials, elevation, press, and containers
   live in `main.css` / Nuxt UI config / shared domain components — not in
   page-local forks.
3. **Adaptive layout.** Structural spacing and columns use `rem` / `fr` /
   `minmax` / `clamp`; see layout doc. Do not fix decision UIs to the viewport
   with growing `position: fixed` docks.
4. **Familiar controls.** Prefer domain components, then Nuxt UI, then local
   composition. Do not introduce a second component library or dashboard shell
   without an explicit migration.
5. **Accessible state.** Color, icon, or position alone never encode meaning.
   Honor reduced motion, reduced transparency, and increased contrast.
6. **Permission-aware UI.** Public / player / admin surfaces only render what
   the API allows; CSS is not an access-control layer.
7. **Motion is optional.** Feedback is mandatory; spectacle is not.

## Agent routing

| 改动类型 | 必读 |
| --- | --- |
| 颜色、字体、材料、elevation | visual-foundation |
| 栅格、间距单位、sticky/fixed、溢出 | layout-and-spacing |
| 新组件、Nuxt UI、Tailwind 用法 | components-and-patterns、portal-ui-guidelines |
| 按压、动效、toast/加载反馈 | motion-and-feedback、interaction-accessibility |
| 整页结构 / 管理台表格 | page-archetypes、portal-ui-guidelines |
| 文案与术语 | portal-copy-guidelines、terminology |
| 版本更新 / Changelog | changelog-guidelines、terminology |
| 抽样式 / 改 main.css | css-ownership |

修改 Portal UI 时：先读本索引 → 对应支柱文档 → 需要时再读 Portal 细则与邻接
实现。主题文档在各自范围内具有约束力，不得通过页面级 CSS 或局部文案引入
冲突系统。

根目录的 [`DESIGN.md`](../../DESIGN.md) 是仓库入口索引，不承载设计正文。

## Refactor contract

后续单独重构（视觉、布局、组件、motion）时：

1. 以本目录文档为验收标准，而不是以「和旧页看起来一样」为标准。
2. 一次重构只对齐一个支柱或一个明确表面，保持 diff 可审。
3. 发现规范缺口时先补文档再铺开改代码，避免 agents 各自发明规则。
4. 行为与文案变更仍受 `docs/product-rules/` 与术语表约束。
