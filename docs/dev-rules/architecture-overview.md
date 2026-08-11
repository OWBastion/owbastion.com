# Architecture Overview

> Ecosystem contract version: 1.0

## Status and scope

The capability status matrix in [product-rules/feature-status.md](../product-rules/feature-status.md)
is the single source of truth for implementation and verification status.

The repository contains an implemented TypeScript workspace with:

- apps/api: a Hono Cloudflare Worker API;
- apps/portal: a Nuxt player-facing Portal and platform-session-protected `/admin` control surface;
- packages/contracts, domain, database, and auth;
- forward-only D1 migrations for bindings, submissions, evidence metadata, and
  QQ login/session state, platform-owned events, maps, titles, and achievement
  challenges;
- an R2 evidence binding used when EVIDENCE_BUCKET is available.

OCR orchestration, review, and Queue-backed submission processing are coded for
the first map-challenge slice; their current status and verification evidence
are tracked in the matrix. Platform-internal title Grants are created by the
approval transaction. Bastion consumes the platform's current metadata through
the Agents API when building and publishing the game; it does not export a
formal content snapshot to the platform.

## Mission and ownership

The platform provides public and player-facing account capabilities and owns
the current event, map, title, and challenge metadata for the Bastion
ecosystem, as well as durable business state. Bastion owns the game
implementation, build, and release artifacts. Bastion reads platform metadata
through the Agents API, including only platform-enabled, validated map gameplay
revision projections and revision-owned spatial inputs; it is not a competing
metadata source. Workshop behavior, generated data, build, and release remain
Bastion-owned.

| Repository | Authoritative responsibility |
| --- | --- |
| OWBastion/Bastion | Game implementation, builds, releases, and published game artifacts |
| OWBastion/owbastion.codes | Current event, map, title, and challenge metadata; business data, API, Portal, evidence delivery, review decisions, and platform title Grants |
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
  events, maps, achievements, titles, bounded cross-content search, and the
  public title-holding facts required to build the in-game title database.
  Ordinary requests omit numeric player IDs; requests carrying the Bastion
  build token may receive current display names, stable game player IDs, active
  title keys, and required map scope. It excludes QQ, submission, review-source,
  time, and audit data.
- **Evidence:** private QQ image retrieval and R2 storage during submission
  creation when the Worker R2 binding is configured.

The Portal is a rendering surface and does not own durable business state.
The Portal proxies administrator requests server-side so the platform session
cookie is forwarded to the Worker. Public responses do not expose private evidence,
QQ OpenIDs, review notes, or unapproved drafts.

Portal editorial content is a separate Git-backed surface under
`apps/portal/content/`, with future media assets rooted at
`apps/portal/public/content/`. Nuxt Content indexes Blog development logs and
Changelog player-facing notes from Markdown during development and builds. Blog
entries may describe work in progress; Changelog entries describe changes that
have already been released. Editorial metadata and a Changelog `version` value
do not replace platform D1 facts or Bastion's authoritative implementation,
build, release, and published-artifact state. This content foundation does not
add D1, R2, or an editorial API.

Nuxt Studio is an editor for this Git-backed surface, not a second platform
identity system. Its same-origin custom-auth bridge verifies the current Portal
session server-side and requires `player.isAdmin`; Studio routes and server
write requests are rejected when that platform authorization is absent or
revoked. Git provider credentials remain an external deployment concern.

Achievement catalog management changes platform-owned title and challenge
metadata. It does not edit Bastion's game implementation or build artifacts;
Bastion consumes the resulting metadata through the Agents API. Title Grants
remain platform business records.

Random events are platform-owned metadata. Their labels and balancing metadata
are maintained through the administrator Portal and may link to existing
platform challenges, while Bastion consumes them as build input and owns the
corresponding game implementation.

## Design principles

1. Keep one authoritative owner for each fact.
2. Keep platform metadata, game implementation, platform business state, and caches distinct.
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
