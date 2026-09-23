# Testing and Change Policy

Current capability implementation and verification status is maintained in the
[feature status matrix](../product-rules/feature-status.md).

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

Before generating invitations locally, add a non-production
`BINDING_INVITE_CODE_ENCRYPTION_KEY` to the ignored `.dev.vars` file. It must
remain unchanged while local invitations need to be copied again.

The local login does not represent QQ authentication and never enables the
local branch in production. Real invitation confirmation through `/验证`, QQ
webhook, and QQ gateway tests still require a test QQ application and real QQ
credentials.

Administrator player and review queues use server-side pagination. Their list
responses include `page`, `pageSize`, `total`, and `hasMore`; the submissions
endpoint accepts one or more comma-separated status values in `status`.

Migrations are forward-only. Add a corrective migration instead of rewriting
an applied migration, and verify it against a restored local database.

Before applying the invitation-binding migration, run this read-only D1 query
and resolve each result through the administrator binding UI; do not let the
partial unique index choose which QQ identity is retained:

~~~sql
SELECT player_account_id, COUNT(*) AS binding_count
FROM bindings
GROUP BY player_account_id
HAVING COUNT(*) > 1;
~~~

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

## Testing layers

- Unit and contract tests for current API, Portal, and package behavior.
- D1 migration and repository tests when persistence changes.
- Title-grant tests for account isolation, map and global title scope, manual
  grant validation and idempotency, manual batch Cartesian expansion and cell
  cap, duplicate normalization, mixed created/already-owned outcomes, empty
  results, duplicate historical-holder associations, explicit invitation
  authorization, automatic clean-binding migration, conflict/retry handling,
  revocation, administrator authorization, idempotency, and audit records.
- Achievement-management tests for maintainer authorization, three-state
  validation, idempotency replay and conflicts, audit records, immediate
  title-rule updates, planned retirement versions, reopening, and the
  preservation of in-flight submissions after retirement. Scheduled title
  challenges must also be tested before, during, and after their time window.
- Integration tests with fake R2, OCR, GitHub, and QQ clients as those
  integrations are introduced.
- Queue redelivery, review, grant, and end-to-end tests for the implemented
  submission approval flow, including rollback and idempotent replay.
- Review integration tests must cover both event and map targets through the
  D1-backed player, public, and maintainer projections, including update,
  withdrawal, comment moderation, whole-review invalidation/restore, aggregate
  changes, privacy-negative responses, and idempotent replay without duplicate
  rows or audit effects.
- Security tests for authorization, SSRF, file validation, and private-data
  exposure.
- Portal built-server SSR smoke (`pnpm test:portal-e2e:built` after
  `pnpm build:portal`): home HTML from the existing Nuxt production artifact
  via `@nuxt/test-utils/e2e` with `browser: false`.
- Portal UI interaction and responsive behavior: prefer Vitest + happy-dom
  component/page tests. Real browser checks (viewport overflow, Tab/Escape/focus,
  Modal/Drawer, reduced preferences) are manual or agent computer-use against
  local fixtures — not a code-level Playwright suite.

Normal unit tests must not depend on live external services. Run `pnpm check`
(which executes migration checks, the granular unit/UI suites, typecheck, the
workspace build, and the built Portal SSR smoke) for repository changes.

## Portal SSR smoke

`pnpm test:portal-e2e:built` / `apps/portal` `test:e2e` assumes that
`apps/portal/.output` already exists, starts that production server, and asserts
the home page SSR HTML. It does not launch a browser and does not depend on
Playwright. `pnpm test:portal-e2e` remains a local convenience wrapper that
builds the Portal once and then runs the built-artifact smoke. CI keeps those
two commands in the same job so the smoke validates the artifact that was
built for that run.

```bash
pnpm test:portal-e2e
```

Do not reintroduce Playwright or a full browser regression runner in-repo
unless product requirements change; use component tests and computer-use for
viewport/focus/dialog checks.

## Definition of done

A platform change is complete when the affected source of truth, authorization,
public/private boundary, idempotency behavior, migrations, tests, deployment
expectations, and documentation are updated and verified.
