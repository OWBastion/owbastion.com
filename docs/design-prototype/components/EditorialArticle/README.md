# EditorialArticle

渲染开发日志或版本更新文章：头部元信息、可选目录、MDC 正文。

**属性**：`entry`（title、description、path、body?、tags?、publishedAt?、releasedAt?、version?）、`kind`（`blog` / `changelog`）、`toc?`、`minutes?`。

**头部**
- blog：「开发日志」（--accent）、日期、「· 约 {n} 分钟读完」；h1 标题；描述（1.125rem，--muted）；标签列表（aria-label「标签」）。
- changelog：版本药丸（--accent 描边、--accent-surface 底；前置 sr-only「版本 」）、日期 + ChangelogRelativeDay；h1 用 headline 字阶。
- 目录条数 ≥3 时，显示可折叠的「本文目录」（原生 details/summary，容器 ≥62rem 时隐藏）。

**正文**：行高 1.85（changelog 1.75）；h2 上边线；h3 左侧 3px --accent 条；链接 --info 下划线；引用块左 3px --accent 条；代码 --surface-raised；表格可横向滚动。

**状态**：无日期不显示 time；无 body 渲染空 root；加载与失败由 EditorialDetail 负责。

**无障碍**：h1 唯一；`<time datetime>`；正文标题 `scroll-margin-top` 避开粘性头部；`prefers-contrast:more` 调整边框。
