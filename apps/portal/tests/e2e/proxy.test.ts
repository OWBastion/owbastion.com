import { resolve } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { $fetch, setup } from "@nuxt/test-utils/e2e";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const outputDir = resolve(rootDir, ".output");
const testPort = process.env.NUXT_TEST_PORT ? Number(process.env.NUXT_TEST_PORT) : undefined;

type Seen = { method?: string; url?: string; cookie?: string; idempotencyKey?: string; body: string };
let seen: Seen[] = [];

/** Built-server check that the browser clients' request paths reach the intended upstream routes. */
describe("Portal API proxies", async () => {
  const upstream = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      seen.push({ method: request.method, url: request.url, cookie: request.headers.cookie, idempotencyKey: request.headers["idempotency-key"] as string | undefined, body: Buffer.concat(chunks).toString() });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ contractVersion: "1", items: [] }));
    });
  });
  await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", resolveListen));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("Portal test API did not start");
  process.env.NUXT_PUBLIC_API_BASE_URL = `http://127.0.0.1:${address.port}`;

  await setup({
    rootDir,
    build: false,
    server: true,
    browser: false,
    nuxtConfig: { nitro: { output: { dir: outputDir } } },
    port: testPort,
    setupTimeout: 240_000,
    serverStartTimeout: 120_000,
  });

  afterAll(async () => {
    await new Promise<void>((resolveClose, reject) => upstream.close((error) => error ? reject(error) : resolveClose()));
  });
  beforeEach(() => { seen = []; });

  it("maps the admin client path /api/admin/v1/* to /v1/admin/* with query, cookie, and body", async () => {
    await $fetch("/api/admin/v1/players?limit=5&q=a%20b", { headers: { cookie: "portal_session=admin" } });
    await $fetch("/api/admin/v1/reviews/submission.1/decision", { method: "POST", headers: { cookie: "portal_session=admin", "idempotency-key": "key-1" }, body: { decision: "approved" } });
    await $fetch("/api/admin/v1/binding-invites/invite.1", { method: "DELETE" });

    expect(seen.map(({ method, url }) => [method, url])).toEqual([
      ["GET", "/v1/admin/players?limit=5&q=a%20b"],
      ["POST", "/v1/admin/reviews/submission.1/decision"],
      ["DELETE", "/v1/admin/binding-invites/invite.1"],
    ]);
    expect(seen[0]!.cookie).toBe("portal_session=admin");
    expect(seen[1]).toMatchObject({ cookie: "portal_session=admin", idempotencyKey: "key-1" });
    expect(JSON.parse(seen[1]!.body)).toEqual({ decision: "approved" });
    expect(seen[2]!.body).toBe("");
  });

  it("maps the player client path /api/portal/v1/* to /v1/* with query, cookie, and body", async () => {
    await $fetch("/api/portal/v1/me/submissions?limit=3", { headers: { cookie: "portal_session=player" } });
    await $fetch("/api/portal/v1/me/reviews/event.1", { method: "PUT", headers: { cookie: "portal_session=player", "idempotency-key": "key-2" }, body: { rating: 5 } });

    expect(seen.map(({ method, url }) => [method, url])).toEqual([
      ["GET", "/v1/me/submissions?limit=3"],
      ["PUT", "/v1/me/reviews/event.1"],
    ]);
    expect(seen[0]!.cookie).toBe("portal_session=player");
    expect(seen[1]).toMatchObject({ cookie: "portal_session=player", idempotencyKey: "key-2" });
    expect(JSON.parse(seen[1]!.body)).toEqual({ rating: 5 });
  });
});
