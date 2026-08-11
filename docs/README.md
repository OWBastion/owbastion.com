# Docs 规范索引

本索引用于发现 `docs/` 下的产品规则、设计规则、开发规则、架构决策、
部署运维和 API 契约文档。

状态含义：`authoritative` 表示文档对相关实现、变更或运维具有约束力；
`reference` 表示背景记录或决策说明，正文中的约束仍然有效，但不作为当前
能力状态清单；`artifact` 表示由 API 契约或工具维护的交付物。能力的实现和
验证等级只维护在[功能状态矩阵](product-rules/feature-status.md)中。

| 文档 | 类型 | 状态 | 治理 / 相关代码 | owner |
| --- | --- | --- | --- | --- |
| [README.md](README.md) | 总索引 | — | `docs/` 文档目录 | — |
| [product-rules/README.md](product-rules/README.md) | 产品规则索引 | authoritative | 产品行为、体验、流程与边界 | 平台 |
| [feature-status.md](product-rules/feature-status.md) | 能力状态矩阵 | authoritative | 能力实现、测试和生产验证状态 | 平台 |
| [integrations-and-workflows.md](product-rules/integrations-and-workflows.md) | 产品流程与跨仓契约 | authoritative | API、Portal、QQBot、OCRKit、Bastion 的业务流程 | 平台 |
| [design-rules/README.md](design-rules/README.md) | 设计规则索引 | authoritative | UI 视觉、交互、可访问性与内容规则 | Portal |
| [design-rules/DESIGN.md](design-rules/DESIGN.md) | 设计主题索引 | authoritative | 设计规则按职责路由与冲突边界 | Portal |
| [design-rules/visual-foundation.md](design-rules/visual-foundation.md) | 视觉基础 | authoritative | 语义 token、颜色状态、字体、材料和深度 | Portal |
| [design-rules/interaction-accessibility.md](design-rules/interaction-accessibility.md) | 交互与无障碍 | authoritative | 交互反馈、动效、响应式布局和无障碍 | Portal |
| [design-rules/page-archetypes.md](design-rules/page-archetypes.md) | 页面范式 | authoritative | 公开目录、玩家中心、提交流程和管理工作区 | Portal |
| [design-rules/css-ownership.md](design-rules/css-ownership.md) | CSS 归属 | authoritative | 全局样式、共享组件和页面 scoped CSS 边界 | Portal |
| [design-rules/content-and-state.md](design-rules/content-and-state.md) | 内容与状态语言 | authoritative | 内容层级、状态表达和权限展示边界 | Portal |
| [portal-ui-guidelines.md](design-rules/portal-ui-guidelines.md) | Portal UI 规则 | authoritative | `apps/portal` 页面结构、组件、状态和响应式行为 | Portal |
| [portal-copy-guidelines.md](design-rules/portal-copy-guidelines.md) | Portal 文案规则 | authoritative | `apps/portal` 文案、状态词汇、空状态与错误 | Portal |
| [dev-rules/README.md](dev-rules/README.md) | 开发规则索引 | authoritative | 工程、数据、安全、测试与变更边界 | 平台 |
| [architecture-overview.md](dev-rules/architecture-overview.md) | 架构概览 | authoritative | 仓库边界、数据 owner、服务职责与跨仓关系 | 全仓 |
| [data-and-security.md](dev-rules/data-and-security.md) | 数据与安全规则 | authoritative | API、Portal、D1、R2、认证和公开数据边界 | API / Portal |
| [database-migrations-and-seeds.md](dev-rules/database-migrations-and-seeds.md) | 数据库规则 | authoritative | `migrations/`、D1 fixture、目录导入与数据修复 | 数据层 |
| [testing-and-change-policy.md](dev-rules/testing-and-change-policy.md) | 测试与变更规则 | authoritative | workspace 测试、迁移检查、发布前验证和完成标准 | 全仓 |
| [0001-platform-technology-stack.md](adr/0001-platform-technology-stack.md) | 架构决策 | reference | 技术栈、仓库组织、服务边界和跨仓 owner | 平台 |
| [0002-submission-status-d1-reads.md](adr/0002-submission-status-d1-reads.md) | 架构决策 | reference | 提交状态读取、D1 新鲜度与缓存边界 | API / 数据层 |
| [openapi.json](api/openapi.json) | API 契约 | artifact | Worker API 路由、请求响应和部署契约 | API |
| [api-github-actions.md](deployment/api-github-actions.md) | API 部署手册 | authoritative | GitHub Actions、Worker、Queue、QQBot 集成部署 | API / 运维 |
| [api-observability.md](deployment/api-observability.md) | API 运维手册 | authoritative | 生产 revision、缓存、Queue OCR 和请求追踪验证 | API / 运维 |
| [portal-hkg.md](deployment/portal-hkg.md) | Portal 部署手册 | authoritative | HKG Docker Compose、镜像发布和 Tunnel 边界 | Portal / 运维 |
| [audit-portal-uiux-2026-08.md](design-rules/audit-portal-uiux-2026-08.md) | UI/UX 审计快照 | reference | 2026-08 Portal 静态审计：发现清单与修复批次 | Portal |

## 如何判断文档归属

- 产品行为、用户可见状态、流程和跨服务契约放在 `product-rules/`。
- 工程约束、数据安全、迁移、测试和变更流程放在 `dev-rules/`。
- UI 视觉、交互、可访问性和内容设计放在 `design-rules/`；其中
  [`DESIGN.md`](design-rules/DESIGN.md) 是设计主题索引，具体规则由索引列出的
  对应文档负责，目录索引是 [`design-rules/README.md`](design-rules/README.md)。
- 架构决策放在 `adr/`，部署和生产验证放在 `deployment/`，API 机器可读
  契约放在 `api/`。
- 任务计划、临时审计、执行清单和一次性验证记录放在 issue 或 PR 中，
  不作为当前规则文档提交。

能力状态只更新[功能状态矩阵](product-rules/feature-status.md)；其他文档
可以描述边界、契约和验证方法，但不得复制另一份能力状态清单。

从项目介绍开始请阅读仓库根目录的 [`README.md`](../README.md)。
