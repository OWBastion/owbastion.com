import { describe, expect, it } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import { createApp, type RuntimeEnv } from "./app";

const auth = async () => ({ actorType: "service" as const, subject: "qqbot", roles: ["channel:write"], provider: "test" });

const services: PlatformServices = {
  createBinding: async () => ({ contractVersion: "1", bindingId: "00000000-0000-0000-0000-000000000001", identityId: "00000000-0000-0000-0000-000000000002", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }),
  createSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "evidence_pending", mapName: "Test Map", attachmentIds: ["00000000-0000-0000-0000-000000000004"] }),
  getSubmission: async () => ({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 1, updatedAt: 1 }),
};

const app = createApp({
  authenticate: auth,
  services: () => services,
});

const env = {} as RuntimeEnv;

describe("API", () => {
  it("reports health without external services", async () => {
    const response = await app.request("http://localhost/health", {}, env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "api", status: "ok" });
  });

  it("validates and authenticates binding creation", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "idempotency-key": "binding-1", "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(201);
    expect((await response.json() as { provider: string }).provider).toBe("qq");
  });

  it("rejects requests without an idempotency key", async () => {
    const response = await app.request("http://localhost/v1/qq/bindings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contractVersion: "1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", playerName: "Player", playerId: "1234" }) }, env);
    expect(response.status).toBe(422);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("returns only public submission status fields", async () => {
    const response = await app.request("http://localhost/v1/submissions/00000000-0000-0000-0000-000000000003");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ contractVersion: "1", submissionId: "00000000-0000-0000-0000-000000000003", status: "ocr_pending", mapName: "Test Map", createdAt: 1, updatedAt: 1 });
  });
});
