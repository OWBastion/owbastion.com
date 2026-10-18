个人主页顶部玩家卡右上角的二级控件：点设置图标按钮在 Popover 中打开，不占页面段落。用开关控制是否在排行榜公开个人主页。数据写入 `PUT /v1/me/profile/visibility`（带 Idempotency-Key）。

**使用**：传入 `publicProfile`、`hideBattleTag`，保存后触发 `updated(response)`，两个值一起写入。默认插槽放公开 ID 行。

**结构**
- 一行「公开主页」+ 开关，`aria-label="公开主页"`。
- 公开时下一行「隐藏 BattleTag」+ 开关，`aria-label="隐藏 BattleTag"`；公开主页关闭时不显示。
- 无说明文字；规则与后果不在卡片内解释。

**状态**
- 保存中：开关禁用，忽略重复触发。
- 切换时乐观更新；失败回滚到 `publicProfile`，在开关下显示「保存失败，请稍后重试。」（或服务端描述），`role="alert"`，色 `danger`。
- `props` 变化时同步草稿值。

**令牌**
- `text`、`danger`、`space-3`、`space-4`。
