# AI Agent Guide

> Repository: `OWBastion/owbastion.codes`  
> Role: Bastion web platform and operational control plane  
> Status: target architecture; verify implementation before making claims

This file is an AI-agent routing guide and repository policy. It is not a substitute for the detailed documents linked below. Read the relevant documents before editing or reviewing a subsystem.

## Repository reality

The repository currently contains architecture and documentation material rather than a complete production application. Do not invent source files, deployed services, migrations, APIs, credentials, or runtime behavior. When implementation is added, update the relevant documentation and distinguish implemented behavior from target design.

## Required reading by task

| Task | Read first |
| --- | --- |
| General orientation or README work | `README.md`, `docs/README.md` |
| Architecture, ownership, or repository shape | `docs/architecture/overview.md` |
| QQBot, OCRKit, Bastion, submissions, or state transitions | `docs/architecture/integrations-and-workflows.md` |
| Authentication, privacy, storage, or security | `docs/architecture/data-and-security.md` |
| Tests, migrations, queues, release, or implementation changes | `docs/development/testing-and-change-policy.md` |

If a task spans multiple areas, read all corresponding documents. Prefer repository source and tests over stale design text once implementation exists.

## Cross-repository ownership

- `OWBastion/Bastion` owns released game source, content definitions, builds, releases, and public snapshots.
- This repository owns platform business data, public/admin web applications, review, grants, drafts, and orchestration.
- `OWBastion/qqbot` owns QQ ingress, deterministic command UX, and channel notifications.
- `OWBastion/ocrkit` owns stateless screenshot recognition and model lifecycle.

Do not create a competing source of truth. Released Bastion content must not be silently overridden by platform data.

## Agent working rules

- Inspect the current repository and relevant documents before proposing or editing code.
- Keep changes narrow and directly related to the request; do not implement the target architecture speculatively.
- Before implementation, identify the data owner, affected contracts, storage and queue impact, authorization boundary, idempotency behavior, and rollback or reconciliation path.
- Keep domain logic independent from HTTP and storage adapters where implementation exists.
- Treat OCR output as evidence. Preserve raw runs and store human corrections separately.
- Keep public released data separate from drafts and private operational data.
- Do not bypass validation, CI, human review, protected branches, or release policy for Bastion changes.
- Do not execute arbitrary user-supplied OverPy or shell code in the primary API runtime.
- Use tests and local fakes for external services; normal unit tests must not depend on live services.
- Update documentation when a public contract, data owner, security boundary, or operational behavior changes.

## Public-repository safety

Assume all committed files are public. Never commit secrets, tokens, signed URLs, private screenshots, QQ identifiers, internal risk signals, personal data, production endpoints, or copied private logs. Use placeholders and document the interface without exposing operational access details.

Do not add undocumented claims about production readiness, external integrations, supported versions, or deployment state. If a detail is sensitive or not yet implemented, keep it out of public docs or describe only the abstract contract.

## Completion checklist

Before handoff, verify as applicable:

- source of truth and security classification are explicit;
- authorization is enforced at the server boundary;
- state transitions and idempotency are defined;
- private/public data separation is tested;
- migrations and contract changes are documented;
- external failures have retry and reconciliation behavior;
- privileged actions are auditable;
- relevant tests and documentation checks pass;
- no public artifact contains sensitive runtime data.
