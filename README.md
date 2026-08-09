# OWBastion Web Platform

[![Deploy API](https://github.com/OWBastion/owbastion.com/actions/workflows/deploy-api.yml/badge.svg)](https://github.com/OWBastion/owbastion.com/actions/workflows/deploy-api.yml)
[![Publish Portal image](https://github.com/OWBastion/owbastion.com/actions/workflows/publish-portal.yml/badge.svg)](https://github.com/OWBastion/owbastion.com/actions/workflows/publish-portal.yml)
[![Deploy Portal](https://github.com/OWBastion/owbastion.com/actions/workflows/deploy-portal.yml/badge.svg)](https://github.com/OWBastion/owbastion.com/actions/workflows/deploy-portal.yml)

OWBastion 平台运行在 Cloudflare Workers 上，为 Bastion 提供 Web Portal、HTTP API、业务数据存储和外部服务集成。本仓库维护当前事件、地图、称号和挑战元数据，以及玩家和管理流程使用的平台状态。

## 技术栈

- **API**：Hono、Cloudflare Workers、Wrangler
- **Portal**：Nuxt、Vue、Nuxt UI
- **数据层**：Cloudflare D1、Drizzle、R2
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

Portal 通过服务端 API 访问平台数据。业务规则位于 domain 和 database 包，Worker 与 Portal 负责协议适配。D1 保存业务状态，R2 保存私有提交证据，Queue 驱动 OCR 处理，公共目录在 HTTP 边界使用短期缓存。QQBot 负责 QQ 绑定、验证、群策略和通知，不创建 Portal 截图提交。OCRKit 只负责识别，Bastion 在构建时通过 Agents API 读取平台元数据。

Portal 提供公开目录、QQ 浏览器登录、玩家中心、截图提交与状态查询，以及受平台会话保护的管理面。博客和版本更新使用 Nuxt Content；管理员从 `/admin` 进入 `/studio` 内容编辑器，编辑权限由平台 Admin session 控制，Git 凭据留在 Portal 服务端。称号授予、审核、地图称号规则和随机事件目录由平台维护。实现和验证状态见[功能状态矩阵](docs/product-rules/feature-status.md)。

## 文档

从[文档索引](docs/README.md)开始。Portal Studio 的认证、Git 代理和发布边界见[部署说明](docs/deployment/portal-studio.md)。

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

本地开发需要 Studio 时，先将仅用于本地的 `STUDIO_GITHUB_TOKEN` 写入被 `.gitignore` 忽略的 `.dev.vars`。`pnpm dev:local` 只将它传给 Portal 服务端；token 不会进入 `NUXT_PUBLIC_*` 配置或浏览器代码。缺少该变量时，Studio 保持不可用。

也可以分别启动服务：

```bash
pnpm dev:api:local
pnpm dev:portal:local
```

## 常用命令

```bash
pnpm test          # 单元、契约、Portal UI 和 E2E 测试
pnpm typecheck     # 全 workspace 类型检查
pnpm build         # 构建 API 与 Portal
pnpm check         # check:migrations + test + typecheck + build

pnpm check:migrations
pnpm db:seed:local
pnpm db:reconcile:map-title-rules
pnpm db:import:catalog --snapshot <path> --dry-run
```

数据库 migrations 只能前向追加；本地 fixture 使用 `db:seed:local`。`db:import:catalog` 仅用于明确的历史目录迁移或恢复，默认写入本地 D1；写入远程数据库必须显式添加 `--remote`，它不是平台与 Bastion 的持续同步机制。
