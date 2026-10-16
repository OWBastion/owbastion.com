# API Deployment

The API is the `owbastion-codes-api` Cloudflare Worker at `https://api.owbastion.com`,
deployed by GitHub Actions. QQBot runs on HKG and calls the Worker over HTTPS.

## Cloudflare resources

Create before enabling the deploy job:

- D1 `owbastion-codes-prod`, and isolated `owbastion-codes-staging` (ID in
  `wrangler.staging-d1.toml`; schema validation only, never player data). Put the
  real prod `database_id` in `wrangler.toml`; the workflow refuses the placeholder.
- R2 `owbastion-codes-evidence` with custom domain `evidence.owbastion.codes`,
  Cache enabled, bucket listing and `r2.dev` disabled. Set Worker var
  `EVIDENCE_PUBLIC_ORIGIN=https://evidence.owbastion.codes`.
- Queues `owbastion-qq-policy` (+`-dlq`) and `owbastion-ocr` (+`-dlq`). Exhausted
  OCR jobs are recorded failed; a 5-minute scheduled repair moves jobs pending
  45 minutes to `resubmission_required`.
- Do not reuse QQBot's channel D1 or OCRKit's model bucket. OCRKit's read-only R2
  key and `OCRKIT_R2_ALLOWED_BUCKETS` cover only the model bucket.

## Settings

- `OCRKIT_BASE_URL` in `wrangler.toml` is the public OCRKit host; `OCRKIT_API_TOKEN`
  goes only there. Browsers and QQBot never call OCRKit.
- `OCR_AUTO_REVIEW_SAMPLE_RATE` (0 to 1, default 0) deterministically samples
  automatic approvals for maintainer spot checks.
- Mastery writes are off by default. Enable only by setting both
  `MASTERY_MIN_GAME_VERSION` (`major.minor.patch`) and
  `MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS` (comma list) once Bastion and OCRKit have
  released compatible versions; absent, invalid, or partial values fail closed.
  Roll back by clearing either and redeploying; never delete ledger rows or evidence.

## Secrets

Repository or `production` environment secrets (values are never printed):

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Worker, D1, R2, and API Gateway read/write |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID` | Account and API Shield zone |
| `QQBOT_API_TOKEN` | QQBot service credential; same value as QQBot's `PLATFORM_SERVICE_TOKEN` |
| `BASTION_BUILD_TOKEN` | Bastion build only (numeric player IDs); never to browsers or QQBot |
| `QQBOT_POLICY_WEBHOOK_URL`, `QQBOT_POLICY_WEBHOOK_SECRET` | Group-policy callback and its HMAC secret |
| `OCRKIT_API_TOKEN` | Shared only with OCRKit |
| `OCRKIT_SNAPSHOT_TOKEN` | OCRKit reads finalized screenshot sets |
| `BINDING_INVITE_CODE_ENCRYPTION_KEY` | AES-GCM key (`openssl rand -base64 32`); keep while invitations are active |
| `ADMIN_BATTLETAG` | Full BattleTag, already in `player_accounts`; deploy sets its `is_admin` |

## Workflow

Runs only when API inputs change (`apps/api`, API packages, migrations, API tooling,
wrangler configs, OpenAPI, shared build inputs, the workflow).

1. Pull request: migration checks, tests, typecheck, `wrangler deploy --dry-run`.
2. Push to `main` or manual dispatch: the same checks; staging migrations and
   schema check; forward-only production migrations; validate and bootstrap
   `ADMIN_BATTLETAG`; update secrets; deploy with the commit SHA as
   `DEPLOYMENT_REVISION`; submit API Shield endpoints.

The workflow does not verify the public hostname; follow the
[observability runbook](api-observability.md).

API Shield manages public and integration routes only (`/v1/admin/**` and
`/v1/internal/**` excluded; budget 80 of the Free plan's 100). Deploy reconciles
the API host: read the full zone inventory, delete stale host operations one at a
time, add missing ones, keep other hosts; a missing operation ID aborts. Source:
[openapi.json](../api/openapi.json). Locally:

```bash
CLOUDFLARE_ZONE_ID=<id> CLOUDFLARE_API_TOKEN=<token> pnpm deploy:api-endpoints
```

## QQBot

Add to QQBot's environment, then restart only that container:

```env
PLATFORM_BASE_URL=https://api.owbastion.com
PLATFORM_SERVICE_TOKEN=<QQBOT_API_TOKEN>
PLATFORM_REQUEST_TIMEOUT_MS=10000
PLATFORM_POLICY_WEBHOOK_SECRET=<QQBOT_POLICY_WEBHOOK_SECRET>
```

- Test in a dedicated group: `/验证 <code>` from an invitation; `/绑定` is retired
  and returns invitation guidance. One QQ member OpenID maps to one binding.
- Portal QQ login also needs an enabled group-access record (set in `/admin`).
- The QQBot reverse proxy must forward `/internal/v1/qq/group-policy-events`. The
  Worker signs each request with the webhook secret; QQBot rejects stale or invalid
  signatures. The Queue and 5-minute outbox repair retry delivery.

## Rollback

Redeploy the previous successful commit. Keep D1 records and migrations. To isolate
the API, remove QQBot's platform endpoint or restore the last known-good one. Never
delete evidence or business records.
