# Testing and Change Policy

## Before implementation

## Current foundation status

The repository contains a runnable pnpm TypeScript workspace and a Hono
Cloudflare Worker API. The API implements `GET /health`, authenticated v1 QQ
binding creation, and authenticated v1 submission creation backed by local D1
migrations. The contracts, domain, auth, and database packages own the
corresponding boundaries.

R2 evidence persistence, OCR, review, grants, administrative Nuxt applications,
and remote Cloudflare deployment are not implemented yet. The public Portal
foundation is implemented and its HKG container deployment is documented
separately below.

The remaining foundation sequence from ADR 0001 must be introduced as separate
validated milestones. Design documents do not imply that those capabilities
already exist.

The local D1 foundation is applied with `pnpm exec wrangler d1 migrations apply
owbastion-codes-local --local`. Migrations are forward-only; a corrective change
must be added as a new migration and verified against a restored local database.
Remote application requires an explicit deployment change and is outside local
tests.

The public Portal is the first exception to the Cloudflare-only deployment
assumption: its container is validated locally with Docker Compose and may be
run on HKG. The server-managed Cloudflare Tunnel is not part of repository
tests; its local route and public hostname must be verified during deployment.

For a non-trivial change, identify:

- product area and owner of each fact;
- affected API, event, queue, database, and external contracts;
- authorization and data classification;
- idempotency, retry, and state-transition behavior;
- rollback or reconciliation behavior.

Keep domain logic independent from HTTP and storage adapters. Add migrations, tests, and runbooks with operational changes. Avoid broad framework rewrites without an architecture decision record.

## Testing layers

- Unit tests for rules, transitions, and authorization.
- Contract tests for QQBot, OCRKit, Bastion snapshots, and GitHub requests.
- D1 migration and repository tests.
- Queue redelivery and idempotency tests.
- Integration tests with fake R2, OCR, GitHub, and QQ clients.
- End-to-end tests for player submission and reviewer approval.
- Security tests for privilege escalation, SSRF, file validation, and private-data exposure.
- Snapshot compatibility tests across supported game versions.

Normal unit tests must not depend on live external services.

## Contracts and observability

`packages/contracts` is the canonical home for API schemas, domain events, queue payloads, imported Bastion schemas, OCRKit compatibility types, and QQ request types. Use explicit versions. Migrations should be forward-safe and include repair or rollback guidance. Consumers should tolerate compatible older payloads and redelivery.

Requests and jobs should carry a correlation ID, actor or service identity, operation name, contract version, and relevant submission or change-set ID. Track queue delay and retries, OCR outcomes and latency, review throughput, grant and PR failures, notification failures, snapshot freshness, and audit coverage.

## Staged delivery

Bastion-mutating features should progress from read-only inspection to draft generation, dry-run validation, pull-request creation, and controlled production use.

OCR automation should progress from a manual baseline to shadow processing, reviewer assistance, limited automatic eligibility, and measured expansion.

Do not start with arbitrary source editing, fully automatic grants, or a generic visual OverPy editor.

## Definition of done

A platform change is complete when the source of truth, state transitions, idempotency, authorization, public/private boundary, migrations, contract changes, retry/reconciliation behavior, audit coverage, tests, deployment, and rollback expectations are documented and verified.
