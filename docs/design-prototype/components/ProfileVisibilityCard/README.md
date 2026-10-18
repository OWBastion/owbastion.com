个人主页顶部玩家卡右上角的二级控件：点设置图标按钮在 Popover 中打开，不占页面段落。用开关控制是否在排行榜公开个人主页。数据写入 `PUT /v1/me/profile/visibility`（带 Idempotency-Key）。

**使用**：传入 `publicProfile`、`hideBattleTag`，保存后触发 `updated(response)`，两个值一起写入。默认插槽放公开 ID 行。

**结构**
- 左侧：标题「公开主页」、说明「在排行榜公开显示你的昵称与称号。关闭后名次与分数照常保留，但昵称、头像、称号和地图明细不再公开，你会显示为匿名玩家。」（`quiet`）。
- 右侧：开关，`aria-label="公开主页"`。
- 公开时下方一行：标题「隐藏我的 BattleTag」、说明（其他玩家看到公开 ID，未设置则为匿名玩家；称号与名次照常公开；自己始终可见）和开关，`aria-label="隐藏 BattleTag"`；公开主页关闭时不显示。

**状态**
- 保存中：开关禁用，忽略重复触发。
- 切换时乐观更新；失败回滚到 `publicProfile`，在说明下显示「保存失败，请稍后重试。」（或服务端描述），`role="alert"`，色 `danger`。
- `props` 变化时同步草稿值。

**令牌**
- `text`、`quiet`、`danger`、`space-1`、`space-4`。
