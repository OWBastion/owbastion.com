# Testing and Change Policy

## Before implementation

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
