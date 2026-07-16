# Public Portal on HKG

## Scope

The public Portal is deployed to the HKG server as the `portal` service in the
repository's Docker Compose configuration. The Hono API, D1, queues, R2, and
future administrative surfaces remain separate platform components.

The intended request path is:

```text
visitor
  → Cloudflare Edge TLS
  → server-managed cloudflared Tunnel
  → HKG loopback port 3000
  → portal container
```

The public hostname for the Portal is `owbastion.com`. The platform API is
served at `api.owbastion.com` and is not part of this Compose deployment.

The Portal container sets `NUXT_PUBLIC_API_BASE_URL=https://api.owbastion.com`.
The Worker allows credentialed browser requests only from `https://owbastion.com`.
For local browser development, run the Worker with `PORTAL_ORIGIN=http://localhost:3000`;
the Portal defaults to `http://localhost:8787` and the API omits the `Secure`
cookie attribute for that HTTP origin.

Portal browser requests use the same-origin Nuxt `/api/portal/*` proxy. The
Nuxt server forwards the incoming session cookie to the Worker and relays the
Worker's session cookie back to the browser. `NUXT_PUBLIC_API_BASE_URL` is a
server-side upstream setting; browser authentication must not bypass the
Portal proxy with direct cross-origin requests.

## Repository boundary

This repository contains:

- the Nuxt Portal application;
- its Dockerfile;
- `compose.yaml`, which runs only the Portal container;
- this deployment contract and operational checklist.

This repository does not contain:

- `cloudflared` or a Tunnel service;
- Tunnel tokens, Cloudflare account identifiers, DNS records, or Access rules;
- production server addresses or credentials;
- a public origin listener.

The server operator owns the Tunnel installation and injects its configuration
outside the repository. The Tunnel must route `owbastion.com` to the Portal's
server-local HTTP endpoint, normally `http://127.0.0.1:3000`.

## CI image publishing

GitHub Actions builds the Portal image after the checks pass on `main` and
publishes it to the public GitHub Container Registry package. The workflow
runs only when `apps/portal`, shared packages, shared pnpm/TypeScript/Vitest
build inputs, or the Portal workflow itself changes; API-only, migration, and
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
rtk docker build -f apps/portal/Dockerfile -t owbastion-portal:local .
rtk docker run -d --name portal-local -p 127.0.0.1:3000:3000 owbastion-portal:local
rtk curl http://127.0.0.1:3000/health
```

The expected health response is:

```json
{"service":"portal","status":"ok"}
```

Stop it with:

```bash
rtk docker rm -f portal-local
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
rtk docker compose pull portal
rtk docker compose up -d --wait portal
rtk docker compose ps
rtk curl http://127.0.0.1:3000/health
```

If the health check fails, inspect the container logs and restore the previous
known-good commit tag:

```bash
export PORTAL_IMAGE_TAG=sha-<previous-commit>
rtk docker compose pull portal
rtk docker compose up -d --wait portal
rtk curl http://127.0.0.1:3000/health
```

Tunnel credentials and DNS changes are not part of either operation.

## Failure boundary

If the Portal container is unhealthy, Docker restarts it and the Tunnel may
return an origin-unavailable response. This does not change API or D1 state.
The Portal must not become a second business API or a durable source of truth.
