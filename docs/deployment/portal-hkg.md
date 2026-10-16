# Public Portal deployment

## Scope

The public Portal is being migrated from the HKG Docker/Cloudflare Tunnel
origin to a Cloudflare Worker with Workers Static Assets. The Hono API, D1,
queues, R2, and other platform components remain separate; `api.owbastion.com`
is not part of either Portal deployment path.

The two origins are:

```text
current (pre-cutover):
visitor
  → Cloudflare Edge TLS
  → server-managed cloudflared Tunnel
  → HKG loopback port 3000
  → portal container (Node 26 Nuxt SSR)

target (post-cutover):
visitor
  → Cloudflare Edge TLS
  → owbastion-codes-portal Worker (Nitro cloudflare_module)
  → Static Assets for prerendered/public files
```

The public hostname for the Portal is `owbastion.com`. The Worker origin is
preview-only until an explicitly authorized cutover attaches the custom domain;
`wrangler.jsonc` intentionally ships without production routes.

The Portal sets `NUXT_PUBLIC_API_BASE_URL=https://api.owbastion.com` in both
origins. The API Worker allows credentialed browser requests only from
`https://owbastion.com`. For local browser development, run the Worker with
`PORTAL_ORIGIN=http://localhost:3000`; the Portal defaults to
`http://localhost:8787` and the API omits the `Secure` cookie attribute for
that HTTP origin.

Portal browser requests use the same-origin Nuxt `/api/portal/*` proxy. The
Nuxt server forwards the incoming session cookie to the API Worker and relays
the session cookie back to the browser. `NUXT_PUBLIC_API_BASE_URL` is a
server-side upstream setting; browser authentication must not bypass the
Portal proxy with direct cross-origin requests.

## Repository boundary

This repository contains:

- the Nuxt Portal application;
- `apps/portal/wrangler.jsonc`, the Cloudflare Workers + Static Assets
  deployment configuration;
- its Dockerfile and `compose.yaml`, which run only the Portal container on
  HKG until the cutover cleanup;
- this deployment contract and operational checklist.

This repository does not contain:

- `cloudflared` or a Tunnel service;
- Tunnel tokens, Cloudflare account identifiers, DNS records, or Access rules;
- production server addresses or credentials;
- a public origin listener.

The server operator owns the Tunnel installation and injects its configuration
outside the repository. The Tunnel routes `owbastion.com` to the Portal's
server-local HTTP endpoint, normally `http://127.0.0.1:3000`, until cutover.

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

Deploys go to `owbastion-codes-portal.<account>.workers.dev`:

```bash
pnpm --filter @owbastion/portal run deploy:worker
```

Every deploy produces an immutable, identifiable Worker version; `wrangler
rollback` or the dashboard restores a previous version. The workers.dev
surface is a preview origin only — `owbastion.com` traffic is unaffected until
the custom-domain route is added under an authorized cutover.

## Cloudflare Workers Builds Git integration

Cloudflare Workers Builds owns automatic Portal Worker deployment. GitHub
Actions keeps the Portal validation jobs, including `build:worker`, and the
HKG image/Compose deployment until cutover acceptance. It does not publish
the Portal Worker. The API Worker keeps its existing deployment workflow.

In Cloudflare **Workers & Pages**, connect `OWBastion/owbastion.com` to the
`owbastion-codes-portal` Worker. For an existing Worker, open **Settings >
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
require the cutover verification below.

Protect `main` with the required GitHub CI checks before merging. Workers
Builds reacts to commits on its configured branch independently of GitHub
Actions; it does not wait for the post-merge GitHub workflow. A successful
production-branch build updates the Worker's `workers.dev` origin until the
custom domain is attached. Merging repository changes alone does not create
the Cloudflare Git connection.

See Cloudflare's [build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/),
[build image](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/),
and [watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/).

## Cutover (requires explicit authorization)

Switching `owbastion.com` to the Portal Worker is a separately authorized
operation. The sequence:

1. Verify the workers.dev preview: anonymous Blog/Changelog list and detail
   pages (static assets), an authenticated page, an admin page, an unknown
   editorial slug (404), `/api/portal/*` proxying with credentials, and a
   screenshot upload boundary. WebAuthn/Passkey semantics on the preview
   hostname differ from `owbastion.com`; verify login flows in the final
   same-origin check below.
2. Add the custom-domain route to `apps/portal/wrangler.jsonc`:

   ```jsonc
   "workers_dev": false,
   "routes": [{ "pattern": "owbastion.com", "custom_domain": true }]
   ```

   Committing this change does not switch traffic by itself; the cutover is
   performed by deploying with it.
3. Deploy the Worker and confirm the custom domain activates (Cloudflare
   manages the DNS/TLS switch on the zone).
4. Verify production paths: `/health`, anonymous editorial reads,
   canonical/SEO metadata, QQ and Passkey login, authenticated reads, admin
   denial and writes, upload boundaries, and `/api/portal/*` proxying.
5. Record the deployed Worker version and production-path evidence.

Rollback before cleanup: remove the custom-domain route (redeploy) or restore
the Tunnel hostname on the HKG origin, which keeps serving the last deployed
`sha-<commit>` image.

Only after sustained accepted production validation is the superseded
HKG-only machinery removed: `publish-portal.yml` image publishing, the
Compose/SSH deploy job, `apps/portal/Dockerfile`, `compose.yaml`, the Tunnel
route, and unused secrets — without disturbing HKG services still hosting
QQBot/OCRKit.

## CI image publishing (pre-cutover path)

GitHub Actions builds the Portal image after the Portal checks pass on `main`
and publishes it to the public GitHub Container Registry package. The workflow
runs only when `apps/portal`, the root package-manager/build inputs, or the
Portal workflow itself changes. API-only, package, migration, tooling, and
documentation changes do not publish a Portal image:

```text
ghcr.io/owbastion/owbastion.codes-portal
```

Each commit receives an immutable `sha-<commit>` tag. The `latest` tag is also
updated for convenience; automatic production deployments use the immutable
commit tag, while manual deployments may select either tag.
The package must be set to public in the repository's GitHub Packages settings;
the HKG server then needs no GHCR pull credential.

After the image workflow succeeds on `main`, the Portal deployment workflow
connects to HKG over SSH and updates the `portal` Compose service to the
matching immutable `sha-<commit>` tag. The deployment uses the GitHub
`production` environment and these secrets:

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_KNOWN_HOSTS`
- `DEPLOY_PATH` (normally `/opt/owbastion-portal`)

The server operator must provide the SSH key's matching public key on the
server and keep the `SSH_KNOWN_HOSTS` value current. The workflow does not use
`ssh-keyscan` or change Tunnel credentials and DNS settings.

The deployment workflow also supports manual execution. Its `image_tag` input
defaults to `latest` and can be set to any already-published `sha-<commit>` tag.

## Image verification

Build the image locally from the repository root when validating the Dockerfile:

```bash
docker build -f apps/portal/Dockerfile -t owbastion-portal:local .
docker run -d --name portal-local -p 127.0.0.1:3000:3000 owbastion-portal:local
curl http://127.0.0.1:3000/health
```

The expected health response is:

```json
{"service":"portal","status":"ok"}
```

Stop it with:

```bash
docker rm -f portal-local
```

The `PORTAL_PORT` environment variable may change the loopback port used by
the host, while the container continues to listen on port `3000`.

## HKG operations

Before the first rollout, the server operator must:

1. install and authenticate `cloudflared` outside this repository;
2. configure the Tunnel hostname `owbastion.com` to reach the chosen local
   Portal port;
3. confirm that no public firewall rule exposes the Portal port directly;
4. verify the Tunnel's public HTTPS request and the local `/health` response.

For an update, set the published commit tag, pull that image, recreate the
Portal service, and verify `/health`:

```bash
export PORTAL_IMAGE_TAG=sha-<commit>
docker compose pull portal
docker compose up -d --wait portal
docker compose ps
curl http://127.0.0.1:3000/health
```

If the health check fails, inspect the container logs and restore the previous
known-good commit tag:

```bash
export PORTAL_IMAGE_TAG=sha-<previous-commit>
docker compose pull portal
docker compose up -d --wait portal
curl http://127.0.0.1:3000/health
```

Tunnel credentials and DNS changes are not part of either operation.

## Failure boundary

If the Portal container is unhealthy, Docker restarts it and the Tunnel may
return an origin-unavailable response. A Portal Worker failure surfaces as an
error page or the Workers error response. Neither changes API or D1 state.
The Portal must not become a second business API or a durable source of truth.
