import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createTestDatabase, now, seedException, seedRule, seedTitle } from "../test/map-title-rule-fixtures";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
afterEach(() => vi.restoreAllMocks());

const pioneerFixture = () => {
  const fixture = createTestDatabase("map.live");
  seedTitle(fixture.sqlite, "PIONEER");
  seedRule(fixture.sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
  return { ...fixture, services: createPlatformServices(fixture.database) };
};
const upsert = (services: ReturnType<typeof createPlatformServices>, key: string, body: { enabled: boolean; startsAt: number; endsAt: number }) =>
  services.upsertAdminMapTitleRuleException({ contractVersion: "1", mapId: "map.live", ruleId: "rule.pioneer", ...body }, auth, key);

describe("public active challenges", () => {
  it("lists a Pioneer window only while its window is open", async () => {
    const { services, sqlite } = pioneerFixture();
    seedException(sqlite, "exception.live", "rule.pioneer", "map.live", { startsAt: now - 1_000, endsAt: now + 60_000 });
    vi.spyOn(Date, "now").mockReturnValue(now);

    expect(await services.listActiveChallenges()).toEqual([
      expect.objectContaining({ kind: "pioneer", titleKey: "PIONEER", mapId: "map.live", startsAt: now - 1_000, endsAt: now + 60_000 }),
    ]);

    vi.spyOn(Date, "now").mockReturnValue(now + 60_000);
    expect(await services.listActiveChallenges()).toEqual([]);
  });

  it("does not list a Pioneer window that has not started or is disabled", async () => {
    const { services, sqlite } = pioneerFixture();
    seedException(sqlite, "exception.live", "rule.pioneer", "map.live", { startsAt: now + 10_000, endsAt: now + 60_000 });
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(await services.listActiveChallenges()).toEqual([]);

    await upsert(services, "disabled", { enabled: false, startsAt: now - 1_000, endsAt: now + 60_000 });
    expect(await services.listActiveChallenges()).toEqual([]);
  });

  it("lists a time-limited achievement Challenge until its end time or archival", async () => {
    const { services, sqlite } = pioneerFixture();
    sqlite.prepare("UPDATE title_catalog SET scope='global', lifecycle='active' WHERE key='PIONEER'").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, starts_at, ends_at, scope, created_at, updated_at) VALUES ('title.timed', 'PIONEER', '限时完成', '截图', 'manual', '2026.07.15', 'active', '2026.07.15', ?, ?, 'global', ?, ?)")
      .run(now - 1_000, now + 5_000, now, now);
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(await services.listActiveChallenges()).toEqual([
      expect.objectContaining({ kind: "achievement", challengeId: "title.timed", titleName: "称号 PIONEER", mapIds: [], endsAt: now + 5_000 }),
    ]);

    vi.spyOn(Date, "now").mockReturnValue(now + 5_000);
    expect(await services.listActiveChallenges()).toEqual([]);

    vi.spyOn(Date, "now").mockReturnValue(now);
    await services.updateAdminChallengeLifecycle({ challengeId: "title.timed", status: "archived" }, auth, "archive-challenge");
    expect(await services.listActiveChallenges()).toEqual([]);
  });

  it("omits an achievement without an end time", async () => {
    const { services, sqlite } = pioneerFixture();
    sqlite.prepare("UPDATE title_catalog SET scope='global', lifecycle='active' WHERE key='PIONEER'").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.open', 'PIONEER', '完成', '截图', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)")
      .run(now, now);
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(await services.listActiveChallenges()).toEqual([]);
  });
});
