# Design Rules Index

本目录统一维护 Portal 的 UI 视觉、交互、可访问性和内容设计规则。规则正文
以 [`DESIGN.md`](DESIGN.md) 为权威来源。

| 文档 | 类型 | 状态 | 治理 / 相关代码 |
| --- | --- | --- | --- |
| [DESIGN.md](DESIGN.md) | 设计规范 | authoritative | 视觉 token、布局、交互、状态语言与无障碍基线 |
| [portal-ui-guidelines.md](portal-ui-guidelines.md) | Portal UI 规则 | authoritative | `apps/portal` 页面结构、组件、状态和响应式行为 |
| [portal-copy-guidelines.md](portal-copy-guidelines.md) | Portal 文案规则 | authoritative | `apps/portal` 文案、状态词汇、空状态与错误 |
| [terminology.md](terminology.md) | Portal 术语表 | authoritative | Portal 称号、槽位、展示方式、状态词、事件与绑定术语的中文唯一来源 |

## 使用规则

当文档存在冲突时，`DESIGN.md` 对设计原则和跨页面规则具有最高优先级。其他
文档可以补充 Portal 的具体实现，但必须复用相同的 token、状态词汇、无障碍
基线和权限边界。产品行为和流程规则放在 [`../product-rules/`](../product-rules/)，
工程规则放在 [`../dev-rules/`](../dev-rules/)。
