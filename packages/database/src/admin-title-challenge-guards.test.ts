import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminTitleChallenge } from "@owbastion/contracts";
import { createPlatformServices } from "./index";
import { createD1, installSchema } from "./ocr-test-harness";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const fixtures: Array<{ sqlite: DatabaseSync }> = [];
afterEach(() => { fixtures.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const setup = async () => {
  const fixture = createD1();
  fixtures.push(fixture);
  installSchema(fixture.sqlite);
  fixture.sqlite.exec("INSERT INTO random_event_versions (game_version,created_at,updated_at) VALUES ('26.1003.1',1,1)");
  vi.spyOn(Date, "now").mockReturnValue(2_000);
  const services = createPlatformServices(fixture.database);
  await services.createAdminTitle({ contractVersion: "1", titleKey: "T", label: "称号", icon: "trophy", category: "测试", scope: "global", displayKind: "fixed", publicVisibility: true }, auth, "title");
  const create = (condition: string) => services.createAdminTitleChallenge({ contractVersion: "1", titleKey: "T", condition, submissionMode: "manual", status: "active", enableTitle: true }, auth, `create-${condition}`);
  return { ...fixture, services, create };
};
type Setup = Awaited<ReturnType<typeof setup>>;
const replace = (services: Setup["services"], row: AdminTitleChallenge, key: string) => services.updateAdminChallenge({ contractVersion: "1", family: "achievement", challengeId: row.challengeId, saveMode: "new_challenge", condition: `${row.condition}+`, evidenceRule: row.evidenceRule, submissionMode: row.submissionMode, categoryOverride: row.categoryOverride, status: "active", gameVersion: row.gameVersion }, auth, key);
const lifecycle = (services: Setup["services"], row: AdminTitleChallenge, status: "active" | "archived", key: string) => services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: row.challengeId, status }, auth, key);
const states = (sqlite: DatabaseSync) => sqlite.prepare("SELECT condition, status, replaced_by_challenge_id IS NOT NULL AS replaced FROM title_challenges ORDER BY condition").all();
const writes = (sqlite: DatabaseSync, operation: string) => ({
  audit: sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE operation=?").get(operation),
  idempotency: sqlite.prepare("SELECT count(*) AS n FROM idempotency_keys WHERE operation=?").get(operation),
});
// Runs raw SQL right before the service's write batch: a concurrent writer after the service's read.
const raceBeforeBatch = ({ database, sqlite }: Setup, sql: string) => {
  const batch = database.batch.bind(database);
  vi.spyOn(database, "batch").mockImplementationOnce(async (statements) => { sqlite.exec(sql); return batch(statements); });
};

describe("Challenge lifecycle guards", () => {
  it("reactivates an archived Challenge that was not replaced", async () => {
    const setupResult = await setup();
    const challenge = await setupResult.create("a");
    await lifecycle(setupResult.services, challenge, "archived", "archive");
    const result = await lifecycle(setupResult.services, challenge, "active", "undo");
    expect(result.challenge.status).toBe("active");
    expect(states(setupResult.sqlite)).toEqual([{ condition: "a", status: "active", replaced: 0 }]);
  });

  it("rejects reactivating a Challenge that a successor replaced", async () => {
    const setupResult = await setup();
    const old = await setupResult.create("a");
    await replace(setupResult.services, old, "replace");
    await expect(lifecycle(setupResult.services, old, "active", "reactivate")).rejects.toThrow("CHALLENGE_ALREADY_REPLACED");
    expect(states(setupResult.sqlite)).toEqual([{ condition: "a", status: "archived", replaced: 1 }, { condition: "a+", status: "active", replaced: 0 }]);
  });

  it("rejects reactivation when the replacement lands after the read, and records nothing", async () => {
    const setupResult = await setup();
    const old = await setupResult.create("a");
    const other = await setupResult.create("b");
    await lifecycle(setupResult.services, old, "archived", "archive");
    raceBeforeBatch(setupResult, `UPDATE title_challenges SET replaced_by_challenge_id='${other.challengeId}' WHERE id='${old.challengeId}'`);
    await expect(lifecycle(setupResult.services, old, "active", "reactivate")).rejects.toThrow("CHALLENGE_ALREADY_REPLACED");
    expect(states(setupResult.sqlite)[0]).toEqual({ condition: "a", status: "archived", replaced: 1 });
    expect(writes(setupResult.sqlite, "admin.challenge.lifecycle")).toEqual({ audit: { n: 1 }, idempotency: { n: 1 } });
  });
});

describe("Challenge replacement guards", () => {
  it("replaces an active Challenge once, leaving one active successor", async () => {
    const setupResult = await setup();
    const old = await setupResult.create("a");
    const successor = await replace(setupResult.services, old, "replace");
    expect(successor.status).toBe("active");
    expect(states(setupResult.sqlite)).toEqual([{ condition: "a", status: "archived", replaced: 1 }, { condition: "a+", status: "active", replaced: 0 }]);
  });

  it("rejects replacing the same predecessor twice", async () => {
    const setupResult = await setup();
    const old = await setupResult.create("a");
    await replace(setupResult.services, old, "first");
    await expect(replace(setupResult.services, old, "second")).rejects.toThrow("CHALLENGE_NOT_REPLACEABLE");
    expect(states(setupResult.sqlite)).toHaveLength(2);
  });

  it("rejects replacing an archived Challenge", async () => {
    const setupResult = await setup();
    const old = await setupResult.create("a");
    await lifecycle(setupResult.services, old, "archived", "archive");
    await expect(replace(setupResult.services, old, "replace")).rejects.toThrow("CHALLENGE_NOT_REPLACEABLE");
    expect(states(setupResult.sqlite)).toEqual([{ condition: "a", status: "archived", replaced: 0 }]);
  });

  it("writes no successor, assignment or record when a concurrent replacement wins", async () => {
    const setupResult = await setup();
    const old = await setupResult.create("a");
    const winner = await setupResult.create("b");
    raceBeforeBatch(setupResult, `UPDATE title_challenges SET status='archived', replaced_by_challenge_id='${winner.challengeId}' WHERE id='${old.challengeId}'`);
    await expect(replace(setupResult.services, old, "loser")).rejects.toThrow("CHALLENGE_NOT_REPLACEABLE");
    expect(states(setupResult.sqlite)).toEqual([{ condition: "a", status: "archived", replaced: 1 }, { condition: "b", status: "active", replaced: 0 }]);
    expect(writes(setupResult.sqlite, "admin.achievement.update")).toEqual({ audit: { n: 0 }, idempotency: { n: 0 } });
  });
});
