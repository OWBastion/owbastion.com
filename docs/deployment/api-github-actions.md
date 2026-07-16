# API deployment through GitHub Actions

The platform API is deployed as the `owbastion-codes-api` Cloudflare Worker.
HKG hosts run QQBot only; they call the Worker over HTTPS. The implemented API
also serves the Portal's QQ login, session, player, and public submission-status
requests.

## Required Cloudflare resources

Create these resources in the target Cloudflare account before enabling the
deployment job:

- D1 database named `owbastion-codes-prod`;
- R2 bucket named `owbastion-codes-evidence`;
- the real D1 `database_id` written to `wrangler.toml`.

Do not reuse the QQBot channel-state D1 or OCRKit's model/evidence bucket.
For the coded OCRKit orchestration, set the Worker variable
`OCRKIT_EVIDENCE_BUCKET` to `owbastion-codes-evidence`. The Worker passes this
bucket explicitly with every object-mode OCR request; it does not use OCRKit's
default bucket.

## GitHub configuration

Configure these repository or production-environment secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Worker, D1 migration, and R2 access |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account |
| `QQBOT_API_TOKEN` | Service credential accepted by the API from QQBot |
| `ADMIN_BATTLETAG` | Full BattleTag, such as `TestPlayer#1234`, that receives administrator access during deployment |

The workflow never prints secret values. `QQBOT_API_TOKEN` is sent to the
Worker as a secret and must be the same value configured on the HKG QQBot.
`ADMIN_BATTLETAG` must already exist in `player_accounts`; the deployment
validates the full BattleTag and idempotently enables its `is_admin` flag after
migrations. The Portal container does not receive this value.

## Workflow behavior

The workflow runs for pull requests and pushes to `main` only when API inputs
change: `apps/api`, shared packages, D1 migrations, `wrangler.toml`, shared
pnpm/TypeScript/Vitest build inputs, or the API workflow itself. Pull requests
run install, tests, typecheck, and build only. A qualifying push to `main` or
a manual dispatch runs those checks, applies forward-only remote D1 migrations,
validates and bootstraps `ADMIN_BATTLETAG`, updates the Worker secret, deploys
the Worker, and publishes the API URL.

The workflow refuses to deploy while the D1 ID is still the repository's
placeholder. It does not reset, delete, or roll back D1 data.

The Worker is deployed to the Git-managed Custom Domain
`https://api.owbastion.com`. The workflow does not automatically verify the
public hostname after deployment; production reachability is checked through
separate operational monitoring.

## HKG QQBot configuration

Add these values to the existing QQBot runtime environment:

```env
PLATFORM_BASE_URL=https://api.owbastion.com
PLATFORM_SERVICE_TOKEN=<same-value-as-QQBOT_API_TOKEN>
PLATFORM_REQUEST_TIMEOUT_MS=10000
```

Restart only the QQBot container. Then test in a dedicated QQ group:

```text
/绑定 TestPlayer#1234
/成就挑战 Test Map + image attachment
```

The binding test must be sent from the dedicated test group. QQ member OpenIDs
are group-scoped, so the same QQ user in another group is a separate platform
binding by design.

The Portal login flow additionally requires an enabled group-access record and
an existing binding for the same group-scoped QQ identity. The current API
contains the maintainer-protected group-access route, but a maintainer
authentication flow must be available before it can be configured through that
route.

The returned submission ID can be checked with:

```text
GET https://api.owbastion.com/v1/submissions/<submission-id>
```

With the R2 binding available, a valid image submission reaches `ocr_pending`;
an unavailable or invalid source image reaches `resubmission_required`.
OCRKit orchestration, review, and title grants are coded platform capabilities
but are not production-verified by this deployment workflow. Bastion changes
remain planned. See the [feature status matrix](../development/feature-status.md).

## Rollback

Redeploy the previous successful commit through the same workflow. Keep D1
records and migrations intact. If the API must be isolated temporarily, stop
the QQBot integration by removing its platform endpoint or restore the last
known-good platform endpoint; do not delete evidence or business records.
