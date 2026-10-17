设置页卡片，用开关控制是否在排行榜公开个人主页。数据写入 `PUT /v1/me/profile/visibility`（带 Idempotency-Key）。

**使用**：传入 `publicProfile`，保存后触发 `updated(value)`。

**结构**
- 左侧：标题「公开主页」、说明「在排行榜公开显示你的昵称与称号。关闭后名次与分数照常保留，但昵称、头像、称号和地图明细不再公开，你会显示为匿名玩家。」（`quiet`）。
- 右侧：开关，`aria-label="公开主页"`。

**状态**
- 保存中：开关禁用，忽略重复触发。
- 切换时乐观更新；失败回滚到 `publicProfile`，在说明下显示「保存失败，请稍后重试。」（或服务端描述），`role="alert"`，色 `danger`。
- `props` 变化时同步草稿值。

**令牌**
- `text`、`quiet`、`danger`、`space-1`、`space-4`。
