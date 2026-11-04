import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const titleBody = { contractVersion: "1", titleKey: "MULTI", label: "多路径", icon: "trophy", category: "测试", scope: "global", displayKind: "fixed", publicVisibility: true };
const challengeBody = { contractVersion: "1", condition: "完成", submissionMode: "manual", status: "active", enableTitle: true };
const editBody = { contractVersion: "1", family: "achievement", saveMode: "in_place", condition: "完成", evidenceRule: "截图", submissionMode: "manual", status: "active", categoryOverride: null };
const lifecycleBody = { contractVersion: "1", status: "active", retiredVersion: null, startsAt: null, endsAt: null };
const endpoints = [
  ["GET", "/v1/admin/title-summaries", undefined],
  ["GET", "/v1/admin/title-images", undefined],
  ["GET", "/v1/admin/titles/MULTI/challenges", undefined],
  ["POST", "/v1/admin/titles", titleBody],
  ["POST", "/v1/admin/titles/MULTI/challenges", challengeBody],
  ["PUT", "/v1/admin/achievements/title.MULTI.random", editBody],
  ["PUT", "/v1/admin/achievements/title.MULTI.random/lifecycle", lifecycleBody],
  ["PUT", "/v1/admin/titles/MULTI", { contractVersion: "1", lifecycle: "draft" }],
] as const;
const makeApp = (services: Partial<PlatformServices>, authenticate = async () => maintainer as typeof maintainer | null) => createApp({ services: () => services as PlatformServices, authenticate });
const request = (app: ReturnType<typeof createApp>, method: string, path: string, body: unknown, key?: string) => app.request(`http://localhost${path}`, { method, headers: { "content-type": "application/json", ...(key ? { "idempotency-key": key } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }, env);

describe("admin title HTTP contract", () => {
  it.each(endpoints)("protects %s %s with maintainer authorization and private caching", async (method, path, body) => {
    for (const [authenticate, status] of [[async () => null, 401], [async () => ({ ...maintainer, roles: [] }), 403]] as const) {
      const response = await request(makeApp({}, authenticate), method, path, body, "key");
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });
});

describe("admin title image listing", () => {
  const bucket = (objects: string[]) => ({ list: async ({ prefix, cursor }: { prefix: string; cursor?: string }) => cursor
    ? { objects: [{ key: "achievements/b.webp" }], truncated: false }
    : { objects: objects.filter((key) => key.startsWith(prefix)).map((key) => ({ key })), truncated: true, cursor: "next" } }) as unknown as R2Bucket;
  it("lists only png and webp files directly under achievements/ across pages", async () => {
    const withBucket = { ASSETS_BUCKET: bucket(["achievements/a.png", "achievements/sub/x.png", "achievements/readme.txt", "evidence/secret.png"]), ASSETS_PUBLIC_ORIGIN: "https://cdn.example/" } as unknown as RuntimeEnv;
    const response = await makeApp({}).request("http://localhost/v1/admin/title-images", {}, withBucket);
    expect(await response.json()).toEqual({ contractVersion: "1", items: [{ name: "a.png", url: "https://cdn.example/achievements/a.png" }, { name: "b.webp", url: "https://cdn.example/achievements/b.webp" }] });
  });
});
