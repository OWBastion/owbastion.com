# Testing and Change Policy

## Current implementation status

The [feature status matrix](feature-status.md) is the single source of truth
for capability status and verification evidence.

The repository contains a runnable pnpm TypeScript workspace. The Hono
Cloudflare Worker API implements health, authenticated v1 QQ binding and
submission creation, public submission status, QQ browser-login attempts and
verification, portal session lookup/logout, and a maintainer-protected
group-access route. D1 migrations back the current business state.

When EVIDENCE_BUCKET is configured, submission creation persists validated QQ
image sources to private R2 and advances successful submissions to ocr_pending.
The Nuxt Portal implements the public landing page, QQ login, player center,
submission-status view, and platform-session-protected `/admin` player/group
and achievement-catalog management.

The first Portal map-challenge slice includes database-backed map and achievement
catalogs, a public read-only achievement directory, upload validation, Queue-backed
OCR orchestration, maintainer review, and the administrator-confirmed migration
of historical titles to player accounts. The matrix records these capabilities
as coded until complete integration evidence is available. New title issuance,
feature switches, and Bastion/GitHub orchestration are not implemented.

Apply local migrations with:

~~~bash
pnpm exec wrangler d1 migrations apply DB --local
~~~

Production deployments bootstrap the administrator automatically from the
GitHub production-environment `ADMIN_BATTLETAG` secret after applying remote
migrations. For manual recovery, update the account directly in D1 with a
reviewed BattleTag:

~~~bash
pnpm exec wrangler d1 execute owbastion-codes-prod --remote --command "UPDATE player_accounts SET is_admin = 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE normalized_player_name = 'yourname' AND player_id = '1234';"
~~~

The account must log in again after promotion so the Portal refreshes its session
state. Remove the flag with `is_admin = 0` when access should be revoked.

For Portal development, use the complete local environment:

~~~bash
pnpm dev:local
~~~

This applies local migrations, seeds deterministic player/submission fixtures,
starts the Worker at `http://localhost:8787`, and starts the Portal at
`http://localhost:3000`. The login page exposes local development accounts only
when `LOCAL_DEV_AUTH=true`; the selected account receives a real D1-backed
Portal session. The local administrator account can use `/admin`, while the
ordinary local player cannot.

`pnpm dev:portal` and `pnpm dev:local` both use the Nuxt hot-reload development
server. Portal source changes are picked up without rebuilding or restarting the
production output server.

The local login does not represent QQ authentication and never enables the
local branch in production. Real `/绑定`, `/验证`, `/成就挑战`, QQ webhook, and
QQ gateway tests still require a test QQ application and real QQ credentials.

Migrations are forward-only. Add a corrective migration instead of rewriting
an applied migration, and verify it against a restored local database.

## Before implementation

For a non-trivial change, identify:

- product area and owner of each fact;
- affected API, database, storage, queue, and external contracts;
- authorization and data classification;
- idempotency, retry, and state-transition behavior;
- rollback or reconciliation behavior.

Keep domain logic independent from HTTP and storage adapters. Add migrations,
tests, and runbooks with operational changes. Avoid broad framework rewrites
without an architecture decision record.

The public achievement directory reads active global achievement challenges and
does not expose player data. Player submission targets are read from the D1 `maps` and
`achievement_challenges` catalogs. The Portal may browse maps and challenges,
but the upload session accepts only an enabled manual-submission `challengeId`;
map names and difficulty are resolved by the API. System-automatic title
challenges remain visible in the catalog but cannot receive screenshot uploads.
Catalog migrations are forward-only and
must preserve the introduced and retired game-version fields.

Administrator catalog management is limited to existing challenges. Title
challenges may change their conditions, evidence rules, submission mode, and
optional Portal display-category override. Map challenges may only be enabled,
retired with a Bastion release version, or reopened; their imported map,
difficulty, names, and introduced version remain immutable. Retiring a
challenge blocks new uploads but does not alter in-flight or existing
submissions. It never creates or issues a title: title identity and game facts
remain Bastion-owned, while historical entitlement remains the separate
administrator migration flow.

The title catalog is imported from a versioned Bastion snapshot. `PIONEER`,
`CONQUEROR`, and `DOMINATOR` are map-scoped reward slots; all other imported
titles are global. Historical Bastion holder names remain source snapshots and
must not be converted into platform accounts automatically. A maintainer may
create one auditable `player_title_grants` association for a historical holder
through the administrator migration UI; a mistaken association is revoked with
a recorded reason rather than deleted. Only active grant records authorize a
player-facing title result.

## Testing layers

- Unit and contract tests for current API, Portal, and package behavior.
- D1 migration and repository tests when persistence changes.
- Title-grant tests for account isolation, map and global title scope, empty
  results, duplicate historical-holder associations, revocation, administrator
  authorization, idempotency, and audit records.
- Achievement-management tests for maintainer authorization, type-specific
  validation, idempotency replay and conflicts, audit records, immediate
  title-rule updates, map retirement version requirements, reopening, and the
  preservation of in-flight submissions after retirement.
- Integration tests with fake R2, OCR, GitHub, and QQ clients as those
  integrations are introduced.
- Queue redelivery, review, grant, and end-to-end tests when those workflows
  are implemented.
- Security tests for authorization, SSRF, file validation, and private-data
  exposure.

Normal unit tests must not depend on live external services. Run pnpm test,
pnpm run typecheck, and pnpm run build for repository changes.

## Definition of done

A platform change is complete when the affected source of truth, authorization,
public/private boundary, idempotency behavior, migrations, tests, deployment
expectations, and documentation are updated and verified.
