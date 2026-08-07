# Portal Nuxt Studio

Portal 的 Nuxt Studio 使用现有平台 session 做 custom-auth bridge。`player.isAdmin` 是唯一编辑授权来源；Studio session 只保存编辑器需要的显示名和固定的 provider 标识，不保存 QQ 标识、平台 session token 或新的管理员记录。

## 路由与边界

- 管理员从 `/admin/content` 进入，入口使用当前 Portal origin。
- `/_studio` 是 Studio 的受保护入口；服务端会先验证平台 session，再建立 Studio session 并回到 `/admin/content`。
- `/__nuxt_studio/*` 的 session、元数据、媒体和写请求都经过 Portal server middleware。匿名、非管理员、过期或已撤销的平台 session 不会得到编辑能力；失效 session 会清除 Studio cookie。
- Portal 退出登录不会扩大 cookie domain；后续 Studio 请求会因平台 session 缺失而被拒绝。重新获得权限后必须重新经过 bridge。

## 外部部署前置条件

Nuxt Studio 1.7 的 `setStudioUserSession` 需要 Git provider access token 才能创建可写 Studio session。`STUDIO_GITHUB_TOKEN` 由独立的发布安全工作负责在部署环境注入；它不属于本 issue 的 Git 凭据配置，也不得写入仓库、`.dev.vars` 提交内容或浏览器代码。

Portal 本地开发也关闭 Studio 的 filesystem dev mode。没有部署所需的外部 token 时，管理员入口会返回“服务端配置”错误，不会降级为匿名编辑或本地第二套授权。
