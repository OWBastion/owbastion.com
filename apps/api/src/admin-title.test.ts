import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import type { AdminTitleSummary, AdminTitleChallenge } from "@owbastion/contracts";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const title: AdminTitleSummary = { titleKey: "MULTI", label: "多路径", icon: "trophy", iconUrl: null, category: "测试", scope: "global", displayKind: "fixed", color: null, publicVisibility: true, lifecycle: "draft", gameVersion: null, developerOnly: false, status: "draft", acquisition: { kind: "none" } };
const challenge: AdminTitleChallenge = { challengeId: "title.MULTI.random", titleKey: "MULTI", family: "achievement", type: "title_achievement", kind: "title_achievement", titleName: "多路径", icon: "trophy", category: "测试", categoryOverride: null, condition: "完成", evidenceRule: "截图", submissionMode: "manual", status: "draft", gameVersion: null, introducedVersion: null, retiredVersion: null, startsAt: null, endsAt: null, mapIds: [], replacedByChallengeId: null };
const titleBody = { contractVersion: "1", titleKey: "MULTI", label: "多路径", icon: "trophy", category: "测试", scope: "global", displayKind: "fixed", publicVisibility: true };
const challengeBody = { contractVersion: "1", condition: "完成", submissionMode: "manual", status: "active", enableTitle: true };
const editBody = { contractVersion: "1", family: "achievement", saveMode: "in_place", condition: "完成", evidenceRule: "截图", submissionMode: "manual", status: "active", categoryOverride: null };
const lifecycleBody = { contractVersion: "1", status: "active", retiredVersion: null, startsAt: null, endsAt: null };
const endpoints = [
  ["GET", "/v1/admin/title-summaries", undefined],
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
  it.each(endpoints.filter(([method]) => method !== "GET"))("requires an idempotency key for %s %s", async (method, path, body) => {
    expect((await request(makeApp({}), method, path, body)).status).toBe(422);
  });
  it("forwards split writes, inferred achievement family and null lifecycle fields", async () => {
    const writes: unknown[] = [];
    const app = makeApp({
      listAdminTitleSummaries: async () => ({ contractVersion: "1", items: [title] }),
      listAdminTitleChallenges: async () => ({ contractVersion: "1", items: [challenge] }),
      createAdminTitle: async (input, auth, key) => { writes.push({ input, actor: auth.subject, key }); return { contractVersion: "1", ...title }; },
      createAdminTitleChallenge: async (input, auth, key) => { writes.push({ input, actor: auth.subject, key }); return { contractVersion: "1", ...challenge }; },
      updateAdminChallenge: async (input, auth, key) => { writes.push({ input, actor: auth.subject, key }); return challenge; },
      updateAdminChallengeLifecycle: async (input, auth, key) => { writes.push({ input, actor: auth.subject, key }); return { contractVersion: "1", challenge, previous: { status: "draft", retiredVersion: null, startsAt: null, endsAt: null } }; },
      updateAdminCatalogTitle: async (input, auth, key) => { writes.push({ input, actor: auth.subject, key }); return { contractVersion: "1", title, previousLifecycle: "draft" }; },
    });
    expect(await (await request(app, "GET", "/v1/admin/title-summaries", undefined)).json()).toEqual({ contractVersion: "1", items: [title] });
    expect(await (await request(app, "GET", "/v1/admin/titles/MULTI/challenges", undefined)).json()).toEqual({ contractVersion: "1", items: [challenge] });
    expect((await request(app, "POST", "/v1/admin/titles", titleBody, "title")).status).toBe(201);
    expect((await request(app, "POST", "/v1/admin/titles/MULTI/challenges", challengeBody, "challenge")).status).toBe(201);
    const { family: _, ...inferredEdit } = editBody;
    expect((await request(app, "PUT", "/v1/admin/achievements/title.MULTI.random", inferredEdit, "edit")).status).toBe(200);
    const lifecycle = await request(app, "PUT", "/v1/admin/achievements/title.MULTI.random/lifecycle", lifecycleBody, "lifecycle");
    expect(await lifecycle.json()).toMatchObject({ contractVersion: "1", previous: { status: "draft", startsAt: null } });
    const enabled = await request(app, "PUT", "/v1/admin/titles/MULTI", { contractVersion: "1", lifecycle: "active" }, "enable");
    expect(enabled.status).toBe(200);
    expect(await enabled.json()).toMatchObject({ contractVersion: "1", previousLifecycle: "draft" });
    expect(writes).toMatchObject([
      { input: titleBody, actor: "admin", key: "title" },
      { input: { ...challengeBody, titleKey: "MULTI" }, key: "challenge" },
      { input: { ...editBody, challengeId: challenge.challengeId }, key: "edit" },
      { input: { ...lifecycleBody, challengeId: challenge.challengeId }, key: "lifecycle" },
      { input: { lifecycle: "active", titleKey: "MULTI" }, key: "enable" },
    ]);
    expect((await request(app, "PUT", "/v1/admin/achievements/title.MULTI.random", { ...editBody, saveMode: undefined }, "no-mode")).status).toBe(422);
    expect((await request(app, "PUT", "/v1/admin/achievements/title.MULTI.random", { ...editBody, scope: "global" }, "scope")).status).toBe(422);
  });
  it.each([
    ["POST", "/v1/admin/titles", titleBody, "createAdminTitle", "TITLE_KEY_CONFLICT", 409],
    ["GET", "/v1/admin/titles/MULTI/challenges", undefined, "listAdminTitleChallenges", "TITLE_NOT_FOUND", 404],
    ["POST", "/v1/admin/titles/MULTI/challenges", challengeBody, "createAdminTitleChallenge", "TITLE_NOT_FOUND", 404],
    ["POST", "/v1/admin/titles/MULTI/challenges", challengeBody, "createAdminTitleChallenge", "TITLE_MANAGED_BY_MAP_RULE", 409],
    ["POST", "/v1/admin/titles/MULTI/challenges", challengeBody, "createAdminTitleChallenge", "INVALID_MAP_SCOPE", 422],
    ["PUT", "/v1/admin/achievements/title.MULTI.random", editBody, "updateAdminChallenge", "CHALLENGE_QUALIFICATION_CHANGED", 422],
    ["PUT", "/v1/admin/titles/MULTI", { contractVersion: "1", lifecycle: "active", scope: "map" }, "updateAdminCatalogTitle", "TITLE_SCOPE_LOCKED", 422],
  ] as const)("maps %s %s error %s", async (method, path, body, service, code, status) => {
    const response = await request(makeApp({ [service]: async () => { throw new Error(code); } }), method, path, body, "error");
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ contractVersion: "1", error: { code, requestId: expect.any(String) } });
  });
});
