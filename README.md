# OWBastion Web Platform

`owbastion.codes` 是一个基于 Cloudflare Workers 的 pnpm TypeScript workspace，提供 Bastion 生态的 Web Portal、HTTP API、业务数据存储和外部服务集成。

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

Portal 通过服务端 API 访问平台数据；业务规则位于 domain 和 database 包，Worker 与 Portal 负责协议适配。D1 保存业务状态，R2 用于私有证据文件，外部 QQ、OCR 和发布系统通过明确的集成边界接入。

## 开始开发

环境要求：Node.js `>=26`、pnpm `11.11.0`。

```bash
pnpm install
pnpm dev:local
```

`pnpm dev:local` 会应用本地 D1 migrations、生成确定性的本地测试数据，并启动：

- Worker API：<http://localhost:8787>
- Portal：<http://localhost:3000>

仅在本地调试登录流程时设置 `LOCAL_DEV_AUTH=true`；该模式不代表生产环境的 QQ 身份认证。

也可以分别启动服务：

```bash
pnpm dev:api:local
pnpm dev:portal:local
```

## 常用命令

```bash
pnpm test          # 单元、契约和 Portal UI 测试
pnpm typecheck     # 全 workspace 类型检查
pnpm build         # 构建 API 与 Portal
pnpm check         # test + typecheck + build

pnpm check:migrations
pnpm db:seed:local
pnpm db:import:catalog --snapshot <path>
```

数据库 migrations 只能前向追加；本地 fixture 使用 `db:seed:local`，版本化 Bastion catalog 使用显式的 `db:import:catalog` 导入。

## 文档

- [文档索引](docs/README.md)
- [架构概览](docs/architecture/overview.md)
- [外部集成与业务流程](docs/architecture/integrations-and-workflows.md)
- [数据与安全](docs/architecture/data-and-security.md)
- [测试与变更策略](docs/development/testing-and-change-policy.md)
- [数据库 migrations 与本地数据](docs/development/database-migrations-and-seeds.md)
- [功能状态矩阵](docs/development/feature-status.md)
- [API OpenAPI 文档](docs/api/openapi.json)
- [API 部署](docs/deployment/api-github-actions.md)
- [Portal 部署](docs/deployment/portal-hkg.md)

涉及 API、Portal、数据模型、认证、外部集成或部署边界的改动，应同时更新对应技术文档和测试。
