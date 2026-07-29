# ADR 0002: Submission status reads use D1 directly

## Status

Accepted 2026-07-29.

## Context

`GET /v1/submissions/:submissionId` is an unauthenticated lookup by an opaque
UUID. Its response is deliberately limited to the submission ID, map, status,
and timestamps; it must not include evidence, OCR data, player or QQ identity,
review metadata, grants, or internal signals.

The repository records only per-request `durationMs` in structured Worker logs.
It contains no retained production request-volume, polling-cadence, D1-cost, or
latency aggregate, and the Portal has no caller for this public endpoint.
Consequently there is no local, reproducible measurement that demonstrates a
capacity or latency benefit sufficient to accept stale workflow reads.

The former KV entry lived for five minutes and relied on asynchronous deletion
after upload completion, OCR success or failure, player confirmation, manual
review requests, and administrator decisions. A deletion failure did not block
the D1 transition, but could let a later refresh return an earlier status.

## Decision

Remove submission-status KV caching and all per-submission invalidation. The
endpoint reads D1 on every request and returns `Cache-Control: private,
no-store`. The `refresh=1` cache-bypass parameter has no meaning and is not a
supported contract.

This makes D1 the only workflow-state read source for upload completion, OCR
completion or failure, player confirmation, manual-review requests, review
approval or rejection, and the atomic grant creation performed with approval.
The status endpoint remains an intentionally narrow public projection; an
opaque ID is not authorization for any private submission data.

## Alternatives considered

1. Retain KV with a documented five-minute stale window. Rejected: no measured
   load or latency benefit justifies a completed transition reverting after a
   refresh.
2. Use a short shared HTTP cache. Rejected: the endpoint is a workflow-state
   projection rather than a cacheable catalog, and no measured need offsets the
   freshness risk.
3. Use D1 directly with `private, no-store`. Chosen: it is operationally
   simpler, preserves the privacy boundary in intermediaries, and makes every
   read observe committed workflow state.

## Measurement follow-up

If future traffic motivates revisiting this decision, collect a bounded
production window of request count, unique opaque IDs, client cadence, Worker
latency percentiles, D1 read cost, and error rate without retaining submission
IDs or personal data. Any new cache proposal must state its accepted staleness,
prove every transition is safe, and include a test that prevents an older state
from reappearing after a completed transition.
