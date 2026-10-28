# API Observability

Verifies deployed behavior; CI success or a deploy is not production verification
of a player workflow. Never put credentials, cookies, numeric player IDs,
submission IDs, evidence URLs, or full bodies in tickets or logs.

## Deployed revision

```bash
curl -si -H 'X-Request-ID: verify-api-revision-1' https://api.owbastion.com/health
```

Expect 200, the echoed `X-Request-ID`, `Cache-Control: private, no-store`, and
`deploymentRevision` equal to the deployed commit (`unknown` means deployed outside
the workflow: not evidence). In Workers Logs, the same request ID shows
`request_complete` with only `deploymentRevision`, `routeClass`, method, status,
duration, cache policy, edge-cache availability. Catalog reads also log
`service_operation_complete` with a fixed operation class.

## Public cache

- Allowlist: `/v1/maps`, `/v1/public/achievements`, `/v1/challenges?family=map`,
  unfiltered `/v1/events` and details, unfiltered public Agents event lists/details.
  They return `public, max-age=300, s-maxage=300`, are identity-independent
  (cookies join the shared cache; entries store no cookies or per-request CORS).
- Search, filtered events, and anything reading caller identity return
  `private, no-store`. Public Agents set `Vary: Authorization`; a Bastion build
  token request always bypasses with `private, no-store`. Admin paths too.
- Each allowlisted request logs `public_cache` with `status` in `HIT`, `MISS`,
  `BYPASS`, `READ_FAILURE`, `WRITE_FAILURE` (no query values, IDs, or data). A MISS
  is followed by the catalog operation; a HIT must not be. Cache API failures fall
  back to D1.
- Check with two identical credential-free requests, keeping headers only
  (`Cache-Control`, `Age`, `ETag`, `Vary`, `CF-Cache-Status` if present):

```bash
curl -s -o /dev/null -D - -H 'X-Request-ID: verify-public-cache-1' \
  'https://api.owbastion.com/v1/agents/maps?page=1&pageSize=20'
```

  First request: MISS plus one catalog operation; second: HIT without it. A missing
  `CF-Cache-Status` is a result to record, not a hit. Never put the build token in
  shell history, URLs, tickets, or logs. The public achievement icon path is
  immutable: compare its `ETag` and `Cache-Control` separately.
- After a catalog mutation, repeat the admin refresh and public read: admin stays
  `private, no-store`, public shows the current policy. Record outcome, request
  IDs, revision, status, and cache headers, not the payload.

## Slow operations

Search by request ID or `event=service_operation_complete`; investigate high
`durationMs` by fixed `routeClass` and `operation` only. Never add names, IDs, URLs,
SQL, evidence keys, query values, or bodies as log dimensions. Batched relationship
loads keep statement counts bounded.

## Queue-backed OCR

Trace by the originating request ID. Records use `layer: "ocr"` with events
`job_enqueued`, `job_accepted`, `job_started`, `ocrkit_response`,
`ocrkit_response_parsed`, `job_completed`, `queue_job_failed`,
`job_failure_recorded`, and matching `*_failed`. They carry attempt, manual flag,
status, field names, stage, duration, bounded error, and the opaque `submissionId`;
never identity, image, OCR text, object key, token, or body.

- `queue_job_failed` on attempts 1-3 retries; attempt 4 is last. If recording
  fails, follow `queue_failure_record_failed`, then `dead_letter_recovered` or
  `dead_letter_recovery_failed`. The 5-minute repair emits `stale_job_recovered`
  for Submissions `ocr_pending` over 45 minutes.
- Intake returns 202 within the 20-second timeout (recognition excluded);
  OCRKit retries 503 and expires jobs waiting 30 minutes. 202, an OCRKit access
  line, or OCRKit health does not prove callback delivery or the final outcome:
  `job_completed` does. Legacy v1 messages log `legacy_job_skipped`; never replay
  one as a new round or reuse a round UUID.
- Match `requestId` with the `X-Request-ID` sent to OCRKit when reading its logs.

## Public cache rollback

Changes only HTTP caching, not migrations, data, or queues.

1. Deploy the intended revision with caching off:
   `pnpm exec wrangler deploy --var DEPLOYMENT_REVISION:<sha> --var PUBLIC_HTTP_CACHE_ENABLED:false`
2. Purge affected URLs via the approved Cloudflare process; Agents responses must now
   be `private, no-store`.
3. Record request IDs and revision. Restore by redeploying through the release
   workflow (`PUBLIC_HTTP_CACHE_ENABLED:true`).

The API test `can disable public Agents HTTP caching without changing catalog data`
guards this switch.

## Portal catalog cache

`/maps`, `/events`, `/achievements` stack two 300s TTL caches: the Worker's HTTP cache
and the Portal's in-memory `getPublicCatalog` (`server/utils/public-catalog.ts`,
Nitro `cachedFunction`, `swr: false`, fetched without the player cookie; guarded by
`public-catalog.test.ts`). Worst-case admin-edit visibility on those pages is 600s;
`/me` and other `/api/portal/*` reads bypass the Portal layer (about 300s). Write-time
invalidation is an accepted non-goal (#33, #206).

The cache rollback switch does not touch the Portal layer. A new Portal Worker version ([Workers Builds](portal-cloudflare.md)) clears it; reads then still use the Worker layer's TTL.
