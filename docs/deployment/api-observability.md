# API production observability runbook

This runbook verifies a deployed API behavior. It does not turn CI success or
a Worker deployment into production verification of a player-facing workflow.
Do not paste credentials, session cookies, numeric player identifiers,
submission IDs, evidence URLs, or full API bodies into tickets or logs.

## State vocabulary

| State | Evidence required |
| --- | --- |
| planned | Intent or issue only |
| coded | Reviewed source and local tests |
| deployed | A specific immutable revision is returned by production `/health` |
| production-verified | A recorded production check of the applicable public or authenticated path |

## Confirm the deployed revision

Use a request ID that is safe to share and compare the response revision with
the intended Git commit SHA:

```bash
curl --silent --show-error --include \
  --header 'X-Request-ID: verify-api-revision-20260729' \
  https://api.owbastion.com/health
```

Expect `200`, the echoed `X-Request-ID`, `Cache-Control: private, no-store`,
and a `deploymentRevision` equal to the immutable deployed commit. `unknown`
means the Worker was deployed outside the release workflow and is not sufficient
deployment evidence.

In Cloudflare Workers Logs, find the same request ID. The `request_complete`
record contains only low-cardinality fields: `deploymentRevision`, `routeClass`,
HTTP method and status, duration, cache policy, and edge-cache availability.
Catalog reads also emit `service_operation_complete`; its operation name is a
fixed catalog class and `catalogKvOperationCount: 0` documents that the current
catalog implementation does not issue KV reads.

## Verify public caching and bypasses

The initial allowlist is deliberately narrow: `/v1/maps`,
`/v1/public/achievements`, `/v1/challenges?family=map`, unfiltered
`/v1/events`, event details, and unfiltered public Agents event lists/details.
They return `public, max-age=60, s-maxage=60`. Search and every filtered event
variant return `private, no-store`. Public Agents responses set
`Vary: Authorization`; a request carrying the Bastion build token always
bypasses shared caching with `private, no-store`.

Use a public Agents request with no build credential. Preserve response headers
but do not retain the response body:

```bash
curl --silent --show-error --output /dev/null --dump-header - \
  --header 'X-Request-ID: verify-public-cache-1' \
  'https://api.owbastion.com/v1/agents/maps?page=1&pageSize=20'
curl --silent --show-error --output /dev/null --dump-header - \
  --header 'X-Request-ID: verify-public-cache-2' \
  'https://api.owbastion.com/v1/agents/maps?page=1&pageSize=20'
```

Record `Cache-Control`, `Age`, `ETag`, `Vary`, and `CF-Cache-Status` if each
header is present. Public Agents responses normally use a 60-second public
policy. Cloudflare may report no edge cache header for a Worker response; that
is a result to record, not a reason to infer a hit. The two request logs show
the route class, cache policy, and duration without request query values or
payloads.

Use an authorized Bastion build request only in the approved build environment.
It must return `Cache-Control: private, no-store`; do not put the bearer token
in a shell history, URL, ticket, or log. Administrative paths are also forced
to `private, no-store`; verify their headers during an approved administrative
session and retain only the status, request ID, and cache headers.

For the immutable public achievement icon path, additionally compare `ETag`
and `Cache-Control`; it is intentionally distinct from the short-lived Agents
catalog policy.

## Confirm catalog KV and slow operations

Before rollout, note the Cloudflare KV namespace operation counters for the
catalog window. After the revision check and repeated public catalog checks,
compare the same counters: catalog reads and invalidations should add zero KV
operations. Other platform features may still legitimately use the namespace,
so scope the comparison to a quiet verification window and corroborate it with
the catalog operation logs.

Search Workers Logs by a safe request ID or `event=service_operation_complete`.
Investigate high `durationMs` records by fixed `routeClass` and `operation`
only. Do not add player names, IDs, event IDs, arbitrary URLs, SQL text,
evidence keys, query values, or response bodies as log dimensions.

## Mutation refresh check

In an approved staging or production administrative session, make one catalog
mutation with its normal idempotency key, then repeat the affected admin refresh
and public Agents read. Record the mutation outcome, both request IDs, deployed
revision, status, cache headers, and resulting cache-policy log records. The
admin refresh must remain `private, no-store`; the public read must show the
current policy. Do not record the mutated catalog payload.

## Public HTTP cache rollback

This rollback changes only public HTTP caching. It does not roll back D1
migrations, catalog mutations, Queue messages, or any other business state.

1. Deploy the currently intended source revision with public caching disabled:

   ```bash
   pnpm exec wrangler deploy \
     --var DEPLOYMENT_REVISION:<immutable-commit-sha> \
     --var PUBLIC_HTTP_CACHE_ENABLED:false
   ```

2. Purge the affected public URL cache through the approved Cloudflare change
   process, then repeat the public header checks above. Agents responses must
   now have `Cache-Control: private, no-store`.
3. Record the rollback request IDs and deployed revision. Restore normal
   behavior by redeploying the release workflow, which sets
   `PUBLIC_HTTP_CACHE_ENABLED:true`.

The API unit test `can disable public Agents HTTP caching without changing
catalog data` is the local regression check for this rollback control.
