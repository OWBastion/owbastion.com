# OWBastion Design System

这是 `apps/portal` 设计规则的主题索引。各主题文档按职责维护当前约束；
`README.md` 负责目录治理和文档状态，既有 Portal 细则负责页面实现、文案和术语。

## 设计主题

| 文档 | 负责内容 |
| --- | --- |
| [visual-foundation.md](visual-foundation.md) | 语义 token、颜色状态、字体、材料和深度 |
| [interaction-accessibility.md](interaction-accessibility.md) | 交互反馈、动效、响应式布局和无障碍 |
| [page-archetypes.md](page-archetypes.md) | 公开目录、玩家中心、提交流程和管理工作区 |
| [css-ownership.md](css-ownership.md) | 全局样式、共享组件、页面 scoped CSS 和抽取边界 |
| [content-and-state.md](content-and-state.md) | 内容层级、状态表达、权限边界和公开/私有展示规则 |
| [portal-ui-guidelines.md](portal-ui-guidelines.md) | Portal 页面骨架、组件选择、表单和实现工作流 |
| [portal-copy-guidelines.md](portal-copy-guidelines.md) | 中文文案、状态词、空状态和错误文案 |
| [terminology.md](terminology.md) | 称号、挑战、提交、事件和 QQ 绑定术语 |

## 使用顺序

修改 Portal UI 时，先读本索引，再读取与改动职责对应的主题文档；如果涉及
页面实现、文案或术语，再分别读取对应的 Portal 细则。主题文档在各自范围内
具有约束力，不得通过页面级 CSS 或局部文案引入相互冲突的系统。

根目录的 [`DESIGN.md`](../../DESIGN.md) 是仓库入口索引，不承载设计正文。
