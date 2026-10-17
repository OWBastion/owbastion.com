# EditorialDetail

开发日志 / 版本更新详情页框架：返回链接、分享、状态、文章、页脚分享与上下篇、右侧目录。

**属性**：`kind`、`entry`、`status`、`failed`、`canonical`、`shareTitle`、`toc`、`minutes?`、`older`、`newer`。

**结构**
- 单列最大 46rem 居中；目录条数 ≥3 且有 entry 时多出目录栏（容器 ≥62rem 时在右栏 12rem、sticky）。
- 顶栏：返回链接（blog「返回开发日志」→ /blog；changelog「返回版本更新」→ /changelog，最小高度 44px，--muted）+ EditorialShare。
- 内容：EditorialArticle；页脚（上边线）直接放 EditorialShare（无分享口号） + EditorialNeighbors。

**状态**
- 读取中：「读取中…」（`role="status"`，最小高 260px，surface-card）
- 失败：错误提示，标题「无法读取开发日志」/「无法读取版本更新」，描述「内容暂时不可用，请稍后重试。」
- 不存在：中性提示，标题「找不到这篇开发日志」/「找不到这条版本更新」，无描述，附描边按钮返回列表

**无障碍**：状态用 `role="status"` / `role="alert"`；返回链接图标 `aria-hidden`；目录与上下篇各有 aria-label。
