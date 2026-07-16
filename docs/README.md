# Documentation Index

This directory contains detailed, public-facing project documentation. It
separates implemented API, Portal, storage, and login behavior from future
architecture milestones.

## Architecture

- [Overview](architecture/overview.md) — system mission, ownership boundaries, implemented repository shape, and design principles.
- [Integrations and workflows](architecture/integrations-and-workflows.md) — QQBot, submissions, evidence, login, and the coded OCR/review boundary.
- [Data and security](architecture/data-and-security.md) — data classes, storage responsibilities, authorization, and public-repository safety.

## Architecture decisions

- [ADR 0001: Platform technology stack](adr/0001-platform-technology-stack.md) — frontend, backend, Cloudflare services, contract ownership, repository organization, and implementation guardrails.

## Development

- [Testing and change policy](development/testing-and-change-policy.md) — implementation checklist, testing layers, idempotency, migrations, observability, and staged delivery.
- [Feature status matrix](development/feature-status.md) — the single source of truth for capability implementation and verification status.
- [Portal copy guidelines](development/portal-copy-guidelines.md) — concise copy rules, status vocabulary, empty states, errors, and examples for Portal work.

## Deployment

- [HKG Portal deployment](deployment/portal-hkg.md) — Docker Compose deployment for the public Portal and the server-managed Cloudflare Tunnel boundary.
- [API deployment](deployment/api-github-actions.md) — GitHub Actions deployment of the Cloudflare Worker API and HKG QQBot integration.

For AI-agent routing, start with the repository-level [`AGENTS.md`](../AGENTS.md). For the short public introduction, start with [`README.md`](../README.md).
