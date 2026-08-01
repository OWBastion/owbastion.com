# Development Rules Index

本目录统一维护仓库的开发与工程规则，包括架构、数据安全、数据库变更、
测试和交付边界。它不维护产品能力状态，也不承载 Portal 的视觉与内容规范。

| 文档 | 类型 | 状态 | 治理 / 相关代码 |
| --- | --- | --- | --- |
| [architecture-overview.md](architecture-overview.md) | 架构概览 | authoritative | 仓库边界、数据 owner、服务职责与跨仓关系 |
| [data-and-security.md](data-and-security.md) | 数据与安全规则 | authoritative | API、Portal、D1、R2、认证和公开数据边界 |
| [database-migrations-and-seeds.md](database-migrations-and-seeds.md) | 数据库规则 | authoritative | `migrations/`、D1 fixture、目录导入与数据修复 |
| [testing-and-change-policy.md](testing-and-change-policy.md) | 测试与变更规则 | authoritative | workspace 测试、迁移检查、发布前验证和完成标准 |

## 使用规则

- 工程边界、数据 owner、权限与安全约束、迁移规则、测试层级和完成标准放在
  本目录。
- 产品行为和跨服务业务流程放在 [`../product-rules/`](../product-rules/)；
  UI 视觉、交互和内容设计放在 [`../design-rules/`](../design-rules/)。
- 架构决策记录放在 [`../adr/`](../adr/)，部署和生产验证手册放在
  [`../deployment/`](../deployment/)。
- 本目录不复制[功能状态矩阵](../product-rules/feature-status.md)；实现和
  验证等级以该矩阵为唯一来源。
