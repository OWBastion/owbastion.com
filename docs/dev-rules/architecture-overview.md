# Architecture Overview

> Ecosystem contract version: 1.0

## Scope and boundaries

This document describes stable repository architecture. The
[feature status matrix](../product-rules/feature-status.md) is the only source
for implementation and verification status.

The repository is `OWBastion/owbastion.com`, a TypeScript workspace containing
a Hono Cloudflare Worker API, a Nuxt Portal, shared contracts/domain/database/
auth packages, and forward-only D1 migrations. Cloudflare R2 stores private
submission evidence; Queue consumers handle asynchronous platform work.

The platform owns business state, authorization, and current event, map, title,
and challenge metadata. Bastion owns game behavior, generated data, builds,
and releases. Bastion reads validated platform metadata through the Agents API;
the platform does not consume a formal Bastion content snapshot or orchestrate
Bastion/GitHub changes.

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
| OWBastion/owbastion.com | Current event, map, title, and challenge metadata; business data, API, Portal, evidence access policy, review decisions, and platform title Grants |
| OWBastion/qqbot | QQ channel ingress, deterministic command UX, and notifications |
| OWBastion/ocrkit | Stateless screenshot recognition and model lifecycle |

## Product surfaces and service boundaries

- **Portal:** public and player-facing pages, with administrator workflows
  protected by the platform session.
- **API:** canonical business API and public read-only Agents projections.
  Agents responses expose only the game facts required by Bastion and omit
  account, submission, review-source, and audit data.
- **Evidence:** submission screenshots are platform-owned private data. Their
  authorization and handling rules are defined in
  [data-and-security.md](data-and-security.md); current implementation and
  verification status belong in the feature status matrix.

The Portal is a rendering surface and does not own durable business state.
The Portal proxies administrator requests server-side so the platform session
cookie is forwarded to the Worker. Public responses do not expose private evidence,
QQ OpenIDs, review notes, or unapproved drafts.

### Nuxt Portal route topology

Portal routes use Nuxt's file-based routing. A page file and a directory of
descendant pages form a parent route, not two independent route records. For
example, `apps/portal/pages/admin/maps.vue` becomes the `/admin/maps` parent of
`apps/portal/pages/admin/maps/[mapId].vue`; the child is rendered only when the
parent explicitly includes `<NuxtPage />`.

When a collection page and a dynamic detail or editor page are siblings, model
the route as a directory:

```text
apps/portal/pages/admin/maps/
├── index.vue       # /admin/maps
└── [mapId].vue     # /admin/maps/:mapId
```

Use a segment-level `.vue` parent only when it intentionally owns a nested
layout and renders `<NuxtPage />`. A list page must not accidentally become the
parent of its dynamic editor. Every new collection/detail pair must include a
focused route-view test that mounts the concrete dynamic URL and asserts the
detail or editor content, followed by the normal Portal build/check gate.

Portal editorial content is a separate Git-backed surface under
`apps/portal/content/`, with future media assets rooted at
`apps/portal/public/content/`. Nuxt Content indexes Blog development logs and
Changelog player-facing notes from Markdown during development and builds. Blog
entries may describe work in progress; Changelog entries describe changes that
have already been released. Editorial metadata and a Changelog `version` value
do not replace platform D1 facts or Bastion's authoritative implementation,
build, release, and published-artifact state. This content foundation does not
add D1, R2, or an editorial API.

Editorial changes use the repository's ordinary Git workflow. The Portal reads
the Markdown content during development and build; it does not provide a CMS or
editorial publishing authority.

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
