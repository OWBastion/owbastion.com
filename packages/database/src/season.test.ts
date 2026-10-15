import { describe, expect, it } from "vitest";
import { adminSeasonListResponseSchema, adminSeasonSchema, publicSeasonListResponseSchema } from "@owbastion/contracts";
import type { AuthContext } from "@owbastion/domain";
import { createD1 } from "./ocr-test-harness";
import { createPlatformServices } from "./index";

const DAY = 86_400_000;
const auth: AuthContext = { actorType: "user", subject: "admin.1", roles: ["maintainer"], provider: "test" };

const fixture = () => {
  const harness = createD1();
  harness.sqlite.exec(`
    CREATE TABLE seasons (id TEXT PRIMARY KEY, name TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL, public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE idempotency_keys (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, operation TEXT NOT NULL, request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, correlation_id TEXT NOT NULL, actor_type TEXT NOT NULL, actor_id TEXT NOT NULL, operation TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE mastery_runs (id TEXT PRIMARY KEY, player_account_id TEXT NOT NULL, source_submission_id TEXT NOT NULL, map_id TEXT NOT NULL, gameplay_revision_id TEXT NOT NULL, accepted_at INTEGER NOT NULL, status TEXT NOT NULL, awarded_xp INTEGER NOT NULL);
  `);
  const addRun = (id: string, player: string, acceptedAt: number, status = "active") =>
    harness.sqlite.prepare("INSERT INTO mastery_runs VALUES (?, ?, ?, 'map.a', 'rev.a', ?, ?, 100)").run(id, player, `sub.${id}`, acceptedAt, status);
  return { ...harness, services: createPlatformServices(harness.database), addRun, now: Date.now() };
};

const write = (startsAt: number, endsAt: number, status: "draft" | "active" | "archived" = "draft", isPublic = false, name = "赛季") =>
  ({ contractVersion: "1" as const, name, startsAt, endsAt, status, public: isPublic });

describe("season administration", () => {
  it("creates Seasons, derives phases, and counts ranked Players from Verified Runs", async () => {
    const { services, addRun, now } = fixture();
    const running = await services.createAdminSeason(write(now - 10 * DAY, now + 10 * DAY, "active", true, "进行中"), auth, "k1");
    const scheduled = await services.createAdminSeason(write(now + 20 * DAY, now + 30 * DAY, "active"), auth, "k2");
    const draft = await services.createAdminSeason(write(now + 40 * DAY, now + 50 * DAY), auth, "k3");
    addRun("r1", "p1", now - 5 * DAY); addRun("r2", "p1", now - 4 * DAY); addRun("r3", "p2", now - 3 * DAY);
    addRun("r4", "p3", now - 3 * DAY, "invalidated"); addRun("r5", "p4", now - 20 * DAY);
    const list = adminSeasonListResponseSchema.parse(await services.listAdminSeasons(auth));
    expect(list.items.map((season) => [season.seasonId, season.phase, season.playerCount])).toEqual([
      [draft.seasonId, "draft", 0], [scheduled.seasonId, "scheduled", 0], [running.seasonId, "running", 2],
    ]);
    expect(adminSeasonSchema.parse(running)).toMatchObject({ status: "active", public: true });
  });

  it("rejects overlapping windows, inverted ranges, and past-ending active Seasons", async () => {
    const { services, now } = fixture();
    const first = await services.createAdminSeason(write(now + DAY, now + 10 * DAY), auth, "k1");
    await expect(services.createAdminSeason(write(now + 10 * DAY, now + 20 * DAY), auth, "k2")).rejects.toThrow("SEASON_OVERLAP");
    await expect(services.createAdminSeason(write(now - 5 * DAY, now + 2 * DAY), auth, "k3")).rejects.toThrow("SEASON_OVERLAP");
    await expect(services.createAdminSeason(write(now + 20 * DAY, now + 20 * DAY), auth, "k4")).rejects.toThrow("SEASON_RANGE_INVALID");
    await expect(services.createAdminSeason(write(now - 20 * DAY, now - 10 * DAY, "active"), auth, "k5")).rejects.toThrow("SEASON_RANGE_INVALID");
    await expect(services.updateAdminSeason({ ...write(now + 2 * DAY, now + 5 * DAY), seasonId: first.seasonId }, auth, "k6")).resolves.toMatchObject({ startsAt: now + 2 * DAY });
    await expect(services.updateAdminSeason({ ...write(now, now + DAY), seasonId: crypto.randomUUID() }, auth, "k7")).rejects.toThrow("SEASON_NOT_FOUND");
  });

  it("locks the start of a started Season and refuses edits once it has ended", async () => {
    const { services, sqlite, now } = fixture();
    const season = await services.createAdminSeason(write(now - DAY, now + 10 * DAY, "active"), auth, "k1");
    const same = { seasonId: season.seasonId, ...write(season.startsAt, now + 20 * DAY, "active", true, "改名") };
    await expect(services.updateAdminSeason({ ...same, startsAt: season.startsAt + 1 }, auth, "k2")).rejects.toThrow("SEASON_STARTED");
    await expect(services.updateAdminSeason({ ...same, status: "draft" }, auth, "k3")).rejects.toThrow("SEASON_STARTED");
    await expect(services.updateAdminSeason(same, auth, "k4")).resolves.toMatchObject({ name: "改名", public: true, endsAt: now + 20 * DAY });
    sqlite.prepare("UPDATE seasons SET ends_at = ? WHERE id = ?").run(now - 1, season.seasonId);
    await expect(services.updateAdminSeason(same, auth, "k5")).rejects.toThrow("SEASON_ENDED");
    const ended = { seasonId: season.seasonId, ...write(season.startsAt, now - 1, "active", true, "改名") };
    await expect(services.updateAdminSeason({ ...ended, name: "再改名" }, auth, "k6")).rejects.toThrow("SEASON_ENDED");
    await expect(services.updateAdminSeason({ ...ended, public: false }, auth, "k7")).resolves.toMatchObject({ phase: "ended", public: false });
    await expect(services.createAdminSeason(write(now + DAY, now + 2 * DAY, "archived"), auth, "k8")).rejects.toThrow("SEASON_RANGE_INVALID");
  });

  it("returns a scheduled Season to draft and publishes a draft", async () => {
    const { services, now } = fixture();
    const season = await services.createAdminSeason(write(now + 5 * DAY, now + 10 * DAY), auth, "k1");
    const published = await services.updateAdminSeason({ seasonId: season.seasonId, ...write(season.startsAt, season.endsAt, "active", true) }, auth, "k2");
    expect(published.phase).toBe("scheduled");
    const undone = await services.updateAdminSeason({ seasonId: season.seasonId, ...write(season.startsAt, season.endsAt) }, auth, "k3");
    expect(undone).toMatchObject({ phase: "draft", public: false });
  });

  it("ends a running Season early with an audit event and freezes its ranking", async () => {
    const { services, sqlite, addRun, now } = fixture();
    const season = await services.createAdminSeason(write(now - 5 * DAY, now + 30 * DAY, "active", true), auth, "k1");
    addRun("r1", "p1", now - DAY);
    const ended = await services.endAdminSeason({ seasonId: season.seasonId }, auth, "k2");
    expect(ended).toMatchObject({ phase: "ended", status: "archived", playerCount: 1 });
    expect(ended.endsAt).toBeLessThan(now + DAY);
    const audit = sqlite.prepare("SELECT actor_id, operation, entity_id, payload_json FROM audit_events WHERE operation = 'admin.season.end'").all() as Array<{ actor_id: string; entity_id: string; payload_json: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_id: "admin.1", entity_id: season.seasonId });
    expect(JSON.parse(audit[0]!.payload_json)).toMatchObject({ before: { endsAt: now + 30 * DAY, status: "active" } });
    await expect(services.endAdminSeason({ seasonId: season.seasonId }, auth, "k3")).rejects.toThrow("SEASON_NOT_RUNNING");
    const scheduled = await services.createAdminSeason(write(now + 40 * DAY, now + 50 * DAY, "active"), auth, "k4");
    await expect(services.endAdminSeason({ seasonId: scheduled.seasonId }, auth, "k5")).rejects.toThrow("SEASON_NOT_RUNNING");
  });

  it("replays an idempotent write and rejects a changed request under the same key", async () => {
    const { services, sqlite, now } = fixture();
    const input = write(now + DAY, now + 5 * DAY);
    const first = await services.createAdminSeason(input, auth, "same");
    await expect(services.createAdminSeason(input, auth, "same")).resolves.toMatchObject({ seasonId: first.seasonId });
    await expect(services.createAdminSeason({ ...input, name: "其他" }, auth, "same")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(sqlite.prepare("SELECT count(*) AS n FROM seasons").get()).toEqual({ n: 1 });
    expect(sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE operation = 'admin.season.create'").get()).toEqual({ n: 1 });
  });

  it("lists only published, public, started Seasons for players", async () => {
    const { services, sqlite, now } = fixture();
    const running = await services.createAdminSeason(write(now - 5 * DAY, now + 5 * DAY, "active", true, "进行中"), auth, "k1");
    await services.createAdminSeason(write(now + 10 * DAY, now + 20 * DAY, "active", true), auth, "k2");
    await services.createAdminSeason(write(now + 30 * DAY, now + 40 * DAY, "draft", true), auth, "k3");
    await services.createAdminSeason(write(now - 40 * DAY, now - 30 * DAY, "draft", true), auth, "k4");
    await services.createAdminSeason(write(now - 20 * DAY, now - 10 * DAY, "draft"), auth, "k5");
    const earlier = await services.createAdminSeason(write(now - 60 * DAY, now - 50 * DAY, "draft", true), auth, "k6");
    sqlite.prepare("UPDATE seasons SET status = 'active' WHERE id = ?").run(earlier.seasonId);
    const list = publicSeasonListResponseSchema.parse(await services.listPublicSeasons());
    expect(list.items.map((season) => [season.seasonId, season.phase])).toEqual([[running.seasonId, "running"], [earlier.seasonId, "ended"]]);
  });
});
