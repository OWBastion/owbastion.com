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

## Git 发布安全

Nuxt Studio 的 Git provider 使用 `OWBastion/owbastion.com` 的 `main` 分支，工作区 root 收窄为 `apps/portal`；Phase 1 的正常内容与媒体写入因此落在 Portal 内容边界内。GitHub fine-grained token 只允许这个仓库的 `Contents: Read and write`，不授予 Issues、Actions、Packages、Secrets、Administration 或 pull-request 权限。GitHub 仓库级 Contents 权限仍不是目录 ACL：若编辑管理员范围扩大到不应持有仓库邻近发布能力的人员，应将内容提取到专用仓库，而不是继续扩大 token 范围。

生产服务器在 Compose 使用的外部环境文件中保存 `STUDIO_GITHUB_TOKEN`，文件必须由服务器运维创建并限制为服务用户可读；轮换时先创建新的同权限 fine-grained token，再更新外部环境文件并重建 Portal 容器，确认发布后撤销旧 token。Compose 对缺少 token 的配置直接失败，token 不进入 `NUXT_PUBLIC_*` 配置、浏览器 bundle、文章内容或日志。

Studio Git 冲突、provider/API 错误和 CI/build 失败必须保留为编辑器或发布链失败状态，不得被页面描述为已发布。Git commit 成功只表示仓库内容已写入；现有 Portal image workflow 的检查、GHCR image publication、Compose deployment 和生产页面验证仍是独立状态。Portal 内容变更继续由 `.github/workflows/publish-portal.yml` 的 `apps/portal/**` path filter 进入既有验证与镜像发布链，部署由 `deploy-portal.yml` 使用对应的 immutable `sha-<commit>` tag 完成。
