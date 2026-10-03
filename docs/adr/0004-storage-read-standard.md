# ADR 0004: Storage read paths, caching, and query shape

## Status

Accepted 2026-10-04. Relates to ADR 0002 without superseding it.

## Context

D1 is authoritative for platform business facts. Three read-side mechanisms
already exist: the shared HTTP/edge cache (`withPublicCache`, Cache API) for
allowlisted public GET responses, `PLATFORM_CACHE` (KV) as a version-scoped
read-through copy of selected D1 catalog and grant projections, and direct D1
reads. ADR 0002 keeps mutable submission workflow status on direct D1 reads
with `private, no-store`.

What was missing is one rule for choosing among them and for bounding D1 query
shape, so new code does not create request-linear KV reads, N+1 D1 queries, or
short-lived caches for rarely changing data.

## Decision

### Read-path classification

| Class | Default path | Rule |
| --- | --- | --- |
| Low-volatility public/reference projection (catalog, maps, titles, events, Agents/build projections) | Shared HTTP cache, then KV read-through, then D1 | Shared caching requires an identity-independent response with no private fields. KV never serves a response directly. |
| Authenticated or player-specific projection | Direct D1, `private, no-store` | Never crosses a shared cache boundary unless the contract proves the response is identity-independent. A KV projection needs a stated reuse across requests and an invalidation owner. |
| Mutable workflow/security state (submission status, review, session, grant decisions) | Direct D1, `private, no-store` | Stale reads must not revert or misrepresent a completed transition. ADR 0002 remains the precedent. |
| Admin lists | Direct D1, bounded and paginated | Not cached unless measured need and accepted staleness are recorded. |

Build/Agents consumers use the same shared-cache path with conditional
(`ETag`/`If-None-Match`) revalidation where the response is deterministic.
Identity-bearing Agents responses (service token present) bypass shared caching.

### Cache lifecycle

- D1 stays the only source of truth. KV and HTTP cache entries are disposable
  copies; losing them changes cost, never correctness.
- Cache keys and version scopes are owned by `packages/database/src/platform-cache.ts`;
  HTTP cache keys by `apps/api/src/public-cache.ts`. Callers do not invent keys
  or scopes elsewhere.
- Authoritative writes invalidate through the existing version bump. A failed
  invalidation or cache write must be logged and must not make an older state
  authoritative; correctness for stable data must not depend on TTL alone, and
  TTL is chosen by volatility and freshness requirement, never as a single
  global default.
- Stale-while-revalidate and negative caching are allowed only where the
  absence/staleness semantics and invalidation are explicitly safe.
- When KV is unavailable or quota-blocked, cache-eligible reads fall back to
  D1 (cache miss). A cache outage must not become a platform outage when D1 can
  satisfy the projection. No second KV provider or provider abstraction is
  introduced without post-optimization evidence of a concrete remaining need.
- Cache behavior is measured through fixed-vocabulary structured logs (status,
  operation, scope). Never log cache keys that embed private identifiers, player
  identity, or submission IDs.

### D1 query standard

- No per-item (N+1) queries for list and batch projections; use one bounded
  batch query or join when ownership stays clear.
- Paginate unbounded record sets and keep result sets bounded.
- Add indexes only for demonstrated query paths.
- Do not reload the same stable catalog/reference fact repeatedly within one
  request; reuse the loaded authoritative result.
- Routes stay thin; reusable data access lives in the existing database
  boundary.
- Tests assert observable semantics and amplification risks (for example, work
  does not grow with item count), not exact SQL text or incidental call counts
  unless the count is itself the contract.

### Checklist for new or modified endpoints touching D1/KV/cache

1. Which class above is the response? Is it identity-independent?
2. If shared-cacheable: what freshness does the data actually allow, and what
   invalidates it after a write?
3. If KV is used: why is the shared HTTP cache plus D1 insufficient?
4. Does work grow with item count or with number of cached names per request?
5. What happens when KV or the cache write fails?
6. Is a mutable workflow state ever served from a copy?

## Alternatives considered

1. One global cache TTL and automatic caching of every read. Rejected: mixes
   mutable workflow state with stable reference data.
2. A generic cache/provider framework or a second KV vendor. Rejected: no
   present requirement the existing mechanisms cannot satisfy.
3. Treat KV as a public response cache. Rejected: KV remains a D1 read-through
   copy; the shared HTTP layer owns response caching.

## Consequences

Read-path choices become reviewable against a fixed model. Concrete
optimization of existing callers is tracked in #289 and must converge on this
decision. Quota numbers and traffic counts are operational evidence, not
architecture constants.
