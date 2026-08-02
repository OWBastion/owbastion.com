# Design Rules Index

本目录统一维护 Portal 的 UI 视觉、交互、可访问性和内容设计规则。
[`DESIGN.md`](DESIGN.md) 是按职责路由的主题索引；各主题文档和既有 Portal
细则在各自范围内具有约束力。

| 文档 | 类型 | 状态 | 治理 / 相关代码 |
| --- | --- | --- | --- |
| [DESIGN.md](DESIGN.md) | 设计主题索引 | authoritative | 设计规则按职责路由与冲突边界 |
| [visual-foundation.md](visual-foundation.md) | 视觉基础 | authoritative | 语义 token、颜色状态、字体、材料和深度 |
| [interaction-accessibility.md](interaction-accessibility.md) | 交互与无障碍 | authoritative | 交互反馈、动效、响应式布局和无障碍 |
| [page-archetypes.md](page-archetypes.md) | 页面范式 | authoritative | 公开目录、玩家中心、提交流程和管理工作区 |
| [css-ownership.md](css-ownership.md) | CSS 归属 | authoritative | 全局样式、共享组件和页面 scoped CSS 边界 |
| [content-and-state.md](content-and-state.md) | 内容与状态语言 | authoritative | 内容层级、状态表达和权限展示边界 |
| [portal-ui-guidelines.md](portal-ui-guidelines.md) | Portal UI 规则 | authoritative | `apps/portal` 页面结构、组件、状态和响应式行为 |
| [portal-copy-guidelines.md](portal-copy-guidelines.md) | Portal 文案规则 | authoritative | `apps/portal` 文案、状态词汇、空状态与错误 |
| [terminology.md](terminology.md) | Portal 术语表 | authoritative | Portal 称号、槽位、展示方式、状态词、事件与绑定术语的中文唯一来源 |

## 使用规则

当文档存在冲突时，先按主题索引判断文档归属；主题文档对其负责范围具有最高
优先级。Portal 细则负责页面和组件实现细节，必须复用相同的 token、状态词汇、
无障碍基线和权限边界，不得覆盖主题文档的跨页面规则。
产品行为和流程规则放在 [`../product-rules/`](../product-rules/)，工程规则放在
[`../dev-rules/`](../dev-rules/)。
