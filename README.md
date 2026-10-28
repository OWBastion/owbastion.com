# OWBastion Web Platform

[![Deploy API](https://github.com/OWBastion/owbastion.com/actions/workflows/deploy-api.yml/badge.svg)](https://github.com/OWBastion/owbastion.com/actions/workflows/deploy-api.yml)
[![Validate Portal](https://github.com/OWBastion/owbastion.com/actions/workflows/validate-portal.yml/badge.svg)](https://github.com/OWBastion/owbastion.com/actions/workflows/validate-portal.yml)

OWBastion 平台运行在 Cloudflare Workers 上，为 Bastion 提供 Web Portal、HTTP API、业务数据存储和外部服务集成。本仓库维护当前事件、地图、称号和挑战元数据，以及玩家和管理流程使用的平台状态。

## 技术栈

- **API**：Hono、Cloudflare Workers、Wrangler
- **Portal**：Nuxt、Vue、Nuxt UI
- **数据层**：Cloudflare D1、KV、R2、Queues、Drizzle
- **工程化**：pnpm workspace、TypeScript、Vitest

## 目录结构

```text
apps/
  api/       Hono Worker API
  portal/    Nuxt Portal 与服务端代理
packages/
  auth/      身份与会话相关能力
  contracts/ API 与跨包契约
  database/  Drizzle schema、仓储和持久化逻辑
  domain/    领域模型与业务规则
migrations/  D1 forward-only migrations
tools/       本地开发、数据导入和部署辅助脚本
docs/        架构、开发、部署和 API 文档
```

Portal 通过服务端 API 访问平台数据。业务规则位于 domain 和 database 包，Worker 与 Portal 负责协议适配。D1 保存业务状态，KV 为目录类读取提供带版本的读穿缓存。R2 分别保存私有提交证据和公开素材。Queue 驱动 OCR 处理，并向 QQBot 投递群权限变更。QQBot 负责 QQ 绑定、验证、群策略和通知，不创建 Portal 截图提交。OCRKit 只负责识别，Bastion 在构建时通过 Agents API 读取平台元数据。

Portal 提供公开目录、QQ 浏览器登录、玩家中心、截图提交与状态查询，以及受平台会话保护的管理面。博客和版本更新是仓库中的 Git Markdown，在构建期解析、校验并预渲染为静态页面；编辑通过正常的仓库工作流完成。称号、挑战、地图、随机事件和提交审核数据由平台维护。

## 文档

从[文档索引](docs/README.md)开始。

## 开始开发

环境要求：Node.js `>=26`、pnpm `11.11.0`。

```bash
pnpm install
pnpm dev:local
```

`pnpm dev:local` 会应用本地 D1 migrations、生成确定性的本地测试数据，并启动：

- Worker API：<http://localhost:8787>
- Portal：<http://localhost:3000>

`pnpm dev:local` 会自动启用本地登录 fixture；该模式只用于本地调试，不代表生产环境的 QQ 身份认证，也不会在生产环境启用。

本地生成可重新复制的绑定邀请时，将仅用于本地的
`BINDING_INVITE_CODE_ENCRYPTION_KEY` 写入被 `.gitignore` 忽略的 `.dev.vars`。
活动邀请仍需要重新复制期间，不要更换此密钥。

`wrangler.local.toml` 已配置 Turnstile 恒通过的公开测试密钥；改用
`pnpm dev:api` 时，把同样的测试值 `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`
写入 `.dev.vars`，否则未认证写端点按 fail-closed 拒绝。

也可以分别启动服务：

```bash
pnpm dev:api:local
pnpm dev:portal:local
```

## 常用命令

```bash
pnpm test          # 单元、契约、Portal UI 和 E2E 测试
pnpm test:unit     # 单元与契约测试
pnpm test:portal-ui
pnpm build:portal && pnpm test:portal-e2e:built  # 复用已有 Portal 产物执行 SSR smoke
pnpm typecheck     # 全 workspace 类型检查
pnpm build         # 构建 API 与 Portal
pnpm lint:styles   # Stylelint
pnpm check         # check:migrations + lint:styles + unit/UI + typecheck + build + built SSR smoke

pnpm check:migrations
pnpm db:seed:local
pnpm db:reconcile:map-title-rules
pnpm db:import:catalog --snapshot <path> --dry-run
```

数据库 migrations 只能前向追加；本地 fixture 使用 `db:seed:local`。`db:import:catalog` 仅用于明确的历史目录迁移或恢复，默认写入本地 D1；写入远程数据库必须显式添加 `--remote`，它不是平台与 Bastion 的持续同步机制。
