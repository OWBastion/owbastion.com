分区标题行：标题在左，计数和操作在右。

**使用**：传入 `title`，可选 `count`、`eyebrow`、`headingLevel`（`h2` 或 `h3`）、`headingId`，操作放 `actions` 插槽。

**规则**
- 标题用 `type-headline`；计数用 `type-caption` 和 `quiet`。
- 容器宽度小于 24rem 时，标题和右侧竖向堆叠。
- 页面不加 eyebrow 或 kicker，除非文案规则允许。

**合并建议稿（2026-10）**：原 `SubmissionSectionHeading`（标题加可选说明，`h2`）并入 `PageSectionHeader`：新增可选 `description` 与 `size="card"`（卡片级小标题，用 `card-title` 字号），删除前者。说明文字仍受“说明文字”规则约束，只在格式、约束、后果、风险处使用。
