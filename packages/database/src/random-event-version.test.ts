import {
  auditEventsRequiredIdSchema,
  effectGlossaryTermsSchema,
  idempotencyKeysRequiredIdSchema,
  mapsSchema,
  randomEventsSchema,
  titleCatalogSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";

const createD1 = () => createTestD1({ foreignKeys: true, batchStatementMethod: "run" });
const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  ${randomEventsSchema}
  CREATE TABLE random_event_versions (
    game_version TEXT PRIMARY KEY NOT NULL, availability TEXT NOT NULL DEFAULT 'available',
    suspended_at INTEGER, suspended_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE random_event_map_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (event_id, challenge_id));
  CREATE TABLE random_event_title_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL, PRIMARY KEY (event_id, challenge_id));
  ${mapsSchema}
  CREATE TABLE map_metadata (
    map_id TEXT PRIMARY KEY NOT NULL, difficulty_rating TEXT, mechanics_json TEXT NOT NULL DEFAULT '[]',
    cover_url TEXT, background_url TEXT, updated_at INTEGER NOT NULL, updated_by TEXT NOT NULL
  );
  CREATE TABLE gameplay_revisions (
    id TEXT PRIMARY KEY NOT NULL, map_id TEXT NOT NULL, lifecycle TEXT NOT NULL, legacy_map_variant TEXT,
    copied_from_revision_id TEXT, reset_reason TEXT, game_version TEXT NOT NULL, spatial_config_json TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE gameplay_revision_challenge_assignments (
    id TEXT PRIMARY KEY NOT NULL, gameplay_revision_id TEXT NOT NULL, map_id TEXT NOT NULL, challenge_family TEXT NOT NULL,
    challenge_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, condition TEXT, evidence_rule TEXT,
    submission_mode TEXT, slot TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE achievement_challenges (
    id TEXT PRIMARY KEY NOT NULL, map_id TEXT NOT NULL, type TEXT NOT NULL, name TEXT NOT NULL, difficulty TEXT,
    condition TEXT NOT NULL, evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, reward_title_key TEXT,
    game_version TEXT NOT NULL, status TEXT NOT NULL, introduced_version TEXT NOT NULL, retired_version TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE map_title_rule_compat (
    legacy_challenge_id TEXT NOT NULL, rule_id TEXT NOT NULL, map_id TEXT NOT NULL,
    is_standard_instance INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL,
    PRIMARY KEY (legacy_challenge_id, map_id)
  );
  ${titleCatalogSchema}
  CREATE TABLE title_challenges (
    id TEXT PRIMARY KEY NOT NULL, title_key TEXT NOT NULL, category_override TEXT, condition TEXT NOT NULL,
    evidence_rule TEXT NOT NULL, submission_mode TEXT NOT NULL, game_version TEXT NOT NULL, status TEXT NOT NULL,
    introduced_version TEXT NOT NULL, retired_version TEXT, starts_at INTEGER, ends_at INTEGER,
    scope TEXT NOT NULL DEFAULT 'global', map_variant TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id));
  ${effectGlossaryTermsSchema}
  ${idempotencyKeysRequiredIdSchema}
  ${auditEventsRequiredIdSchema}
`);

describe("random-event version availability", () => {
  it("filters suspended versions and restores the unchanged event projection", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec("INSERT INTO random_events (id, name, category, rarity, description, duration_seconds, cooldown_seconds, weight, game_version, release_status, created_at, updated_at) VALUES ('event.suspended', '挂起事件', '增益', 'SR', '原始说明', 30, 0.32, 0.7, '26.0901.1', 'implemented', 1, 1), ('event.available', '可用事件', '机制', 'N', '另一说明', 60, 1, 2, '26.0902.1', 'implemented', 1, 1);");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

    await services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "suspended" }, auth, "suspend-1");
    await expect(services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "suspended" }, auth, "suspend-1")).resolves.toEqual({ gameVersion: "26.0901.1", availability: "suspended", eventCount: 1 });
    await expect(services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "available" }, auth, "suspend-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.getAgentEvent({ eventId: "event.suspended" })).resolves.toBeNull();
    await expect(services.getAgentEvent({ eventId: "event.available" })).resolves.toMatchObject({ eventId: "event.available", weight: 2 });
    await expect(services.listAgentEvents({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 1, items: [{ eventId: "event.available" }] });

    const restored = await services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "available" }, auth, "restore-1");
    expect(restored).toEqual({ gameVersion: "26.0901.1", availability: "available", eventCount: 1 });
    await expect(services.getAgentEvent({ eventId: "event.suspended" })).resolves.toMatchObject({ eventId: "event.suspended", description: "原始说明", durationSeconds: 30, cooldownSeconds: 0.32, weight: 0.7 });
    expect(await services.listAdminRandomEventVersions(auth)).toEqual({ contractVersion: "1", items: [
      { gameVersion: "26.0902.1", availability: "available", eventCount: 1 },
      { gameVersion: "26.0901.1", availability: "available", eventCount: 1 },
    ] });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.random-event-version.availability'").get()).toEqual({ count: 2 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM idempotency_keys WHERE operation = 'admin.random-event-version.availability'").get()).toEqual({ count: 2 });
  });
});

describe("agents event release-status filter", () => {
  it("keeps development events out of the default projection and exposes them through an explicit status", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec("INSERT INTO random_events (id, name, category, rarity, description, duration_seconds, cooldown_seconds, weight, game_version, release_status, created_at, updated_at) VALUES ('event.dev', '开发事件', '机制', 'N', '开发中说明', 60, 1, 2, '26.0902.1', 'development', 1, 1), ('event.impl', '实装事件', '增益', 'SR', '实装说明', 30, 0.32, 0.7, '26.0902.1', 'implemented', 1, 1), ('event.rem', '移除事件', '机制', 'N', '移除说明', 10, 0.1, 0.2, '26.0902.1', 'removed', 1, 1), ('event.dev-suspended', '挂起开发事件', '机制', 'N', '挂起说明', 10, 0.1, 0.2, '26.0901.1', 'development', 1, 1);");
    const services = createPlatformServices(database);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
    await services.updateAdminRandomEventVersion({ contractVersion: "1", gameVersion: "26.0901.1", availability: "suspended" }, auth, "suspend-1");

    await expect(services.listAgentEvents({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 2, items: [{ eventId: "event.impl" }, { eventId: "event.rem" }] });
    await expect(services.listAgentEvents({ page: 1, pageSize: 10, status: "development" })).resolves.toMatchObject({ total: 1, items: [{ eventId: "event.dev", releaseStatus: "development" }] });
    await expect(services.listAgentEvents({ page: 1, pageSize: 10, status: "implemented" })).resolves.toMatchObject({ total: 1, items: [{ eventId: "event.impl" }] });
    await expect(services.listAgentEvents({ page: 1, pageSize: 10, status: "removed" })).resolves.toMatchObject({ total: 1, items: [{ eventId: "event.rem" }] });
    await expect(services.getAgentEvent({ eventId: "event.dev" })).resolves.toBeNull();
    await expect(services.getAgentEvent({ eventId: "event.dev", status: "implemented" })).resolves.toBeNull();
    await expect(services.getAgentEvent({ eventId: "event.dev", status: "development" })).resolves.toMatchObject({ eventId: "event.dev", releaseStatus: "development" });
    await expect(services.searchAgentContent({ page: 1, pageSize: 10, query: "开发", kind: "event" })).resolves.toMatchObject({ total: 0 });
    await expect(services.searchAgentContent({ page: 1, pageSize: 10, query: "开发", kind: "event", status: "development" })).resolves.toMatchObject({ total: 1, items: [{ kind: "event", id: "event.dev" }] });
    await expect(services.getAgentEvent({ eventId: "event.dev-suspended", status: "development" })).resolves.toBeNull();
  });
});
