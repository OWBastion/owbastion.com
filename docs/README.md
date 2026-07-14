# Documentation Index

This directory contains the detailed, public-facing project documentation. It describes the target architecture unless a document explicitly labels a behavior as implemented.

## Architecture

- [Overview](architecture/overview.md) — system mission, ownership boundaries, target repository shape, and design principles.
- [Integrations and workflows](architecture/integrations-and-workflows.md) — public contracts and high-level flows for QQBot, OCRKit, submissions, challenge rules, and Bastion changes.
- [Data and security](architecture/data-and-security.md) — data classes, storage responsibilities, authorization, and public-repository safety.

## Architecture decisions

- [ADR 0001: Platform technology stack](adr/0001-platform-technology-stack.md) — frontend, backend, Cloudflare services, contract ownership, repository organization, and implementation guardrails.

## Development

- [Testing and change policy](development/testing-and-change-policy.md) — implementation checklist, testing layers, idempotency, migrations, observability, and staged delivery.

For AI-agent routing, start with the repository-level [`AGENTS.md`](../AGENTS.md). For the short public introduction, start with [`README.md`](../README.md).
