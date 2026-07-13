# Architecture Overview

> Ecosystem contract version: `1.0`

## Status and scope

This is the target architecture for a Bastion web platform. The repository may not yet contain all of the described applications, workers, storage bindings, or contracts. Implementations must be checked against source and tests rather than inferred from this document.

## Mission

The platform provides public data access, player-facing account capabilities, review operations, and developer-oriented change preparation for the Bastion ecosystem. It is a control plane: released game content remains authoritative in `OWBastion/Bastion`.

## Ownership boundaries

| Repository | Authoritative responsibility |
| --- | --- |
| `OWBastion/Bastion` | Released game source, content definitions, builds, releases, and public snapshots |
| `OWBastion/owbastion.codes` | Platform business data, public/admin applications, review, grants, drafts, and orchestration |
| `OWBastion/qqbot` | QQ channel ingress, deterministic command UX, and notifications |
| `OWBastion/ocrkit` | Stateless screenshot recognition and model lifecycle |

When an ownership boundary changes, update this contract and coordinate compatible changes in affected repositories.

## Design principles

1. Keep one authoritative owner for each fact.
2. Keep released content, platform business state, drafts, and caches distinct.
3. Use asynchronous work for long-running or retryable operations.
4. Make side effects idempotent and auditable.
5. Version external contracts.
6. Enforce public, player-private, reviewer, developer, and maintainer boundaries.
7. Prefer a modular monolith until scaling, isolation, or security requirements justify a separate deployable.

## Target repository shape

```text
apps/       portal, admin, and authenticated API
workers/    OCR, grant, snapshot-sync, and notification jobs
packages/   contracts, domain, auth, storage, rules, Bastion data, and UI
docs/       architecture, ADRs, and runbooks
migrations/ D1 migrations
```

The conceptual structure is guidance, not proof that each directory already exists.

## Product surfaces

- Public portal: released titles, events, maps, challenges, versions, and permitted public statistics.
- Player area: the player's identities, submissions, progress, appeals, and review outcomes.
- Review/admin area: evidence review, OCR correction, rule evaluation, decisions, and audit history.
- Developer area: released-data inspection, analysis, structured drafts, validation, and reviewable change requests.

Public views must use released snapshot data and must not expose private evidence, internal review notes, or unapproved drafts.
