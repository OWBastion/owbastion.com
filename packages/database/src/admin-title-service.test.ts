import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminTitleChallenge } from "@owbastion/contracts";
import { adminTitleSummaryListResponseSchema, adminTitleChallengeResponseSchema } from "@owbastion/contracts";
import { createPlatformServices } from "./index";
import { createD1, installSchema, seedMap, seedTitle } from "./ocr-test-harness";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const fixtures: Array<{ sqlite: DatabaseSync }> = [];
afterEach(() => { fixtures.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const setup = () => {
  const fixture = createD1();
  fixtures.push(fixture);
  installSchema(fixture.sqlite);
  fixture.sqlite.exec("INSERT INTO random_event_versions (game_version,created_at,updated_at) VALUES ('26.1003.1',1,1)");
  vi.spyOn(Date, "now").mockReturnValue(2_000);
  return { ...fixture, services: createPlatformServices(fixture.database) };
};
const titleInput = { contractVersion: "1" as const, titleKey: "MULTI", label: "多路径", icon: "trophy", category: "测试", scope: "global" as const, displayKind: "fixed" as const, publicVisibility: true };
const challengeInput = { contractVersion: "1" as const, titleKey: "MULTI", condition: "完成挑战", submissionMode: "manual" as const, status: "active" as const, enableTitle: true };
const edit = (row: AdminTitleChallenge) => ({ contractVersion: "1" as const, family: "achievement" as const, challengeId: row.challengeId, saveMode: "in_place" as "in_place" | "new_challenge", condition: row.condition, evidenceRule: row.evidenceRule, submissionMode: row.submissionMode, categoryOverride: row.categoryOverride, status: row.status, gameVersion: row.gameVersion });

describe("title-centric admin acquisition contract", () => {
  it("creates only a draft title, generates keys, rejects key conflicts and replays exactly", async () => {
    const { services, sqlite } = setup();
    const title = await services.createAdminTitle(titleInput, auth, "title");
    expect(title).toMatchObject({ contractVersion: "1", titleKey: "MULTI", lifecycle: "draft", status: "draft", gameVersion: null, acquisition: { kind: "none" } });
    expect(sqlite.prepare("SELECT count(*) AS n FROM title_challenges").get()).toEqual({ n: 0 });
    expect(await services.createAdminTitle(titleInput, auth, "title")).toEqual(title);
    await expect(services.createAdminTitle(titleInput, auth, "other")).rejects.toThrow("TITLE_KEY_CONFLICT");
    const generated = await services.createAdminTitle({ ...titleInput, titleKey: undefined }, auth, "generated");
    expect(generated.titleKey).toMatch(/^[A-Z][A-Z0-9_]+$/);
    expect(await services.createAdminTitle({ ...titleInput, titleKey: undefined }, auth, "generated")).toEqual(generated);
    expect(sqlite.prepare("SELECT count(*) AS n FROM audit_events WHERE operation='admin.title.create'").get()).toEqual({ n: 2 });
    await expect(services.createAdminTitle({ ...titleInput, label: "不同" }, auth, "title")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("stores a CDN icon URL on create and replaces or clears it on update", async () => {
    const { services } = setup();
    const created = await services.createAdminTitle({ ...titleInput, iconUrl: "https://cdn.example.com/a.webp" }, auth, "title");
    expect(created.iconUrl).toBe("https://cdn.example.com/a.webp");
    const replaced = await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", iconUrl: "https://cdn.example.com/b.webp" }, auth, "replace");
    expect(replaced.title.iconUrl).toBe("https://cdn.example.com/b.webp");
    const untouched = await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", label: "改名" }, auth, "rename");
    expect(untouched.title.iconUrl).toBe("https://cdn.example.com/b.webp");
    const cleared = await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", iconUrl: null }, auth, "clear");
    expect(cleared.title.iconUrl).toBeNull();
  });

  it("adds independent challenges, enables the title atomically and exposes both publicly", async () => {
    const { services, sqlite, database } = setup();
    await services.createAdminTitle(titleInput, auth, "title");
    const batch = vi.spyOn(database, "batch");
    const first = await services.createAdminTitleChallenge({ ...challengeInput, enableTitle: false }, auth, "one");
    expect(batch).toHaveBeenCalledTimes(1);
    expect(first.challengeId).toMatch(/^title\.MULTI\..+/);
    expect(adminTitleChallengeResponseSchema.safeParse(first).success).toBe(true);
    expect(await services.listChallenges({ family: "achievement" })).toEqual([]);
    const secondInput = { ...challengeInput, condition: "另一种条件" };
    const second = await services.createAdminTitleChallenge(secondInput, auth, "two");
    expect(second.challengeId).not.toBe(first.challengeId);
    expect(await services.createAdminTitleChallenge(secondInput, auth, "two")).toEqual(second);
    expect(sqlite.prepare("SELECT lifecycle,game_version FROM title_catalog WHERE key='MULTI'").get()).toEqual({ lifecycle: "active", game_version: "26.1003.1" });
    expect(await services.listChallenges({ family: "achievement" })).toEqual(expect.arrayContaining([expect.objectContaining({ challengeId: first.challengeId }), expect.objectContaining({ challengeId: second.challengeId })]));
    expect((await services.listAdminTitleChallenges({ titleKey: "MULTI" }, auth)).items).toHaveLength(2);
    expect((await services.listAdminTitleSummaries(auth)).items).toEqual([expect.objectContaining({ status: "active", acquisition: { kind: "challenges", challengeCount: 2, completableCount: 2 } })]);
  });

  it("rejects qualification changes in place and atomically replaces without touching old completions", async () => {
    const { services, sqlite, database } = setup();
    seedMap(sqlite, "map.alpha");
    seedMap(sqlite, "map.beta");
    await services.createAdminTitle({ ...titleInput, scope: "map" }, auth, "title");
    const first = await services.createAdminTitleChallenge({ ...challengeInput, mapIds: ["map.alpha"] }, auth, "one");
    const update = { ...edit(first), mapIds: ["map.beta"] };
    await expect(services.updateAdminChallenge(update, auth, "reject")).rejects.toThrow("CHALLENGE_QUALIFICATION_CHANGED");
    // A real retained canonical completion/grant remains unchanged when the source is replaced.
    sqlite.exec("INSERT INTO player_accounts (id,player_id,player_name,normalized_player_name,status,created_at,updated_at) VALUES ('player','123','Player','player','active',1,1)");
    sqlite.prepare("INSERT INTO challenges (id,source_family,source_id,title_key,status,manual,public_condition,condition_operator,conditions_json,condition,created_at,updated_at) VALUES ('canonical.old','title_challenge',?,'MULTI','active',0,1,'and','[]','old',1,1)").run(first.challengeId);
    sqlite.exec("INSERT INTO challenge_completions (id,player_account_id,challenge_id,status,source_type,source_id,completed_at,created_at) VALUES ('completion.old','player','canonical.old','active','manual','fixture',1,1)");
    sqlite.exec("INSERT INTO player_title_grants (id,player_account_id,title_key,status,source_type,source_id,granted_by,granted_at,completion_id) VALUES ('grant.old','player','MULTI','active','manual','fixture','admin',1,'completion.old')");
    const before = sqlite.prepare("SELECT * FROM player_title_grants WHERE id='grant.old'").get();
    const batch = vi.spyOn(database, "batch");
    const replacement = await services.updateAdminChallenge({ ...update, saveMode: "new_challenge" }, auth, "replace");
    expect(batch).toHaveBeenCalledTimes(1);
    expect(replacement.challengeId).not.toBe(first.challengeId);
    expect(replacement).toMatchObject({ mapIds: ["map.beta"], replacedByChallengeId: null });
    expect(sqlite.prepare("SELECT status,replaced_by_challenge_id FROM title_challenges WHERE id=?").get(first.challengeId)).toEqual({ status: "archived", replaced_by_challenge_id: replacement.challengeId });
    expect(sqlite.prepare("SELECT * FROM player_title_grants WHERE id='grant.old'").get()).toEqual(before);
    expect(sqlite.prepare("SELECT status FROM challenge_completions WHERE id='completion.old'").get()).toEqual({ status: "active" });
    expect(await services.updateAdminChallenge({ ...update, saveMode: "new_challenge" }, auth, "replace")).toEqual(replacement);
    expect((await services.listAdminTitleChallenges({ titleKey: "MULTI" }, auth)).items.map(row => row.challengeId)).toEqual([replacement.challengeId, first.challengeId]);
    expect(await services.listChallenges({ family: "map" })).toContainEqual(expect.objectContaining({ challengeId: replacement.challengeId, mapId: "map.beta" }));
    expect(await services.getAgentTitle({ titleKey: "MULTI" })).toMatchObject({ titleKey: "MULTI", mapId: "map.beta" });
    await services.createAdminTitleChallenge({ ...challengeInput, mapIds: ["map.beta"] }, auth, "third");
    expect((await services.listTitles({ mapId: "map.beta" })).filter(row => row.titleKey === "MULTI")).toHaveLength(1);
  });

  it("rolls back both halves of replacement when audit persistence fails", async () => {
    const { services, sqlite } = setup();
    await services.createAdminTitle(titleInput, auth, "title");
    const first = await services.createAdminTitleChallenge(challengeInput, auth, "one");
    sqlite.exec("CREATE TRIGGER fail_replacement BEFORE INSERT ON audit_events WHEN NEW.operation='admin.achievement.update' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
    await expect(services.updateAdminChallenge({ ...edit(first), saveMode: "new_challenge" }, auth, "replace")).rejects.toThrow();
    expect(sqlite.prepare("SELECT id,status,replaced_by_challenge_id FROM title_challenges").all()).toEqual([{ id: first.challengeId, status: "active", replaced_by_challenge_id: null }]);
    expect(sqlite.prepare("SELECT count(*) AS n FROM idempotency_keys WHERE operation='admin.achievement.update'").get()).toEqual({ n: 0 });
  });

  it("honors both save modes for text-only edits", async () => {
    const { services } = setup();
    await services.createAdminTitle(titleInput, auth, "title");
    const first = await services.createAdminTitleChallenge(challengeInput, auth, "one");
    const same = await services.updateAdminChallenge({ ...edit(first), condition: "修正文案" }, auth, "text");
    expect(same).toMatchObject({ challengeId: first.challengeId, condition: "修正文案" });
    const next = await services.updateAdminChallenge({ ...edit(first), saveMode: "new_challenge", condition: "另一版文案" }, auth, "text-new");
    expect(next.challengeId).not.toBe(first.challengeId);
    expect(await services.updateAdminChallenge({ ...edit(first), condition: "修正文案" }, auth, "text")).toEqual(same);
  });

  it("returns exact lifecycle state for undo, retains omitted windows and replays the original response", async () => {
    const { services } = setup();
    await services.createAdminTitle(titleInput, auth, "title");
    const first = await services.createAdminTitleChallenge({ ...challengeInput, startsAt: 1_000, endsAt: 3_000 }, auth, "one");
    const change = { contractVersion: "1" as const, challengeId: first.challengeId, status: "archived" as const, retiredVersion: null };
    const result = await services.updateAdminChallengeLifecycle(change, auth, "end");
    expect(result.previous).toEqual({ status: "active", retiredVersion: null, startsAt: 1_000, endsAt: 3_000 });
    expect(result.challenge).toMatchObject({ status: "archived", startsAt: 1_000, endsAt: 3_000 });
    const undo = await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: first.challengeId, ...result.previous }, auth, "undo");
    expect(undo.challenge).toMatchObject(result.previous);
    expect(await services.updateAdminChallengeLifecycle(change, auth, "end")).toEqual(result);
    await expect(services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: first.challengeId, status: "active", startsAt: 4_000 }, auth, "invalid-window")).rejects.toThrow("INVALID_CHALLENGE_WINDOW");
  });

  it("retires with prior challenge/rule states and restores only owned rows in one batch", async () => {
    const { services, sqlite, database } = setup();
    await services.createAdminTitle(titleInput, auth, "title");
    const first = await services.createAdminTitleChallenge({ ...challengeInput, startsAt: 1_000, endsAt: 3_000 }, auth, "one");
    await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: first.challengeId, status: "active", retiredVersion: "26.1101.1" }, auth, "sunset");
    sqlite.exec("INSERT INTO map_title_rules (id,title_key,kind,condition,evidence_rule,display_kind,status,introduced_version,retired_version,created_at,updated_at) VALUES ('rule.test','MULTI','test','rule','evidence','fixed','active','26.1003.1','26.1201.1',1,1)");
    const batch = vi.spyOn(database, "batch");
    const retirement = { contractVersion: "1" as const, titleKey: "MULTI", lifecycle: "retired" as const };
    const retired = await services.updateAdminCatalogTitle(retirement, auth, "retire");
    expect(batch).toHaveBeenCalledTimes(1);
    expect(retired).toMatchObject({ previousLifecycle: "active", title: { status: "retired" }, cascaded: { challenges: [{ challengeId: first.challengeId, status: "active", retiredVersion: "26.1101.1", startsAt: 1_000, endsAt: 3_000 }], mapTitleRules: [{ ruleId: "rule.test", status: "active", retiredVersion: "26.1201.1" }] } });
    const restored = await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", lifecycle: "active", restore: retired.cascaded }, auth, "restore");
    expect(restored).toMatchObject({ previousLifecycle: "retired", title: { status: "active" }, cascaded: { challenges: [], mapTitleRules: [] } });
    expect((await services.listAdminTitleChallenges({ titleKey: "MULTI" }, auth)).items[0]).toMatchObject(retired.cascaded.challenges[0]!);
    expect(sqlite.prepare("SELECT status,retired_version FROM map_title_rules WHERE id='rule.test'").get()).toEqual({ status: "active", retired_version: "26.1201.1" });
    expect(await services.updateAdminCatalogTitle(retirement, auth, "retire")).toEqual(retired);
    await expect(services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", lifecycle: "active", restore: retired.cascaded }, auth, "bad-restore")).rejects.toThrow("INVALID_RESTORE");
    await services.updateAdminCatalogTitle(retirement, auth, "retire-again");
    await expect(services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", lifecycle: "active", restore: { challenges: [{ ...retired.cascaded.challenges[0]!, challengeId: "title.other" }], mapTitleRules: [] } }, auth, "foreign")).rejects.toThrow("INVALID_RESTORE");
  });

  it("derives draft/retired/empty/map-rule/multi-path states and excludes manual issuance", async () => {
    const { services, sqlite } = setup();
    for (const [key, lifecycle] of [["DRAFT", "draft"], ["RETIRED", "retired"], ["EMPTY", "active"], ["RULE", "active"], ["MULTI", "active"], ["MANUAL", "active"]]) {
      seedTitle(sqlite, key!);
      sqlite.prepare("UPDATE title_catalog SET lifecycle=?,scope='global',category='测试',label=?,game_version='26.1003.1' WHERE key=?").run(lifecycle!, key!, key!);
    }
    sqlite.exec("INSERT INTO map_title_rules (id,title_key,kind,condition,evidence_rule,display_kind,status,introduced_version,created_at,updated_at) VALUES ('rule.test','RULE','test','rule condition','evidence','fixed','active','26.1003.1',1,1)");
    sqlite.exec("INSERT INTO challenges (id,source_family,source_id,title_key,status,manual,public_condition,condition_operator,conditions_json,condition,created_at,updated_at) VALUES ('manual:MANUAL','manual','manual:MANUAL','MANUAL','active',1,0,'and','[]','manual',1,1)");
    const scheduled = await services.createAdminTitleChallenge({ ...challengeInput, startsAt: 3_000 }, auth, "future");
    const sunset = await services.createAdminTitleChallenge(challengeInput, auth, "sunset");
    await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: sunset.challengeId, status: "active", retiredVersion: "26.1101.1" }, auth, "sunset-version");
    let response = await services.listAdminTitleSummaries(auth);
    expect(adminTitleSummaryListResponseSchema.safeParse(response).success).toBe(true);
    expect(response.items.map(row => [row.titleKey, row.status])).toEqual([["DRAFT", "draft"], ["EMPTY", "ended"], ["MANUAL", "ended"], ["MULTI", "sunsetting"], ["RETIRED", "retired"], ["RULE", "active"]]);
    expect(response.items.find(row => row.titleKey === "MANUAL")!.acquisition).toEqual({ kind: "none" });
    expect((await services.listAdminTitleChallenges({ titleKey: "MANUAL" }, auth)).items).toEqual([]);
    await services.createAdminTitleChallenge(challengeInput, auth, "active");
    response = await services.listAdminTitleSummaries(auth);
    expect(response.items.find(row => row.titleKey === "MULTI")).toMatchObject({ status: "active", acquisition: { kind: "challenges", challengeCount: 3, completableCount: 2 } });
    expect(await services.listChallenges({ family: "achievement" })).toContainEqual(expect.objectContaining({ challengeId: scheduled.challengeId, status: "scheduled" }));
  });

  it("rejects missing, retired, map-managed and invalid-scope targets", async () => {
    const { services } = setup();
    await expect(services.listAdminTitleChallenges({ titleKey: "missing" }, auth)).rejects.toThrow("TITLE_NOT_FOUND");
    await expect(services.createAdminTitleChallenge(challengeInput, auth, "missing")).rejects.toThrow("TITLE_NOT_FOUND");
    await services.createAdminTitle(titleInput, auth, "title");
    await expect(services.createAdminTitleChallenge({ ...challengeInput, mapIds: [] }, auth, "scope")).rejects.toThrow("INVALID_MAP_SCOPE");
    await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", lifecycle: "retired" }, auth, "retire");
    await expect(services.createAdminTitleChallenge(challengeInput, auth, "retired")).rejects.toThrow("TITLE_RETIRED");
  });
});

describe("real title acquisition migration", () => {
  it("preserves rows, checks and foreign references while admitting multiple paths and replacement links", () => {
    const sqlite = new DatabaseSync(":memory:");
    fixtures.push({ sqlite });
    sqlite.exec("CREATE TABLE title_catalog (key TEXT PRIMARY KEY); INSERT INTO title_catalog VALUES ('MULTI')");
    const previous = readFileSync("migrations/0101_challenge_lifecycle_convergence.sql", "utf8");
    sqlite.exec(previous.match(/CREATE TABLE title_challenges_next \([\s\S]*?\n\);/)![0]);
    sqlite.exec("ALTER TABLE title_challenges_next RENAME TO title_challenges; CREATE INDEX title_challenges_status_idx ON title_challenges(status,title_key)");
    // D1 cannot disable foreign keys; keep enforcement ON through the rebuild
    // so the migration is exercised under production semantics.
    sqlite.exec("PRAGMA foreign_keys = ON");
    sqlite.exec("CREATE TABLE achievement_challenge_maps (challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE, map_id TEXT NOT NULL, PRIMARY KEY (challenge_id, map_id))");
    sqlite.exec("CREATE TABLE random_event_title_challenges (event_id TEXT NOT NULL, challenge_id TEXT NOT NULL REFERENCES title_challenges(id) ON DELETE CASCADE, PRIMARY KEY (event_id, challenge_id))");
    sqlite.exec("INSERT INTO title_challenges (id,title_key,category_override,condition,evidence_rule,submission_mode,status,retired_version,starts_at,ends_at,created_at,updated_at,scope,map_variant,game_version,introduced_version,progress_rule) VALUES ('title.MULTI','MULTI','category','condition','evidence','manual','active','26.1101.1',100,300,1,2,'map','classic','26.1003.1','26.0901.1','{\"type\":\"required_maps_completed\",\"mapIds\":[\"map.alpha\"]}'); INSERT INTO achievement_challenge_maps VALUES ('title.MULTI','map.alpha'); INSERT INTO random_event_title_challenges VALUES ('event.test','title.MULTI')");
    const before = sqlite.prepare("SELECT * FROM title_challenges").get();
    sqlite.exec(readFileSync("migrations/0106_title_challenge_acquisition_paths.sql", "utf8"));
    expect(sqlite.prepare("SELECT * FROM title_challenges WHERE id='title.MULTI'").get()).toEqual({ ...before, replaced_by_challenge_id: null });
    expect(sqlite.prepare("SELECT * FROM achievement_challenge_maps").all()).toEqual([{ challenge_id: "title.MULTI", map_id: "map.alpha" }]);
    expect(sqlite.prepare("SELECT * FROM random_event_title_challenges").all()).toEqual([{ event_id: "event.test", challenge_id: "title.MULTI" }]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    sqlite.exec("INSERT INTO title_challenges (id,title_key,condition,evidence_rule,submission_mode,status,created_at,updated_at) VALUES ('title.MULTI.new','MULTI','new','evidence','manual','active',3,3); UPDATE title_challenges SET replaced_by_challenge_id='title.MULTI.new' WHERE id='title.MULTI'");
    expect(() => sqlite.exec("UPDATE title_challenges SET replaced_by_challenge_id='missing' WHERE id='title.MULTI'")).toThrow(/FOREIGN KEY/);
    expect(() => sqlite.exec("UPDATE title_challenges SET ends_at=0 WHERE id='title.MULTI'")).toThrow(/CHECK/);
    expect(() => sqlite.exec("UPDATE title_challenges SET status='retired' WHERE id='title.MULTI'")).toThrow(/CHECK/);
    expect(sqlite.prepare("PRAGMA index_list('title_challenges')").all()).toContainEqual(expect.objectContaining({ name: "title_challenges_status_idx" }));
  });
});
