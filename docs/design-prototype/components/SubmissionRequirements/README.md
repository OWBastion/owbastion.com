# SubmissionRequirements

静态列表，说明提交截图需要包含的内容。无 props、slots、emits；标题复用 PageSectionHeader（size="card"，title「截图要求」，heading-id `requirements-title`）。

**结构**
- `section` 以 `aria-labelledby` 指向标题；`dl` 列表带 1px --line 边框、`radius-control`、--surface-raised 底，行间上边线。
- 每行 dt（粗体，--text，nowrap）与 dd（--muted，右对齐）两端对齐：
  - 游戏 ID — 左下角显示的玩家名称
  - 地图名称 — 游戏右上角显示的地图名称
  - 游戏难度 — 游戏右上角显示的难度标识
  - 通关数据与标志 — 左上角通关数据与通关标志
  - 相关挑战数据 — 与挑战相关的具体数据
- 提示（caption，--quiet）：「优先使用游戏内截图，避免裁剪或二次压缩。」

**状态**：无动态状态。容器宽度小于 24rem 时每行改纵向、dd 左对齐；`contrast:more` 下边框用 --text。

**无障碍**：语义 `dl`/`dt`/`dd`；section `aria-labelledby`。
