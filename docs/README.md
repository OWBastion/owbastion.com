# Documentation Index

This directory contains the repository's product, engineering, design,
deployment, and API documentation. Rules are grouped by ownership; the feature
status matrix is the only current inventory of implementation and verification
status.

## Product rules

- [Integrations and workflows](product-rules/integrations-and-workflows.md) — QQBot, submissions, evidence, login, and the coded OCR/review boundary.
- [Feature status matrix](product-rules/feature-status.md) — the single source of truth for capability implementation and verification status.

## Development and engineering rules

- [Architecture overview](dev-rules/architecture-overview.md) — system mission, ownership boundaries, repository shape, and engineering principles.
- [Data and security](dev-rules/data-and-security.md) — data classes, storage responsibilities, authorization, and public-repository safety.
- [Testing and change policy](dev-rules/testing-and-change-policy.md) — implementation checklist, testing layers, idempotency, migrations, observability, and staged delivery.
- [Database migrations and seeds](dev-rules/database-migrations-and-seeds.md) — schema, local fixtures, catalog imports, and migration data-write guardrails.

## Design rules

- [DESIGN.md](design-rules/DESIGN.md) — authoritative visual, interaction, accessibility, and content design rules.
- [Design rules index](design-rules/README.md) — design-rules directory index and authority model.
- [Portal UI guidelines](design-rules/portal-ui-guidelines.md) — page structures, component selection, states, responsive behavior, and accessibility rules.
- [Portal copy guidelines](design-rules/portal-copy-guidelines.md) — concise copy rules, status vocabulary, empty states, errors, and examples.

## Architecture decisions

- [ADR 0001: Platform technology stack](adr/0001-platform-technology-stack.md) — frontend, backend, Cloudflare services, contract ownership, repository organization, and implementation guardrails.
- [ADR 0002: Submission status reads use D1 directly](adr/0002-submission-status-d1-reads.md) — workflow-state freshness, privacy, and cache decision.

Implementation status belongs in the feature status matrix. Product behavior,
engineering constraints, and design rules belong in their respective rule
directories. Task plans, dated audits, execution checklists, and other
temporary snapshots belong in issues or pull requests and should not be added as
active repository documentation.

## Deployment

- [HKG Portal deployment](deployment/portal-hkg.md) — Docker Compose deployment for the public Portal and the server-managed Cloudflare Tunnel boundary.
- [API deployment](deployment/api-github-actions.md) — GitHub Actions deployment of the Cloudflare Worker API and HKG QQBot integration.

For a short project introduction, start with the repository-level [`README.md`](../README.md).
