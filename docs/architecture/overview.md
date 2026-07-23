# Architecture Overview

> Ecosystem contract version: 1.0

## Status and scope

The capability status matrix in [development/feature-status.md](../development/feature-status.md)
is the single source of truth for implementation and verification status.

The repository contains an implemented TypeScript workspace with:

- apps/api: a Hono Cloudflare Worker API;
- apps/portal: a Nuxt player-facing Portal and platform-session-protected `/admin` control surface;
- packages/contracts, domain, database, and auth;
- forward-only D1 migrations for bindings, submissions, evidence metadata, and
  QQ login/session state, maps, achievement challenges, and the versioned
  Bastion title catalog, plus Draft/Change Set/Candidate/Release state;
- an R2 evidence binding used when EVIDENCE_BUCKET is available.

OCR orchestration, review, Bastion challenge snapshot import, and Queue-backed
submission processing are coded for the first map-challenge slice; their
current status and verification evidence are tracked in the matrix.
Grants, title issuance, and feature switches remain planned.

## Mission and ownership

The platform provides public and player-facing account capabilities and owns
durable business state for the Bastion ecosystem. It is a control plane:
released game content remains authoritative in OWBastion/Bastion.

| Repository | Authoritative responsibility |
| --- | --- |
| OWBastion/Bastion | Released game source, content definitions, builds, releases, and public snapshots |
| OWBastion/owbastion.codes | Platform business data, API, Portal, private evidence, and future review/grant orchestration |
| OWBastion/qqbot | QQ channel ingress, deterministic command UX, and notifications |
| OWBastion/ocrkit | Stateless screenshot recognition and model lifecycle |

## Current product surfaces

- **Portal:** public landing content, QQ browser login, current-player data,
  map, random-event, achievement challenge, and title catalogs, player screenshot upload, recent
  submission/status views, and review UI.
- **API:** health, a public read-only achievement catalog, authenticated QQ binding/submission writes, player upload
  sessions, Queue-backed OCR processing, public submission status, QQ login
  verification, session lookup/logout, and a platform-session-protected
  administrative API for players, groups, submissions, and achievement catalog
  management. The public read-only `/v1/agents/*` projection exposes published
  events, maps, achievements, titles, and bounded cross-content search without
  player, draft, or administrative data.
- **Evidence:** private QQ image retrieval and R2 storage during submission
  creation when the Worker R2 binding is configured.

The Portal is a rendering surface and does not own durable business state.
The Portal proxies administrator requests server-side so the platform session
cookie is forwarded to the Worker. Public responses do not expose private evidence,
QQ OpenIDs, review notes, or unapproved drafts.

Achievement catalog management changes platform challenge rules only. It does
not create titles, alter Bastion's released title or map facts, or issue titles;
those remain Bastion-release and historical-title-migration responsibilities.

Random events are platform-owned directory records. Their labels and balancing
metadata are maintained through the administrator Portal and may link to
existing platform challenges, but do not modify Bastion's released scripts.

The release plane exposes only versioned content metadata to Bastion. Bastion
pulls a specific Candidate, validates stable IDs against its own source, builds
the Workshop outputs, and reports the result through the authenticated internal
callback. A failed Candidate build never advances Current.

Maintainers edit the platform working catalog once through the existing admin
surfaces. The release Portal captures that catalog into a Draft, computes an
automatic stable-ID diff against Current, and creates the Change Set from that
diff; content IDs and JSON are not manually entered in the release workflow.

## Design principles

1. Keep one authoritative owner for each fact.
2. Keep released content, platform business state, historical snapshots, drafts, and caches distinct.
3. Make side effects idempotent and auditable.
4. Enforce public, player-private, reviewer, developer, and maintainer
   boundaries at the API.
5. Version external contracts.
6. Add asynchronous workers only when their implemented responsibility needs
   them.

## Deployment boundary

The Worker API is configured for the api.owbastion.com custom domain. The
Portal has a separate Docker Compose deployment configuration for HKG, with a
server-managed Cloudflare Tunnel outside this repository. Deployment
configuration is not evidence of a live environment; verify operational state
separately.
