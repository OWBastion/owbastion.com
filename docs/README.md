# Documentation Index

This directory contains the repository's architecture, development, deployment,
and API documentation. The feature status matrix is the only current inventory
of implementation and verification status.

## Architecture

- [Overview](architecture/overview.md) — system mission, ownership boundaries, implemented repository shape, and design principles.
- [Integrations and workflows](architecture/integrations-and-workflows.md) — QQBot, submissions, evidence, login, and the coded OCR/review boundary.
- [Data and security](architecture/data-and-security.md) — data classes, storage responsibilities, authorization, and public-repository safety.

## Architecture decisions

- [ADR 0001: Platform technology stack](adr/0001-platform-technology-stack.md) — frontend, backend, Cloudflare services, contract ownership, repository organization, and implementation guardrails.
- [ADR 0002: Submission status reads use D1 directly](adr/0002-submission-status-d1-reads.md) — workflow-state freshness, privacy, and cache decision.

## Development

- [Testing and change policy](development/testing-and-change-policy.md) — implementation checklist, testing layers, idempotency, migrations, observability, and staged delivery.
- [Database migrations and seeds](development/database-migrations-and-seeds.md) — schema, local fixtures, catalog imports, and migration data-write guardrails.
- [Feature status matrix](development/feature-status.md) — the single source of truth for capability implementation and verification status.
- [Portal copy guidelines](development/portal-copy-guidelines.md) — concise copy rules, status vocabulary, empty states, errors, and examples for Portal work.
- [Portal UI guidelines](development/portal-ui-guidelines.md) — agent-facing page structures, component selection, states, responsive behavior, and accessibility rules.

Implementation status belongs in the feature status matrix; durable Portal behavior and visual rules belong in the UI and copy guidelines. Task plans, dated audits, execution checklists, and other temporary snapshots belong in issues or pull requests and should not be added as active repository documentation.

## Deployment

- [HKG Portal deployment](deployment/portal-hkg.md) — Docker Compose deployment for the public Portal and the server-managed Cloudflare Tunnel boundary.
- [API deployment](deployment/api-github-actions.md) — GitHub Actions deployment of the Cloudflare Worker API and HKG QQBot integration.

For a short project introduction, start with the repository-level [`README.md`](../README.md).
