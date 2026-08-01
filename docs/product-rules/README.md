# Product Rules Index

本目录统一维护平台的产品行为、用户可见状态、跨服务流程和产品边界。
这些文档描述当前产品契约，不替代源码中的实现；能力状态和验证等级只看
功能状态矩阵。

| 文档 | 类型 | 状态 | 治理 / 相关代码 |
| --- | --- | --- | --- |
| [feature-status.md](feature-status.md) | 能力状态矩阵 | authoritative | 能力实现、测试和生产验证状态；唯一状态来源 |
| [integrations-and-workflows.md](integrations-and-workflows.md) | 产品流程与跨仓契约 | authoritative | API、Portal、QQBot、OCRKit、Bastion 的业务流程和状态转换 |

## 使用规则

- 产品行为、用户体验、状态词汇、权限边界和跨服务流程放在本目录。
- 工程实现约束放在 [`../dev-rules/`](../dev-rules/)，UI 视觉、交互和内容
  设计放在 [`../design-rules/`](../design-rules/)。
- 当产品规则与实现状态需要同时更新时，先核对源码和测试，再只在
  `feature-status.md` 更新能力状态。
- 临时计划、审计和一次性验证记录放在 issue 或 PR 中，不写入当前规则索引。
