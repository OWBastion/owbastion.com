# API deployment through GitHub Actions

The platform API is deployed as the `owbastion-codes-api` Cloudflare Worker.
HKG hosts run QQBot only; they call the Worker over HTTPS.

## Required Cloudflare resources

Create these resources in the target Cloudflare account before enabling the
deployment job:

- D1 database named `owbastion-codes-prod`;
- R2 bucket named `owbastion-codes-evidence`;
- the real D1 `database_id` written to `wrangler.toml`.

Do not reuse the QQBot channel-state D1 or OCRKit's model/evidence bucket.

## GitHub configuration

Configure these repository or production-environment secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Worker, D1 migration, and R2 access |
| `CLOUDFLARE_ACCOUNT_ID` | Target Cloudflare account |
| `QQBOT_API_TOKEN` | Service credential accepted by the API from QQBot |

The workflow never prints secret values. `QQBOT_API_TOKEN` is sent to the
Worker as a secret and must be the same value configured on the HKG QQBot.

## Workflow behavior

The workflow runs for pull requests and pushes to `main` only when API inputs
change: `apps/api`, shared packages, D1 migrations, `wrangler.toml`, shared
pnpm/TypeScript/Vitest build inputs, or the API workflow itself. Pull requests
run install, tests, typecheck, and build only. A qualifying push to `main` or
a manual dispatch runs those checks, applies forward-only remote D1 migrations,
updates the Worker secret, deploys the Worker, and publishes the API URL.

The workflow refuses to deploy while the D1 ID is still the repository's
placeholder. It does not reset, delete, or roll back D1 data.

The Worker is deployed to the Git-managed Custom Domain
`https://api.owbastion.codes`. The workflow does not automatically verify the
public hostname after deployment; production reachability is checked through
separate operational monitoring.

## HKG QQBot configuration

Add these values to the existing QQBot runtime environment:

```env
PLATFORM_BASE_URL=https://api.owbastion.codes
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

The returned submission ID can be checked with:

```text
GET https://api.owbastion.codes/v1/submissions/<submission-id>
```

The expected first milestone status is `ocr_pending`. OCRKit, review, title
grants, and Bastion changes are not part of this deployment.

## Rollback

Redeploy the previous successful commit through the same workflow. Keep D1
records and migrations intact. If the API must be isolated temporarily, stop
the QQBot integration by removing its platform endpoint or restore the last
known-good platform endpoint; do not delete evidence or business records.
