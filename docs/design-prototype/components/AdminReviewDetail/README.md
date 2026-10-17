# AdminReviewDetail

后台详情抽屉里展示单条玩家评价（随机事件或地图）、提交者和审计记录，并提供审核操作。

**结构**（`content-stack`，三个 section 加操作行）
- “评价内容”：目标（名称加“随机事件 / 地图 · targetId”）、评分（“★”按分数重复加 “N / 5”）、评价状态（有效 `success` / 已撤回 / 已失效 `warning`）、评论状态（公开 `success` / 已隐藏 `warning`）、提交时间、公开匿名（是 / 否）；评论用 `blockquote`（左 3px `accent` 边、`accent-surface` 底）。
- “提交玩家”：战网 ID，写作“名字#数字 ID”（ID 用 `quiet` 色），不显示账号记录等内部标识。
- “审计记录”：操作、“时间 · actorType：actorId”，可选“理由：…”
- 操作行 `role="group"`（“评价操作”），右对齐。

**状态**
- 无评论：“未填写评论。”；无审计：“暂无审计记录。”
- 按钮：评论公开时“隐藏评论”（`warning`），已隐藏时“恢复评论”；状态非失效时“使评价失效”（`error`），否则“恢复评价”（`success`）。
- 窄于 23.99rem：事实网格单列，按钮铺满且最小高度 `control-lg`。

**无障碍**：section 用 `aria-labelledby` 对应 `h2`；评分 `dd` 有 `aria-label` “评分”。
