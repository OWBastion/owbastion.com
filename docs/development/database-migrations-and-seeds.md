# Database migrations and seeds

本仓库把 D1 数据变更分成三类，避免 schema 演进、测试 fixture 和平台目录
维护互相混用。

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

`0049_migrate_standard_map_title_rules.sql` 是标准地图称号的必要数据修复：它从
既有 `title_catalog` 与 `map_title_rewards` 建立 `PIONEER`、`CONQUEROR`、
`DOMINATOR` 规则，只为实际存在的旧挑战建立 compatibility 记录，并把没有旧奖励
关系的有效地图写为禁用例外。它不会新增或猜测 `CLASSIC` 关系，也不会修改旧挑战、
奖励、历史持有人、玩家权益或提交记录。

在任何远程 migration 前后，先执行只读 reconciliation（结果只有计数，不含玩家
姓名或标识）：

```bash
pnpm db:reconcile:map-title-rules
pnpm exec wrangler d1 execute DB --remote --file tools/map-title-rule-reconciliation.sql --json
```

保存两次输出并比较标准奖励、规则、例外、兼容记录、历史持有人和有效权益的计数。
`0050_migrate_classic_map_title.sql` 使用 Bastion 同步契约中的 `CLASSIC` 定义和
三种经典地图变体建立一个 map-scoped title challenge。`classic_map_scope` 必须分别
列出 `map.circuit_royal`、`map.paris`、`map.hanamura`，且每项计数为 1；其他 CLASSIC
关系仍需通过管理员称号界面建立，不得由 migration 猜测。

兼容记录的清理前提是：所有相关发布的 Bastion 均已读取规则投影；没有仍在处理的
旧挑战提交；迁移前后 reconciliation 已归档；并且针对生产和构建令牌的 Agents
验证均已完成。届时另建 corrective migration 退役旧记录，不能删除或改写 `0049`。

`tools/migration-data-allowlist.txt` 登记历史数据修复例外。新数据导入不得通过
把文件加入 allowlist 来绕过 seed/import 边界。

`0040_generic_title_grants.sql` 将既有 `player_title_grants` 原地重建为通用
权益记录：保留 Grant ID、玩家、标题、地图、状态、授予时间和撤销信息，并将
历史来源写为 `source_type = historical`、`source_id = historical_title_grants.id`。
`0041_challenge_reward_mapping.sql` 为地图 Challenge 写入显式的
`reward_title_key`；运行时审批只读取该字段，不根据名称、难度或 ID 推断奖励。
两项迁移均可在空库和已有业务数据的数据库上执行，验证脚本为
`tools/test-title-grant-migration.sh`。

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

## Legacy catalog import

Random-event data is intentionally not imported by a CLI or a local seed. Use
the maintainer Portal's event-management CSV preview and confirmation flow so
local and production environments share the same authorization, validation,
audit, and database-write path.

```bash
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json --dry-run
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json
```

若已存在的 catalog snapshot 需要补填展示颜色等新 seed 字段，使用显式刷新：

```bash
pnpm db:import:catalog --snapshot snapshots/2026.07.15/title-catalog.json --refresh-presentation --remote
```

该操作只更新 catalog seed 数据，不修改 migration 记录或表结构。

该导入工具仅用于历史数据迁移或显式恢复，不是平台与 Bastion 的持续同步机制。
当前事件、地图、称号和挑战元数据由平台维护，Bastion 在构建时通过 Agents API
读取。若执行历史导入，称号、地图和奖励使用 upsert；历史持有人只追加，不自动
删除，也不自动关联平台账号。每个导入文件的 source version 和 SHA-256 hash 会写入
`catalog_imports`。只有 `source_version` 与 `snapshot_hash` 同时匹配时，重复导入
才会直接跳过；同版本不同 hash、同 hash 不同版本或记录不一致都会失败并要求
人工 reconciliation。

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

This repository owns current platform metadata and historical migration records.
Bastion owns game implementation, builds, and release artifacts, and reads the
platform metadata through the Agents API. Legacy catalog import 只做追加或更新，
不回删旧记录；错误数据应通过平台管理流程或明确的数据修复 migration 处理。
已有 migration 永远不通过修改文件来回滚。
