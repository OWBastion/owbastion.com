# OWBastion Web Platform

`OWBastion/owbastion.codes` 是 Bastion 生态的 Web Platform 与 operational control plane。

本仓库用于承载面向玩家和开发者的公共能力，以及审核、业务数据和跨仓库变更编排。当前代码包含 Cloudflare Worker API、私有 R2 证据保存、QQ 网页登录、公共 Portal，以及首条地图挑战的 Queue、OCR 和审核链路；称号发放和跨仓库变更编排仍按分阶段计划建设。各项能力的唯一状态见[功能状态矩阵](docs/development/feature-status.md)。

## 生态定位

| 项目 | 主要职责 |
| --- | --- |
| [`OWBastion/Bastion`](https://github.com/OWBastion/Bastion) | 游戏源代码、内容定义、构建、发布和公开快照 |
| `OWBastion/owbastion.codes` | 平台业务数据、Web 应用、审核和变更编排 |
| [`OWBastion/qqbot`](https://github.com/OWBastion/qqbot) | QQ 渠道接入和用户通知 |
| [`OWBastion/ocrkit`](https://github.com/OWBastion/ocrkit) | 截图识别和模型生命周期 |

已发布的游戏内容以 Bastion 仓库和版本化快照为准。平台不会绕过验证、CI、人工审核或发布流程直接改变已发布内容。

## 文档导航

这里保留项目定位和公开边界；架构与工程细节请按需阅读：

- [文档索引](docs/README.md)：按主题选择架构、集成、安全和开发文档。
- [架构概览](docs/architecture/overview.md)：已实现目录、系统边界和数据所有权。
- [外部集成与业务流程](docs/architecture/integrations-and-workflows.md)：QQBot、登录、证据保存和后续状态流转。
- [数据与安全边界](docs/architecture/data-and-security.md)：数据分类、授权和公开项目中的安全约束。
- [开发、测试与变更](docs/development/testing-and-change-policy.md)：测试分层、幂等、迁移和发布要求。
- [功能状态矩阵](docs/development/feature-status.md)：按能力链路维护的唯一实现状态和验证证据。
- [HKG Portal 部署](docs/deployment/portal-hkg.md)：公共 Portal 的 Docker Compose 与服务器侧 Cloudflare Tunnel 边界。
- [AI agent 路由](AGENTS.md)：AI agent 执行任务前必须读取的英文指引。

## 公开项目约定

- 功能状态统一维护在[功能状态矩阵](docs/development/feature-status.md)；其他文档只解释边界、契约和操作要求。
- 不在仓库中提交密钥、签名 URL、私有用户标识、截图或其他运行数据。
- 涉及平台业务、外部集成或安全边界的改动，应同步更新对应的详细文档。
- 详细工程约束和 AI agent 的工作路由以 [`AGENTS.md`](AGENTS.md) 为准。

## 当前状态

仓库提供 HKG Portal 的 Docker Compose 配置和 Worker API 的 GitHub Actions 部署工作流；运行中的生产状态需单独验证。D1、R2 证据保存、QQ 登录、玩家中心、Queue、OCR 和审核的首条地图挑战链路已在代码中实现；称号发放和发布编排仍按分阶段计划推进。详见[功能状态矩阵](docs/development/feature-status.md)。
