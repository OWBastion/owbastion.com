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

## Catalog import

```bash
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json --dry-run
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json
```

Catalog import 面向已经完成 migrations 的数据库，使用 Bastion 提供的版本化
snapshot。称号、地图和奖励使用 upsert；历史持有人只追加，不自动删除，也不
自动关联平台账号。每个 snapshot 的 source version 和 SHA-256 hash 会写入
`catalog_imports`，重复导入会直接跳过。

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
