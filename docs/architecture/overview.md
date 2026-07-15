# Architecture Overview

> Ecosystem contract version: 1.0

## Status and scope

The repository contains an implemented TypeScript workspace with:

- apps/api: a Hono Cloudflare Worker API;
- apps/portal: a Nuxt player-facing Portal and Access-protected `/admin` control surface;
- packages/contracts, domain, database, and auth;
- forward-only D1 migrations for bindings, submissions, evidence metadata, and
  QQ login/session state;
- an R2 evidence binding used when EVIDENCE_BUCKET is available.

OCR orchestration, review, grants, snapshot import, queues, and feature
switches remain planned. The first administrative slice now covers player
account status, QQ bindings, and QQ group access.

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

- **Portal:** public landing content, QQ browser login, current-player data, and
  player-facing recent submission/status views.
- **API:** health, authenticated QQ binding/submission writes, public
  submission status, QQ login verification, session lookup/logout, and a
  Cloudflare Access-protected administrative API for players and group access.
- **Evidence:** private QQ image retrieval and R2 storage during submission
  creation when the Worker R2 binding is configured.

The Portal is a rendering surface and does not own durable business state.
The Portal proxies administrator requests server-side so Access identity headers
are forwarded to the Worker. Public responses do not expose private evidence,
QQ OpenIDs, review notes, or unapproved drafts.

## Design principles

1. Keep one authoritative owner for each fact.
2. Keep released content, platform business state, drafts, and caches distinct.
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
