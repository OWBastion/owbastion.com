import { describe, expect, it } from "vitest";
import type { Authenticator, PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const env = {} as RuntimeEnv;
const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });
const authenticateAsMaintainer = async () => ({ actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" });
const anonymousAuth = async () => null;
const createTestApp = (overrides: Partial<PlatformServices> = {}, authenticate: Authenticator<RuntimeEnv> = auth) => createApp({
  authenticate,
  services: () => overrides as PlatformServices,
  turnstile: async () => undefined,
});
const app = createTestApp();

describe("admin achievement routes", () => {
  it("limits achievement management to maintainers and validates lifecycle updates", async () => {
    const updates: unknown[] = [];
    const catalogUpdates: unknown[] = [];
    const adminApp = createTestApp({
      listAdminChallenges: async ({ family, status }) => ({ contractVersion: "1", items: family === "achievement" && status === "active" ? [{ challengeId: "title.flawless", family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: "极限操作系列", categoryOverride: null, condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", gameVersion: "2026.07.15", status: "active", submissionMode: "manual", introducedVersion: "2026.07.15", retiredVersion: null }] : family === undefined ? [{ challengeId: "title.INTERNAL", family: "title_catalog", type: "title_catalog", titleKey: "INTERNAL", titleName: "内部称号", icon: "wrench", category: "开发保留", condition: "开发/管理用途。", lifecycle: "active", publicVisibility: true, availability: "active", scope: "global", displayKind: "fixed", gameVersion: "2026.07.15", hasChallenge: false }] : [] }),
      updateAdminChallenge: async (input) => { if (input.family !== "achievement") throw new Error("CHALLENGE_NOT_FOUND"); updates.push(input); return { challengeId: input.challengeId, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: "FLAWLESS", titleName: "完美无缺", icon: "zap", category: input.categoryOverride ?? "极限操作系列", categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: "2026.07.15", status: input.status, submissionMode: input.submissionMode, introducedVersion: "2026.07.15", retiredVersion: input.status === "active" ? input.retiredVersion ?? null : null } as const; },
      updateAdminCatalogTitle: async (input) => { catalogUpdates.push(input); return { contractVersion: "1", previousLifecycle: "active", title: { titleKey: input.titleKey, label: "内部称号", icon: "wrench", iconUrl: null, category: "开发保留", scope: "global", displayKind: "fixed", color: null, publicVisibility: true, lifecycle: input.lifecycle ?? "active", gameVersion: null, developerOnly: true, holderCount: 0, status: "ended", acquisition: { kind: "none" } } }; },
    }, authenticateAsMaintainer);
    expect((await app.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(403);
    const anonymousApp = createTestApp({}, anonymousAuth);
    expect((await anonymousApp.request("http://localhost/v1/admin/achievements", {}, env)).status).toBe(401);
    const listed = await adminApp.request("http://localhost/v1/admin/achievements?type=title_achievement&status=active", {}, env);
    expect(listed.status).toBe(200);
    expect(listed.headers.get("cache-control")).toBe("private, no-store");
    const denied = await app.request("http://localhost/v1/admin/achievements", {}, env);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
    expect(await listed.json()).toMatchObject({ items: [{ family: "achievement", categoryOverride: null }] });
    const retirement = { contractVersion: "1", saveMode: "in_place", condition: "单局跳过英雄次数为 0 且通关。", evidenceRule: "完整截图", submissionMode: "manual", categoryOverride: "极限操作系列", status: "archived" };
    expect((await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(retirement) }, env)).status).toBe(422);
    const updated = await adminApp.request("http://localhost/v1/admin/achievements/title.flawless", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "achievement-1" }, body: JSON.stringify(retirement) }, env);
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ challengeId: "title.flawless", family: "achievement", status: "archived", retiredVersion: null });
    expect(updates).toMatchObject([{ challengeId: "title.flawless", status: "archived" }]);
    const catalog = await adminApp.request("http://localhost/v1/admin/achievements", {}, env);
    expect(await catalog.json()).toMatchObject({ items: [{ family: "title_catalog", titleKey: "INTERNAL", hasChallenge: false }] });
    const titleStatus = await adminApp.request("http://localhost/v1/admin/titles/INTERNAL", { method: "PUT", headers: { "content-type": "application/json", "idempotency-key": "title-catalog-1" }, body: JSON.stringify({ contractVersion: "1", lifecycle: "draft" }) }, env);
    expect(titleStatus.status).toBe(200);
    expect(catalogUpdates).toMatchObject([{ titleKey: "INTERNAL", lifecycle: "draft" }]);
  });
});
