# OWBastion Web Platform

`OWBastion/owbastion.codes` 是 Bastion 生态的 Web Platform 与 operational control plane。

本仓库用于承载面向玩家和开发者的公共能力，以及审核、业务数据和跨仓库变更编排。当前仓库仍处于目标架构和文档阶段，README 不代表这些功能已经实现或可直接部署。

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
- [架构概览](docs/architecture/overview.md)：系统边界、目标目录和数据所有权。
- [外部集成与业务流程](docs/architecture/integrations-and-workflows.md)：QQBot、OCRKit、Bastion 及状态流转。
- [数据与安全边界](docs/architecture/data-and-security.md)：数据分类、授权和公开项目中的安全约束。
- [开发、测试与变更](docs/development/testing-and-change-policy.md)：测试分层、幂等、迁移和发布要求。
- [AI agent 路由](AGENTS.md)：AI agent 执行任务前必须读取的英文指引。

## 公开项目约定

- 文档描述目标架构时会明确标注状态，不把设计当作已实现功能。
- 不在仓库中提交密钥、签名 URL、私有用户标识、截图或其他运行数据。
- 涉及平台业务、外部集成或安全边界的改动，应同步更新对应的详细文档。
- 详细工程约束和 AI agent 的工作路由以 [`AGENTS.md`](AGENTS.md) 为准。

## 当前状态

仓库的首要工作是建立可审查的架构、契约和开发基础。功能实现应遵循文档中的边界，并在代码、迁移、测试和运行手册准备完整后逐步推进。
