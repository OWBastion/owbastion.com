# Testing and Change Policy

## Current implementation status

The [feature status matrix](../product-rules/feature-status.md) is the single source of truth
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
OCR orchestration, maintainer review, and explicit or administrator-confirmed
migration of historical titles to player accounts. The matrix records these capabilities
as coded until complete integration evidence is available. Platform-internal
new title issuance is coded; feature switches and Bastion/GitHub orchestration
are not implemented.

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

The public achievement directory reads active global and map-scoped achievement
challenges and does not expose player data. Map-scoped challenges may declare a
`classic` map variant, which is carried through the catalog and OCR matching.
The public map directory reads active rows from the
D1 `maps` and `achievement_challenges` catalogs without exposing player data.
Player submission targets use the same catalogs, but the upload session accepts
only an enabled manual-submission `challengeId`;
map names and difficulty are resolved by the API. System-automatic title
challenges remain visible in the catalog but cannot receive screenshot uploads.
Catalog migrations are forward-only and
must preserve the introduced and retired game-version fields.

Administrator catalog management supports creating and editing title-backed
achievement challenges. A challenge uses a unique title key and may be global
or map-scoped. Map-scoped challenges use an optional map allowlist; an empty
allowlist means all active maps. Title challenges may change their conditions,
evidence rules, submission mode, map scope, and optional Portal display-category override. A `sunsetting` challenge requires a
planned Bastion version in `YY.MMDD.N` format; an administrator may also move a
challenge directly to `retired` without a planned version. Sunsetting challenges
remain visible and accept new uploads; retired challenges
block new uploads without altering in-flight or existing submissions. Map
challenge facts remain immutable; maintainers may update the separate
platform-owned map metadata layer containing the T0–T5 map rating and mechanism
tags. It never creates or issues a title: title
identity and game facts remain Bastion-owned, while historical entitlement
remains the separate administrator migration flow.

The platform owns the current title metadata and the public game facts needed
to generate the in-game title database. Bastion reads them through the Agents
API when building the game. `PIONEER`, `CONQUEROR`, and
`DOMINATOR` are map-scoped reward slots; all other titles are global. Historical
holder names remain historical source records and must not be converted into
platform accounts automatically. A maintainer may
create one auditable `player_title_grants` association for a historical holder
through the administrator migration UI or by explicitly authorizing selected
unclaimed records on a binding invitation. A clean approved binding executes
that authorization without a second decision; conflicts and retryable failures
remain visible to maintainers. A mistaken association is revoked with a
recorded reason rather than deleted. Only active grant records authorize a
player-facing title result.

## Testing layers

- Unit and contract tests for current API, Portal, and package behavior.
- D1 migration and repository tests when persistence changes.
- Title-grant tests for account isolation, map and global title scope, manual
  grant validation and idempotency, empty
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
- Portal browser regression (see below): representative viewport, focus, scroll,
  and dialog behavior without full-page visual snapshots.

Normal unit tests must not depend on live external services. Run pnpm check
(which executes pnpm run check:migrations, pnpm test, pnpm run typecheck, and
pnpm run build) for repository changes.

## Portal browser regression suite

The Portal e2e suite (`pnpm test:portal-e2e` / `apps/portal` `test:e2e`) uses
`@nuxt/test-utils/e2e` with Playwright Chromium (`browser: true`, `createPage`).
This reuses the existing Vitest e2e config and SSR home assertion; it does not
add a separate hosted browser service.

**Why this approach:** `@nuxt/test-utils` already powers Portal e2e SSR checks,
peer-depends on Playwright, and can launch a real browser against a built Nuxt
server. That is the smallest maintainable path relative to introducing a second
runner (standalone Playwright Test or Cypress) while still asserting real
viewport geometry, focus, and dialog behavior that happy-dom unit tests cannot
prove.

**Commands**

```bash
# One-time (or CI) browser binary
pnpm --filter @owbastion/portal run test:e2e:install

# Full Portal e2e (SSR + browser regression); builds the Nuxt app once per run
pnpm test:portal-e2e
```

**Fixtures:** when `NUXT_PORTAL_E2E_FIXTURES=1` (set by the e2e harness),
`apps/portal/server/middleware/e2e-fixtures.ts` serves deterministic public-safe
JSON and a 1×1 PNG for `/api/portal/**` and `/api/admin/**`. Scenarios (auth
role, intentional failures) are selected via the `owbastion-e2e-scenario`
cookie from `apps/portal/tests/e2e/helpers/`. Tests never call production APIs,
R2, or real QQ identities. The middleware is inert unless that env flag is set.

**Viewports covered:** 320px, 375px, 430px, drawer/modal boundary (767/768),
tablet (834), desktop (1280).

**Representative surfaces:** home/mobile nav, public maps directory, player
center (`/me`), submission new/detail, admin maps table +
`AdminResponsiveDialog`.

**Assertions prefer:** roles/labels, focus restoration, Escape, document-level
horizontal overflow, mobile scroll ownership, evidence `height:auto` / non-cover
object-fit, mutation error visibility in the open overlay, and
`prefers-reduced-motion` match. Full-page screenshots and Nuxt UI internal class
names are not the primary contract.

**Environment limits (documented, not release-blocked):**

- `prefers-reduced-transparency` and `prefers-contrast: more` are enforced in CSS
  and covered by stylesheet/presence checks where the browser cannot fully emulate
  the media feature; behavioral emulation is asserted for `prefers-reduced-motion`.
- Pixel-perfect decoration, every directory page, and live backend business rules
  remain out of scope (unit/component tests cover those layers).

Keep the browser suite bounded for CI; extend only when a remediated interaction
cannot be proven with component tests.

## Definition of done

A platform change is complete when the affected source of truth, authorization,
public/private boundary, idempotency behavior, migrations, tests, deployment
expectations, and documentation are updated and verified.
