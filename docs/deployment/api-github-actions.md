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
- KV namespace for derived catalog caches, bound as `CACHE`;
- Queue `owbastion-qq-policy` and dead-letter queue
  `owbastion-qq-policy-dlq` for QQ group-policy events;
- the real D1 `database_id` written to `wrangler.toml`.

Create the KV namespace with Wrangler, then replace the `CACHE` placeholder ID
in `wrangler.toml` with the returned namespace ID. Namespace IDs are account
resources and are not secrets, but the repository must not contain a guessed
production ID:

~~~bash
pnpm exec wrangler kv namespace create owbastion-codes-cache --binding CACHE
~~~

The local configuration uses a separate local KV namespace ID. Wrangler local
development stores KV data locally by default, so local cache state does not
affect production.

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
| `CLOUDFLARE_ZONE_ID` | Zone where API Shield Endpoint Management is configured |
| `QQBOT_API_TOKEN` | Service credential accepted by the API from QQBot |
| `QQBOT_POLICY_WEBHOOK_URL` | QQBot's internal group-policy callback URL |
| `QQBOT_POLICY_WEBHOOK_SECRET` | HMAC secret for the group-policy callback |
| `OCRKIT_API_TOKEN` | Bearer credential shared only with OCRKit |
| `BINDING_INVITE_CODE_ENCRYPTION_KEY` | AES-GCM key material for re-copyable invitation codes; generate with `openssl rand -base64 32` and retain it while invitations remain active |
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
run install, tests, typecheck, and build only. Typecheck runs `tsc --noEmit`
for the workspace, while the API build runs Wrangler's local Worker bundling
and validation with `wrangler deploy --dry-run`; it does not upload or deploy
the Worker. A qualifying push to `main` or a manual dispatch runs those checks,
applies forward-only remote D1 migrations, validates and bootstraps
`ADMIN_BATTLETAG`, updates the Worker secret, deploys the Worker, publishes the
API URL, and submits the OpenAPI endpoint inventory to Cloudflare API Shield
Endpoint Management. The API token must also have `Account API Gateway` or
`Domain API Gateway` write permission. Endpoint deployment is additive and
idempotent; it does not delete operations already managed in Cloudflare.

The source inventory is [`docs/api/openapi.json`](../api/openapi.json). To run
the same deployment locally:

~~~bash
CLOUDFLARE_ZONE_ID=<zone-id> CLOUDFLARE_API_TOKEN=<api-token> pnpm deploy:api-endpoints
~~~

The workflow refuses to deploy while the D1 ID is still the repository's
placeholder or while the `CACHE` KV ID is still its placeholder. It does not
reset, delete, or roll back D1 or KV data.

Set `OCRKIT_BASE_URL` in `wrangler.toml` to the public OCRKit hostname. The Worker sends
`OCRKIT_API_TOKEN` only to that service as a Bearer credential; browser and QQBot clients do
not call OCRKit directly.

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
PLATFORM_POLICY_WEBHOOK_SECRET=<same-value-as-QQBOT_POLICY_WEBHOOK_SECRET>
```

Restart only the QQBot container. Then test in a dedicated QQ group:

```text
/绑定 TestPlayer#1234
/成就挑战 Test Map + image attachment
```

The binding test must be sent from the dedicated test group. For one QQ robot,
the same QQ member OpenID is reused across groups and maps to one platform
binding.

The Portal login flow additionally requires an enabled group-access record and
an existing binding for the same QQ member OpenID. The current API contains the
maintainer-protected group-access route, but a maintainer authentication flow
must be available before it can be configured through that route.

The QQBot reverse proxy must forward
`/internal/v1/qq/group-policy-events` to the existing QQBot service. This path
is not a public API: the Worker signs every request with
`QQBOT_POLICY_WEBHOOK_SECRET`; QQBot rejects stale or invalid signatures. The
Worker's dedicated Queue and five-minute outbox repair trigger retry delivery,
so QQBot does not poll `GET /v1/admin/qq/groups` after startup.

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
