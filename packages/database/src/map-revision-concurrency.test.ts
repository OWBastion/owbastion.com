import { describe, expect, it } from "vitest";
import { createTestD1 } from "../test/d1";
import { installSchema, seedAgentSpatialConfig, seedMap, seedSelectableGameplayRevision } from "../test/map-title-rule-fixtures";
import { createPlatformServices } from "./index";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const mapId = "map.race";
const initialId = `revision:${mapId}:initial`;

const fixture = () => {
  const { database, sqlite } = createTestD1({ foreignKeys: true, batchMode: "transactional", reportWriteChangesInAll: true, execReturnsD1Result: true });
  installSchema(sqlite);
  seedMap(sqlite, mapId);
  const targetId = seedSelectableGameplayRevision(sqlite, mapId);
  seedAgentSpatialConfig(sqlite, initialId);
  seedAgentSpatialConfig(sqlite, targetId);
  /** Runs `concurrentWriter` after the service has read the Revision and before its batch commits. */
  const interleave = (concurrentWriter: () => void): D1Database => {
    const wrapped = Object.create(database) as D1Database;
    wrapped.batch = (async (statements: D1PreparedStatement[]) => {
      concurrentWriter();
      return database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    }) as D1Database["batch"];
    return wrapped;
  };
  const lifecycles = () => Object.fromEntries((sqlite.prepare("SELECT id, lifecycle FROM gameplay_revisions WHERE map_id = ?").all(mapId) as Array<{ id: string; lifecycle: string }>).map((row) => [row.id, row.lifecycle]));
  const count = (table: string) => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { database, sqlite, targetId, interleave, lifecycles, count };
};

const promoteInput = (revisionId: string) => ({ contractVersion: "1" as const, mapId, revisionId, replacedDefaultLifecycle: "selectable" as const });

describe("Revision promotion", () => {
  it("replaces the default Revision and records one audit event per Revision", async () => {
    const { database, targetId, lifecycles, count } = fixture();
    await expect(createPlatformServices(database).promoteAdminMapRevision(promoteInput(targetId), auth, "promote.ok")).resolves.toMatchObject({ revisionId: targetId, lifecycle: "default", isDefault: true });
    expect(lifecycles()).toEqual({ [initialId]: "selectable", [targetId]: "default" });
    expect(count("idempotency_keys")).toBe(1);
    expect(count("audit_events")).toBe(2);
  });

  it("keeps the current default when the target is retired after the read", async () => {
    const { sqlite, targetId, interleave, lifecycles, count } = fixture();
    const services = createPlatformServices(interleave(() => sqlite.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical' WHERE id = ?").run(targetId)));
    await expect(services.promoteAdminMapRevision(promoteInput(targetId), auth, "promote.race")).rejects.toThrow("REVISION_NOT_PROMOTABLE");
    expect(lifecycles()).toEqual({ [initialId]: "default", [targetId]: "historical" });
    expect(count("idempotency_keys")).toBe(0);
    expect(count("audit_events")).toBe(0);
  });
});
