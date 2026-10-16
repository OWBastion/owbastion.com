# Public Portal deployment

## Scope

The public Portal runs on the `owbastion-com` Cloudflare Worker with Workers
Static Assets at `owbastion.com`. Cloudflare Workers Builds connects directly
to this repository and owns Portal deployment. The Hono API remains a separate
Worker at `api.owbastion.com`; D1, R2, queues, QQBot, and OCRKit retain their
existing ownership and hosting boundaries.

```text
visitor
  → owbastion.com
  → owbastion-com Worker
  → Static Assets for prerendered/public files
  → same-origin Nuxt API proxy
  → api.owbastion.com Worker for business/authenticated data
```

The repository owns `apps/portal/wrangler.jsonc`, application code, and CI
validation. Cloudflare owns the Git connection, custom-domain attachment,
build settings, and deployment credentials. HKG is no longer a Portal origin;
this repository does not publish Portal Docker images or deploy over SSH.

`NUXT_PUBLIC_API_BASE_URL=https://api.owbastion.com` selects the server-side
upstream. Browser authentication continues through the same-origin Nuxt
`/api/portal/*` proxy, which relays session cookies. Do not bypass it with
cross-origin browser authentication requests. The API remains the owner of
business state and authorization.

## Cloudflare Worker build and preview

The Worker build uses the Nitro `cloudflare_module` preset:

```bash
pnpm --filter @owbastion/portal run build:worker
```

This produces `.output/server/index.mjs` (the Worker entry configured as
`main` in `wrangler.jsonc`) and `.output/public/` (Static Assets directory).
Prerendered editorial pages, `index.html` shells, and public files are served
from assets; dynamic and authenticated routes execute in the Worker.

Preview the Worker locally with Miniflare:

```bash
pnpm --filter @owbastion/portal run preview:worker
```

Static Assets use `html_handling: drop-trailing-slash`, keeping the existing
slashless URLs (`/blog`, `/changelog/26.0801.1`) canonical; the trailing-slash
form redirects to it.

Deploy the Portal Worker with:

```bash
pnpm --filter @owbastion/portal run deploy:worker
```

Every deploy produces an immutable, identifiable Worker version; `wrangler
rollback` or the dashboard restores a previous version. The custom-domain
attachment for `owbastion.com` is managed in Cloudflare.
When enabled, `workers.dev` also exposes the Worker for direct checks.

## Cloudflare Workers Builds Git integration

Cloudflare Workers Builds owns automatic Portal Worker deployment. GitHub
Actions runs `validate-portal.yml`, including `build:worker`. It does not
publish a Portal Worker or container image. The API Worker keeps its
existing deployment workflow.

In Cloudflare **Workers & Pages**, connect `OWBastion/owbastion.com` to the
`owbastion-com` Worker. For an existing Worker, open **Settings >
Build** and connect the repository there. Configure:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `apps/portal` |
| Build command | `pnpm run build:worker` |
| Deploy command | `pnpm run deploy:worker` |
| Preview command | `pnpm exec wrangler preview --config wrangler.jsonc` |
| Build variable `NODE_VERSION` | `26` (matches the repository Node engine) |
| Build variable `PNPM_VERSION` | `11.11.0` (matches the root `package.json`'s `packageManager`) |
| Build variable `NODE_OPTIONS` | `--max-old-space-size=4096` (initial heap budget for prerendering) |

Keep automatic dependency installation enabled. Cloudflare clones the whole
repository; `apps/portal` selects the working directory for build and deploy
commands. pnpm discovers the parent `pnpm-workspace.yaml` and shared lockfile,
so workspace dependencies remain available. From this directory, the deploy
script selects `apps/portal/wrangler.jsonc`, not the root API `wrangler.toml`.

Set these variables under **Settings > Build > Build Variables and Secrets**,
including for preview builds when enabled. `NODE_OPTIONS` raises the build
process heap budget after a prerenderer heap-exhaustion failure; verify a
successful Cloudflare build before treating that budget as sufficient.

Set **Build watch paths** to include `apps/portal/*`, `packages/*`,
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, and `tsconfig.json`.
These watch paths are relative to the repository root. Shared package changes
must trigger Portal builds too.

Cloudflare manages the Git connection and build deployment token. GitHub's
Cloudflare secrets remain available for the API deployment; do not remove
or copy them for this integration. Runtime settings stay in
`apps/portal/wrangler.jsonc`; build variables are separate from runtime
variables and secrets.

Enable preview builds for non-production branches when branch previews are
needed. Configure their required upstream variables in Cloudflare's Preview
settings; Worker Previews use separate settings from the deployed Worker.
Preview URLs are for review, and production-domain login semantics still
require verification on `owbastion.com`.

Protect `main` with the required GitHub CI checks before merging. Workers
Builds reacts to commits on its configured branch independently of GitHub
Actions; it does not wait for the post-merge GitHub workflow. A successful
production-branch build updates the Worker serving its configured domains.
Merging repository changes alone does not create the Cloudflare Git connection.

See Cloudflare's [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
and [watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).

## Verification and rollback

After a deployment, record its Worker version and verify the production paths:

- Anonymous Blog/Changelog list/detail reads, canonical/SEO, and unknown-slug 404s.
- QQ and Passkey login on `owbastion.com`, authenticated reads, and logout.
- Administrator denial and authorized writes, screenshot uploads, and API proxy errors.

A successful build, deploy, or health response does not establish that those
business paths work. Preview hostnames do not prove production WebAuthn RP ID
and Origin behavior.

Use Cloudflare's Worker version rollback to restore a known-good version.
For a lasting correction, revert the source change through a PR so the next
Workers Build also deploys the corrected source. The old HKG container is not
part of the automatic deployment or rollback path. Retained host artifacts and
unrelated Tunnel services are managed separately by the server operator.
