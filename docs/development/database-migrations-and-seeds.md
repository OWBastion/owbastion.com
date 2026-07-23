# Database migrations and seeds

本仓库把 D1 数据变更分成三类，避免 schema 演进、测试 fixture 和 Bastion
目录发布互相混用。

## Migration

`migrations/*.sql` 是 forward-only 的数据库结构变更。新 migration 只应包含：

- 建表、加列、索引、约束和必要的结构调整；
- 为保留既有业务数据而必须执行的数据修复。

新 migration 不应包含大批量目录数据、历史称号持有人、本地测试账号或演示
提交。已有迁移中的数据写入是历史兼容的一部分，不重写、不重命名；当前
`0010_title_catalog.sql` 是已应用的历史目录快照迁移。

新增 migration 后运行：

```bash
pnpm check:migrations
pnpm exec wrangler d1 migrations apply DB --local
```

`tools/migration-data-allowlist.txt` 登记历史数据修复例外。新数据导入不得通过
把文件加入 allowlist 来绕过 seed/import 边界。

`pnpm db:generate-title-migration` 仅用于重现既有 `0010_title_catalog.sql` 这类
历史兼容文件，不用于发布新的目录 snapshot；新的 snapshot 必须使用 catalog
import。

## Local seed

```bash
pnpm db:seed:local
```

该命令只操作本地 D1，用于本地管理员、测试玩家、绑定和演示提交。数据必须
幂等，且不能连接远程数据库。

本地 seed 会根据当前 `maps` 目录为每张地图创建空的 `map_metadata` 记录，方便
在管理侧直接填写地图评级和特殊机制；不会覆盖已经填写的属性。

## Catalog import

Random-event data is intentionally not imported by a CLI or a local seed. Use
the maintainer Portal's event-management CSV preview and confirmation flow so
local and production environments share the same authorization, validation,
audit, and database-write path.

```bash
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json --dry-run
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json
```

Catalog import 面向已经完成 migrations 的数据库，使用 Bastion 提供的版本化
snapshot。称号、地图和奖励使用 upsert；历史持有人只追加，不自动删除，也不
自动关联平台账号。每个 snapshot 的 source version 和 SHA-256 hash 会写入
`catalog_imports`。只有 `source_version` 与 `snapshot_hash` 同时匹配时，重复导入
才会直接跳过；同版本不同 hash、同 hash 不同版本或记录不一致都会失败并要求
人工 reconciliation。

版本发布控制面使用独立的 Draft、Change Set、Candidate、Build Task 和 Release
表。新目录不会通过 migration 写入 Current；完成 `0034_release_plane.sql` 后，
首次建立正式指针必须显式执行：

```bash
pnpm db:release:bootstrap --snapshot snapshots/2026.07.15/title-catalog.json --dry-run
pnpm db:release:bootstrap --snapshot snapshots/2026.07.15/title-catalog.json
```

bootstrap 是幂等的本地/生产操作，发布流程只读取 Current Candidate；草稿、失败
构建和 Next 不会改变公开目录。

日常发布不需要手工录入 Draft Item、稳定 ID、操作类型或 JSON。管理员先在现有的
事件、地图、成就/称号管理页面维护一次工作目录；Portal 的“从工作目录创建 Draft”
会把工作表自动采集为不可变草稿。Draft 详情会按稳定 ID 与 Current 快照生成新增、
修改、移除 diff；确认后由 diff 自动生成 Change Set，再依次冻结 Candidate 和请求
Bastion 构建。发布页展示 ID 只是审计信息，不是管理员输入项。

称号目录的 `icon` 保存默认 Lucide 图标 key；维护者可在 Portal 成就管理页填写
CDN 图标 URL，或上传 PNG、JPG、WebP 自定义图标。上传文件写入 R2 的
`public/achievement-icons/` 前缀，目录只保存公开访问 URL 和对象 key；未上传时
继续使用 `icon` 默认图标。上传文件限制为 512 KB，上传图标公开读取只允许通过成就图标 API 路由访问，
CDN 图标由其 URL 直接提供；两者都不暴露私有证据对象。

默认只写本地 D1。生产导入必须显式使用：

```bash
pnpm db:import:catalog --snapshot <path> --remote
```

生产导入不属于普通部署 migration，也不会由 `wrangler d1 migrations apply`
自动执行。导入前应先运行 `--dry-run`，确认 snapshot 版本、hash 和行数。

## Ownership and rollback

Bastion owns released game facts and catalog snapshots. This repository owns the
imported platform catalog and historical migration records. Catalog import 只做
追加或更新，不回删旧记录；错误目录应通过新的修正 snapshot 或明确的数据
修复 migration 处理。已有 migration 永远不通过修改文件来回滚。
