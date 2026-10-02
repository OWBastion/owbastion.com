import { afterEach, describe, expect, it, vi } from "vitest";
import { adminServiceTokenUpdateRequestSchema } from "@owbastion/contracts";
import { createPlatformServices } from "./index";
import { createD1 } from "./ocr-test-harness";

const admin = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const serviceId = "ocrkit-screenshot-sets" as const;
const token = "a".repeat(48);
const replacement = "b".repeat(48);
const setup = () => {
  const d1 = createD1();
  d1.sqlite.exec(`
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  const stored = new Map<string, string>();
  const get = vi.fn(async (key: string) => { const value = stored.get(key); return value ? JSON.parse(value) as unknown : null; });
  const put = vi.fn(async (key: string, value: string) => { stored.set(key, value); });
  const kv = { get, put } as unknown as KVNamespace;
  const services = () => createPlatformServices(d1.database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, kv);
  return { ...d1, stored, get, put, kv, services };
};
afterEach(() => vi.useRealTimers());

describe("internal service tokens", () => {
  it("restricts the supported token shape and never accepts unknown request fields", () => {
    expect(adminServiceTokenUpdateRequestSchema.safeParse({ contractVersion: "1", token }).success).toBe(true);
    for (const invalid of ["short", "x".repeat(257), " ".repeat(48), "a".repeat(32) + "\n"]) expect(adminServiceTokenUpdateRequestSchema.safeParse({ contractVersion: "1", token: invalid }).success).toBe(false);
    expect(adminServiceTokenUpdateRequestSchema.safeParse({ contractVersion: "1", token, unknown: true }).success).toBe(false);
  });

  it("restricts management to administrators and keeps credential data private across audit and replay", async () => {
    const state = setup();
    const services = state.services();
    for (const auth of [{ ...admin, roles: [] }, { ...admin, actorType: "service" as const }]) {
      await expect(services.listAdminServiceTokens(auth)).rejects.toThrow("FORBIDDEN");
      await expect(services.configureAdminServiceToken({ serviceId, token }, auth, "denied")).rejects.toThrow("FORBIDDEN");
    }
    expect(state.put).not.toHaveBeenCalled();
    const configured = await services.configureAdminServiceToken({ serviceId, token }, admin, "configure");
    expect(configured).toEqual({ serviceId, configured: true, updatedAt: expect.any(Number) });
    expect(await services.listAdminServiceTokens(admin)).toEqual({ contractVersion: "1", items: [configured] });
    expect(await services.authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(true);
    const persisted = JSON.stringify([...state.stored.values(), state.sqlite.prepare("SELECT * FROM idempotency_keys").all(), state.sqlite.prepare("SELECT * FROM audit_events").all()]);
    expect(persisted).not.toContain(token);
    expect(state.sqlite.prepare("SELECT operation FROM audit_events ORDER BY rowid").all()).toEqual([{ operation: "admin.service-token.configure.requested" }, { operation: "admin.service-token.configure.completed" }]);
    expect(await state.services().configureAdminServiceToken({ serviceId, token }, admin, "configure")).toEqual(configured);
    expect(state.put).toHaveBeenCalledTimes(1);
    await expect(services.configureAdminServiceToken({ serviceId, token: replacement }, admin, "configure")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("rotation and revocation prime new instances while successful old retries never restore old tokens", async () => {
    const state = setup();
    const services = state.services();
    await services.configureAdminServiceToken({ serviceId, token }, admin, "initial");
    await services.configureAdminServiceToken({ serviceId, token: replacement }, admin, "rotate");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${replacement}`)).toBe(true);
    await services.configureAdminServiceToken({ serviceId, token: null }, admin, "disable");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${replacement}`)).toBe(false);
    await services.configureAdminServiceToken({ serviceId, token }, admin, "initial");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.put).toHaveBeenCalledTimes(3);
  });

  it("bounds missing, invalid and concurrent candidate reads across service recreation and refreshes after 30 seconds", async () => {
    vi.useFakeTimers();
    const state = setup();
    for (const authorization of [undefined, "", "Basic token", "Bearer short", `Bearer ${token} `]) expect(await state.services().authenticateOcrkitSnapshot(authorization)).toBe(false);
    expect(state.get).not.toHaveBeenCalled();
    expect(await Promise.all(Array.from({ length: 80 }, (_, index) => state.services().authenticateOcrkitSnapshot(`Bearer ${String(index).padStart(48, "a")}`)))).toEqual(Array(80).fill(false));
    expect(state.get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_001);
    await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`);
    expect(state.get).toHaveBeenCalledTimes(2);
    await state.services().configureAdminServiceToken({ serviceId, token }, admin, "initial");
    vi.advanceTimersByTime(30_001);
    expect(await Promise.all(Array.from({ length: 40 }, () => state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)))).toEqual(Array(40).fill(true));
    expect(state.get).toHaveBeenCalledTimes(3);
    await Promise.all(Array.from({ length: 80 }, () => state.services().authenticateOcrkitSnapshot(`Bearer ${replacement}`)));
    expect(state.get).toHaveBeenCalledTimes(3);
    expect(new Set(state.get.mock.calls.map(([key]) => key)).size).toBe(1);
  });

  it("fails closed on malformed stored records and read failures with a bounded error cooldown", async () => {
    vi.useFakeTimers();
    const malformed = setup();
    malformed.get.mockResolvedValue({ tokenHash: token, updatedAt: Date.now() });
    expect(await malformed.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    await expect(malformed.services().listAdminServiceTokens(admin)).rejects.toThrow("SERVICE_TOKEN_STORE_UNAVAILABLE");
    const state = setup();
    state.get.mockRejectedValue(new Error("private storage failure"));
    await Promise.all(Array.from({ length: 40 }, () => state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)));
    expect(state.get).toHaveBeenCalledTimes(1);
    await expect(state.services().listAdminServiceTokens(admin)).rejects.toThrow("SERVICE_TOKEN_STORE_UNAVAILABLE");
    vi.advanceTimersByTime(4_999);
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.get).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`);
    expect(state.get).toHaveBeenCalledTimes(2);
  });

  it("records intent before KV and refuses incomplete retries even after a newer revocation", async () => {
    const state = setup();
    state.put.mockImplementationOnce(async () => {
      expect(state.sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys").get()).toEqual({ count: 1 });
      expect(state.sqlite.prepare("SELECT operation FROM audit_events").all()).toEqual([{ operation: "admin.service-token.configure.requested" }]);
      throw new Error("unavailable");
    });
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "failed")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    await state.services().configureAdminServiceToken({ serviceId, token: null }, admin, "disable");
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "failed")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(state.put).toHaveBeenCalledTimes(2);
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
  });

  it("never writes KV if the audit/idempotency intent transaction fails", async () => {
    const state = setup();
    state.sqlite.exec("DROP TABLE audit_events");
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "failed")).rejects.toThrow();
    expect(state.put).not.toHaveBeenCalled();
    expect(state.sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys").get()).toEqual({ count: 0 });
  });
  it("keeps an activated write visibly incomplete when completion auditing fails, without resurrecting it on replay", async () => {
    const state = setup();
    state.sqlite.exec(`CREATE TRIGGER fail_completed BEFORE INSERT ON audit_events WHEN NEW.operation = 'admin.service-token.configure.completed' BEGIN SELECT RAISE(FAIL, 'completion failed'); END;`);
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "incomplete")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(true);
    expect(state.sqlite.prepare("SELECT response_json FROM idempotency_keys").get()).toEqual({ response_json: '{"pending":true}' });
    state.sqlite.exec("DROP TRIGGER fail_completed");
    await state.services().configureAdminServiceToken({ serviceId, token: null }, admin, "disable");
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "incomplete")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.put).toHaveBeenCalledTimes(2);
  });

  it("an in-flight stale read cannot overwrite a successful rotation's local cache", async () => {
    const state = setup();
    let release!: (value: unknown) => void;
    state.get.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const authentication = state.services().authenticateOcrkitSnapshot(`Bearer ${token}`);
    await state.services().configureAdminServiceToken({ serviceId, token }, admin, "initial");
    release(null);
    expect(await authentication).toBe(true);
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(true);
    expect(state.get).toHaveBeenCalledTimes(1);
  });

  it("reports an unknown KV write outcome when storage commits and then throws, and never retries it after revocation", async () => {
    const state = setup();
    state.put.mockImplementationOnce(async (key, value) => {
      state.stored.set(key, value);
      throw new Error("response lost after commit");
    });
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "unknown")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.sqlite.prepare("SELECT operation FROM audit_events").all()).toEqual([{ operation: "admin.service-token.configure.requested" }]);
    await state.services().configureAdminServiceToken({ serviceId, token: null }, admin, "disable");
    await expect(state.services().configureAdminServiceToken({ serviceId, token }, admin, "unknown")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.put).toHaveBeenCalledTimes(2);
  });

  it("invalidates a previously accepted credential cache when a revocation commits but its response is lost", async () => {
    vi.useFakeTimers();
    const state = setup();
    await state.services().configureAdminServiceToken({ serviceId, token }, admin, "initial");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(true);
    expect(state.get).not.toHaveBeenCalled();
    state.put.mockImplementationOnce(async (key, value) => {
      state.stored.set(key, value);
      throw new Error("response lost after revocation");
    });
    await expect(state.services().configureAdminServiceToken({ serviceId, token: null }, admin, "unknown-revocation")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.get).not.toHaveBeenCalled();
    await expect(state.services().listAdminServiceTokens(admin)).rejects.toThrow("SERVICE_TOKEN_STORE_UNAVAILABLE");
    vi.advanceTimersByTime(5_001);
    expect(await state.services().authenticateOcrkitSnapshot(`Bearer ${token}`)).toBe(false);
    expect(state.get).toHaveBeenCalledTimes(1);
    await expect(state.services().configureAdminServiceToken({ serviceId, token: null }, admin, "unknown-revocation")).rejects.toThrow("SERVICE_TOKEN_WRITE_INCOMPLETE");
    expect(state.put).toHaveBeenCalledTimes(2);
  });

});
