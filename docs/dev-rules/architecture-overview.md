# Architecture Overview

TypeScript workspace: Hono Cloudflare Worker API (`apps/api`), Nuxt Portal
(`apps/portal`, its own Worker with Static Assets, deployed by Workers Builds:
[portal-cloudflare.md](../deployment/portal-cloudflare.md)), shared
`contracts`/`domain`/`database`/`auth` packages, forward-only D1 migrations.
R2 holds private evidence; Queue consumers run async work. Deployment config is
not evidence of a live environment; verify operational state separately.

## Ownership

| Repository | Owns |
| --- | --- |
| `OWBastion/owbastion.com` | Event, map, title, challenge metadata; business state; API; Portal; evidence policy; review; Grants |
| `OWBastion/Bastion` | Game implementation, builds, releases, generated data |
| `OWBastion/qqbot` | QQ ingress, deterministic commands, notifications |
| `OWBastion/ocrkit` | Stateless screenshot recognition, model lifecycle |

Bastion reads validated platform metadata through the Agents API (platform-enabled
map revision projections and revision-owned spatial inputs). The platform never
edits Bastion artifacts or orchestrates Bastion/GitHub changes.

## Principles

1. One authoritative owner per fact.
2. Keep metadata, game implementation, business state, and caches distinct.
3. Side effects are idempotent and auditable.
4. Enforce public / player-private / reviewer / developer / maintainer
   boundaries at the API, not the UI.
5. Version external contracts.
6. Add async workers only when an implemented responsibility needs them.

## Surfaces

- **Portal** renders; it owns no durable state. Admin requests go through the
  server-side `/api/portal/*` proxy that forwards the session cookie.
- **API** is the canonical business API plus read-only Agents projections, which
  omit account, submission, review-source, and audit data.
- **Evidence** is private platform data ([data-and-security.md](data-and-security.md)).
- Catalog admin (titles, challenges, events, maps) edits platform metadata only;
  Bastion consumes it as build input.

## Portal routes

A page file plus a same-named directory of pages is one parent route; the child
renders only if the parent includes `<NuxtPage />`. Model a collection with a
dynamic detail/editor as a directory (`maps/index.vue`, `maps/[mapId].vue`).
Use a parent `.vue` only when it owns a nested layout. Each new collection/detail
pair needs a route-view test that mounts the concrete dynamic URL.

## Editorial content

Blog and Changelog Markdown live in `apps/portal/content/` and are compiled at
build time by `modules/editorial.ts` (`@nuxtjs/mdc`, Zod schemas in
`content/editorial-schemas.ts`) into gitignored `.generated/editorial/` JSON that
`utils/editorial-content.ts` serves. Routes are prerendered; no parser, raw
Markdown, runtime database, CMS, or editorial API ships. Edits use the normal Git
workflow. Changelog entries describe released changes; Blog may describe work in
progress. Editorial metadata never replaces D1 facts or Bastion release state.
