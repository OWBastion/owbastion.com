import { adminServiceTokenUpdateRequestSchema, type ServiceTokenStatus } from "@owbastion/contracts";
import type { AuthContext, PlatformServices } from "@owbastion/domain";

const SERVICE_ID = "ocrkit-screenshot-sets";
const KEY = "owb:v1:service-token:ocrkit-screenshot-sets";
const OPERATION = "admin.service-token.configure";
type StoredToken = { tokenHash: string | null; updatedAt: number };
type Cached = { value: StoredToken | null; expiresAt: number; unavailable: boolean; pending?: Promise<void> };
const cache = new WeakMap<KVNamespace, Cached>();
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const status = (value: StoredToken | null): ServiceTokenStatus => ({ serviceId: SERVICE_ID, configured: value?.tokenHash != null, updatedAt: value?.updatedAt ?? null });
const requireAdmin = (auth: AuthContext) => {
  if (auth.actorType !== "user" || !auth.roles.includes("maintainer")) throw new Error("FORBIDDEN");
};
const read = async (kv: KVNamespace): Promise<Cached> => {
  let entry = cache.get(kv);
  if (entry?.pending) { await entry.pending; return cache.get(kv)!; }
  if (entry && entry.expiresAt > Date.now()) return entry;
  entry = { value: null, expiresAt: 0, unavailable: false };
  const current = entry;
  cache.set(kv, current);
  current.pending = (async () => {
    try {
      const raw: unknown = await kv.get(KEY, "json");
      if (raw !== null) current.unavailable = true;
      if (raw && typeof raw === "object") {
        const value = raw as Partial<StoredToken>;
        if ((value.tokenHash === null || (typeof value.tokenHash === "string" && /^[a-f0-9]{64}$/.test(value.tokenHash))) && Number.isSafeInteger(value.updatedAt) && value.updatedAt! >= 0) { current.value = value as StoredToken; current.unavailable = false; }
      }
      current.expiresAt = Date.now() + 30_000;
    } catch {
      current.unavailable = true;
      current.expiresAt = Date.now() + 5_000;
    } finally { current.pending = undefined; }
  })();
  await current.pending;
  return cache.get(kv)!;
};

export const createServiceTokenServices = (database: D1Database, kv?: KVNamespace): Pick<PlatformServices, "listAdminServiceTokens" | "configureAdminServiceToken" | "authenticateOcrkitSnapshot"> => {
  const requireStore = () => { if (!kv) throw new Error("SERVICE_TOKEN_STORE_UNAVAILABLE"); return kv; };
  return {
    async listAdminServiceTokens(auth) {
      requireAdmin(auth);
      const entry = await read(requireStore());
      if (entry.unavailable) throw new Error("SERVICE_TOKEN_STORE_UNAVAILABLE");
      return { contractVersion: "1", items: [status(entry.value)] };
    },
    async authenticateOcrkitSnapshot(authorization) {
      const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(authorization ?? "");
      if (!match || !kv) return false;
      const entry = await read(kv);
      if (entry.unavailable || !entry.value?.tokenHash) return false;
      const candidate = await digest(match[1]!);
      let difference = 0;
      for (let index = 0; index < candidate.length; index++) difference |= candidate.charCodeAt(index) ^ entry.value.tokenHash.charCodeAt(index);
      return difference === 0;
    },
    async configureAdminServiceToken(input, auth, idempotencyKey) {
      requireAdmin(auth);
      const store = requireStore();
      if (input.serviceId !== SERVICE_ID || !adminServiceTokenUpdateRequestSchema.safeParse({ contractVersion: "1", token: input.token }).success) throw new Error("VALIDATION_ERROR");
      const requestHash = await digest(JSON.stringify(input));
      const id = `${auth.subject}:${OPERATION}:${idempotencyKey}`;
      const replay = async () => {
        const existing = await database.prepare("SELECT request_hash, response_json FROM idempotency_keys WHERE id = ?").bind(id).first<{ request_hash: string; response_json: string }>();
        if (!existing) return null;
        if (existing.request_hash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        const response = JSON.parse(existing.response_json) as { pending?: boolean } & ServiceTokenStatus;
        if (response.pending) throw new Error("SERVICE_TOKEN_WRITE_INCOMPLETE");
        return response;
      };
      const previous = await replay();
      if (previous) return previous;
      const timestamp = Date.now();
      const value: StoredToken = { tokenHash: input.token === null ? null : await digest(input.token), updatedAt: timestamp };
      const response = status(value);
      const correlationId = crypto.randomUUID();
      const audit = (phase: "requested" | "completed") => database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), correlationId, auth.actorType, auth.subject, `${OPERATION}.${phase}`, "service_token", SERVICE_ID, JSON.stringify(response), Date.now());
      try {
        await database.batch([
          database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(id, auth.subject, OPERATION, requestHash, JSON.stringify({ pending: true }), timestamp),
          audit("requested"),
        ]);
      } catch (error) {
        const concurrent = await replay();
        if (concurrent) return concurrent;
        throw error;
      }
      try { await store.put(KEY, JSON.stringify(value)); }
      catch {
        cache.set(store, { value: null, expiresAt: Date.now() + 5_000, unavailable: true });
        throw new Error("SERVICE_TOKEN_WRITE_INCOMPLETE");
      }
      cache.set(store, { value, expiresAt: Date.now() + 30_000, unavailable: false });
      try {
        await database.batch([
          database.prepare("UPDATE idempotency_keys SET response_json = ? WHERE id = ?").bind(JSON.stringify(response), id),
          audit("completed"),
        ]);
      } catch { throw new Error("SERVICE_TOKEN_WRITE_INCOMPLETE"); }
      return response;
    },
  };
};
