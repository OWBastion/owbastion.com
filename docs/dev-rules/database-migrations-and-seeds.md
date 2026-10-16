# Database Migrations and Seeds

Map progress identity is stable map + explicit `gameplayRevisionId` (see
[catalog-and-challenges.md](../product-rules/catalog-and-challenges.md)).
Applied migrations mentioning `CLASSIC`, `map_variant`, or compatibility mappings
preserve old facts; they are not the current model.

## Migrations

`migrations/*.sql` are forward-only. A new migration contains only:

- schema changes (tables, columns, indexes, constraints);
- data repair required to keep existing business data valid.

It never contains catalog snapshots, historical title holders, local accounts, or
demo submissions. Applied files are never edited, renamed, or used to roll back;
fix bad data with a new corrective migration or a platform admin workflow.
Data-write exceptions are listed in `tools/migration-data-allowlist.txt`; do not
allowlist a file to bypass the seed/import boundary.

```bash
pnpm check:migrations
pnpm exec wrangler d1 migrations apply DB --local
```

Around any remote migration, run the read-only reconciliation (counts only, no
player data) before and after, save both outputs, and compare them:

```bash
pnpm db:reconcile:map-title-rules
pnpm exec wrangler d1 execute DB --remote --file tools/map-title-rule-reconciliation.sql --json
```

Retiring map-title compatibility records needs a new corrective migration, only
after every relevant Bastion release reads the rule projection, no legacy-challenge
submissions are in flight, reconciliation is archived, and Agents verification
passed for production and the build token.

Title-grant migrations are checked by `tools/test-title-grant-migration.sh`.

## Local seed

`pnpm db:seed:local` writes local D1 only: admin, test players, bindings, demo
submissions, and empty `map_metadata` rows per map (never overwriting filled
ones). It must be idempotent and never touch a remote database.

## Catalog import

Random events are not imported by CLI or seed; use the maintainer Portal's CSV
preview-and-confirm flow so every environment shares one authorization, audit,
and write path.

`pnpm db:import:catalog --snapshot <path>` is for legacy migration or explicit
recovery only, not Bastion synchronization. It writes local D1 by default;
production needs `--remote` and a prior `--dry-run` (check version, hash, rows).
It is not run by `wrangler d1 migrations apply`.

- Titles, maps, and rewards upsert; historical holders append only and are never
  auto-deleted or linked to accounts.
- Each import records `source_version` and SHA-256 in `catalog_imports`; a repeat
  skips only when both match, any other mismatch fails for manual reconciliation.
- `--refresh-presentation` updates only seed presentation fields (e.g. colors).
- Imports append or update; they never delete old records.

## Title icons

`icon` holds a default Lucide key. Maintainers may set a CDN URL or upload
PNG/JPG/WebP (max 512 KB) to R2 `public/achievement-icons/`; the catalog stores
only the public URL and object key. Uploaded icons are served only through the
achievement-icon API route, never exposing private evidence objects.
