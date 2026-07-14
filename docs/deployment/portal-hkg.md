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

The public hostname for the Portal is `owbastion.codes`. The platform API is
served at `api.owbastion.codes` and is not part of this Compose deployment.

The Portal container sets `NUXT_PUBLIC_API_BASE_URL=https://api.owbastion.codes`.
The Worker allows credentialed browser requests only from `https://owbastion.codes`.
For local browser development, run the Worker with `PORTAL_ORIGIN=http://localhost:3000`;
the Portal defaults to `http://localhost:8787` and the API omits the `Secure`
cookie attribute for that HTTP origin.

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
outside the repository. The Tunnel must route `owbastion.codes` to the Portal's
server-local HTTP endpoint, normally `http://127.0.0.1:3000`.

## Local verification

Build and start the Portal from the repository root:

```bash
rtk docker compose up --build -d
rtk docker compose ps
rtk curl http://127.0.0.1:3000/health
```

The expected health response is:

```json
{"service":"portal","status":"ok"}
```

Stop it with:

```bash
rtk docker compose down
```

The `PORTAL_PORT` environment variable may change the loopback port used by
the host, while the container continues to listen on port `3000`.

## HKG operations

Before the first rollout, the server operator must:

1. install and authenticate `cloudflared` outside this repository;
2. configure the Tunnel hostname `owbastion.codes` to reach the chosen local
   Portal port;
3. confirm that no public firewall rule exposes the Portal port directly;
4. verify the Tunnel's public HTTPS request and the local `/health` response.

For an update, build the new image, recreate the Portal service, and verify
`/health` before considering the rollout complete. For a rollback, redeploy
the previous Git revision and repeat the same health check. Tunnel credentials
and DNS changes are not part of either operation.

## Failure boundary

If the Portal container is unhealthy, Docker restarts it and the Tunnel may
return an origin-unavailable response. This does not change API or D1 state.
The Portal must not become a second business API or a durable source of truth.
