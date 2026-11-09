import { describe, expect, it } from "vitest";
import type { AuthContext } from "@owbastion/domain";
import { createTestD1 } from "../test/d1";
import { createPlatformServices } from "./index";

const DAY = 86_400_000;
const auth: AuthContext = { actorType: "user", subject: "admin.1", roles: ["maintainer"], provider: "test" };

const fixture = () => {
  const { database, sqlite } = createTestD1({ batchMode: "transactional", reportWriteChangesInAll: true, execReturnsD1Result: true });
  sqlite.exec(`
    CREATE TABLE seasons (id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL, public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE mastery_runs (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, source_submission_id TEXT NOT NULL, map_id TEXT NOT NULL, gameplay_revision_id TEXT NOT NULL, accepted_at INTEGER NOT NULL, status TEXT NOT NULL, awarded_xp INTEGER NOT NULL);
  `);
  const insertSeason = (id: string, startsAt: number, endsAt: number) =>
    sqlite.prepare("INSERT INTO seasons VALUES (?, ?, ?, ?, 'draft', 0, 1, 1)").run(id, id, startsAt, endsAt);
  /** Runs `concurrentWriter` after the service validated and before its batch commits. */
  const interleave = (concurrentWriter: () => void): D1Database => {
    const wrapped = Object.create(database) as D1Database;
    wrapped.batch = (async (statements: D1PreparedStatement[]) => {
      concurrentWriter();
      return database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    }) as D1Database["batch"];
    return wrapped;
  };
  const count = (table: string) => (sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  return { database, sqlite, insertSeason, interleave, count, now: Date.now() };
};

const write = (startsAt: number, endsAt: number) => ({ contractVersion: "1" as const, name: "赛季", startsAt, endsAt, status: "draft" as const, public: false });

describe("Season overlap under concurrent writes", () => {
  it("rejects a Season whose window is taken by a competing insert after validation", async () => {
    const { sqlite, insertSeason, interleave, count, now } = fixture();
    const services = createPlatformServices(interleave(() => insertSeason("competing", now + 5 * DAY, now + 15 * DAY)));
    await expect(services.createAdminSeason(write(now + 10 * DAY, now + 20 * DAY), auth, "create.race")).rejects.toThrow("SEASON_OVERLAP");
    expect(count("seasons")).toBe(1);
    expect(count("idempotency_keys")).toBe(0);
    expect(count("audit_events")).toBe(0);
    expect(sqlite.prepare("SELECT id FROM seasons").get()).toEqual({ id: "competing" });
  });

  it("rejects an update whose new window is taken by a competing insert after validation", async () => {
    const { database, sqlite, insertSeason, interleave, count, now } = fixture();
    const season = await createPlatformServices(database).createAdminSeason(write(now + 30 * DAY, now + 40 * DAY), auth, "create.ok");
    const services = createPlatformServices(interleave(() => insertSeason("competing", now + 5 * DAY, now + 15 * DAY)));
    await expect(services.updateAdminSeason({ ...write(now + 10 * DAY, now + 20 * DAY), seasonId: season.seasonId }, auth, "update.race")).rejects.toThrow("SEASON_OVERLAP");
    expect(sqlite.prepare("SELECT starts_at FROM seasons WHERE id = ?").get(season.seasonId)).toEqual({ starts_at: now + 30 * DAY });
    expect(count("idempotency_keys")).toBe(1);
    expect(count("audit_events")).toBe(1);
  });

  it("treats touching windows as overlapping and adjacent windows as free", async () => {
    const { database, insertSeason, now } = fixture();
    insertSeason("existing", now + 10 * DAY, now + 20 * DAY);
    const services = createPlatformServices(database);
    await expect(services.createAdminSeason(write(now + 20 * DAY, now + 30 * DAY), auth, "touch")).rejects.toThrow("SEASON_OVERLAP");
    await expect(services.createAdminSeason(write(now + 20 * DAY + 1, now + 30 * DAY), auth, "adjacent")).resolves.toMatchObject({ startsAt: now + 20 * DAY + 1 });
  });

  it("lets a Season update keep its own window", async () => {
    const { database, now } = fixture();
    const services = createPlatformServices(database);
    const season = await services.createAdminSeason(write(now + 10 * DAY, now + 20 * DAY), auth, "create.ok");
    await expect(services.updateAdminSeason({ ...write(now + 12 * DAY, now + 20 * DAY), name: "改名", seasonId: season.seasonId }, auth, "update.ok")).resolves.toMatchObject({ name: "改名", startsAt: now + 12 * DAY });
  });
});
