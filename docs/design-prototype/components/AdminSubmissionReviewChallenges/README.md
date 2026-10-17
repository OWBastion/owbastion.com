# AdminSubmissionReviewChallenges

在提交审核中展示系统识别出的候选 Challenge，让管理员确认“截图可证明”的项，并可搜索添加其他项。外层是 `AdminSignalPanel`（标题“Challenge 判定”）。

**结构**
- 标题旁徽章（有 preview 时）：“满足条件”（`success`）；“需人工确认”“未匹配 Challenge”“等待判定”（`warning`）。
- 候选列表（“候选 Challenge”）：左侧粗体名称加范围标签（如“地图称号”“全局称号”），一行灰色说明“地图 · 难度 · 条件 · 依据：字段”；右侧候选状态徽章和复选框“截图可证明”（识别未匹配才显示）。已确认项标题用 `accent` 色。
- 手动添加：“添加其他 Challenge”（ghost）展开搜索框（占位“输入称号、地图或条件”，`aria-label` “搜索 Challenge”），最多 8 条结果，每条有“添加”按钮（`aria-label` “添加 {名称}”）。

**空文案**：“正在计算 Challenge…”；“没有匹配到 Challenge，可以搜索添加。已拥有或已被管理员撤销的称号不会出现在列表中。”；“暂无可判定的识别结果。”；搜索无果“没有匹配的 Challenge。”
**提示**：“N 项人工确认已不适用于当前识别结果，已取消。”（`role="status"`）

**状态**：`disabled` 时复选框、搜索框、添加按钮禁用；窄于 26rem 时候选项改纵向。
