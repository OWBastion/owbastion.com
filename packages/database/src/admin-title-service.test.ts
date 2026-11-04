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

  it("ends a title by ending its open challenges and keeps catalog updates to title fields", async () => {
    const { services, sqlite, database } = setup();
    await services.createAdminTitle(titleInput, auth, "title");
    const first = await services.createAdminTitleChallenge({ ...challengeInput, startsAt: 1_000, endsAt: 3_000 }, auth, "one");
    await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: first.challengeId, status: "active", retiredVersion: "26.1101.1" }, auth, "sunset");
    sqlite.exec("INSERT INTO map_title_rules (id,title_key,kind,condition,evidence_rule,display_kind,status,introduced_version,retired_version,created_at,updated_at) VALUES ('rule.test','MULTI','test','rule','evidence','fixed','active','26.1003.1','26.1201.1',1,1)");
    const batch = vi.spyOn(database, "batch");
    const updated = await services.updateAdminCatalogTitle({ contractVersion: "1", titleKey: "MULTI", label: "改名" }, auth, "rename");
    expect(batch).toHaveBeenCalledTimes(1);
    // The map rule path dominates the derived status over the sunsetting challenge.
    expect(updated).toMatchObject({ previousLifecycle: "active", title: { label: "改名", status: "active" } });
    // No stored retired lifecycle: the update cannot change challenge or rule rows.
    expect(sqlite.prepare("SELECT status,retired_version FROM title_challenges WHERE id=?").get(first.challengeId)).toEqual({ status: "active", retired_version: "26.1101.1" });
    expect(sqlite.prepare("SELECT status,retired_version FROM map_title_rules WHERE id='rule.test'").get()).toEqual({ status: "active", retired_version: "26.1201.1" });
    // Ending every open challenge derives the title's ended status only once
    // no active map-rule path remains; undo restores each challenge's previous
    // window state individually.
    const ended = await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: first.challengeId, status: "archived" }, auth, "end");
    expect(ended.previous).toMatchObject({ status: "active", retiredVersion: "26.1101.1" });
    expect((await services.listAdminTitleSummaries(auth)).items.find(row => row.titleKey === "MULTI")).toMatchObject({ status: "active" });
    sqlite.exec("DELETE FROM map_title_rules WHERE id='rule.test'");
    expect((await services.listAdminTitleSummaries(auth)).items.find(row => row.titleKey === "MULTI")).toMatchObject({ status: "ended" });
    await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: first.challengeId, ...ended.previous }, auth, "undo-end");
    expect((await services.listAdminTitleChallenges({ titleKey: "MULTI" }, auth)).items[0]).toMatchObject({ status: "active", retiredVersion: "26.1101.1", startsAt: 1_000, endsAt: 3_000 });
  });

  it("derives draft/ended/empty/map-rule/multi-path states and excludes manual issuance", async () => {
    const { services, sqlite } = setup();
    for (const [key, lifecycle] of [["DRAFT", "draft"], ["ENDED", "active"], ["EMPTY", "active"], ["RULE", "active"], ["MULTI", "active"], ["MANUAL", "active"]]) {
      seedTitle(sqlite, key!);
      sqlite.prepare("UPDATE title_catalog SET lifecycle=?,scope='global',category='测试',label=?,game_version='26.1003.1' WHERE key=?").run(lifecycle!, key!, key!);
    }
    sqlite.exec("INSERT INTO map_title_rules (id,title_key,kind,condition,evidence_rule,display_kind,status,introduced_version,created_at,updated_at) VALUES ('rule.test','RULE','test','rule condition','evidence','fixed','active','26.1003.1',1,1)");
    sqlite.exec("INSERT INTO challenges (id,source_family,source_id,title_key,status,manual,public_condition,condition_operator,conditions_json,condition,created_at,updated_at) VALUES ('manual:MANUAL','manual','manual:MANUAL','MANUAL','active',1,0,'and','[]','manual',1,1)");
    sqlite.exec("INSERT INTO title_challenges (id,title_key,condition,evidence_rule,submission_mode,status,game_version,scope,created_at,updated_at) VALUES ('title.ENDED.one','ENDED','条件','证据','manual','archived','26.1003.1','global',1,1)");
    const scheduled = await services.createAdminTitleChallenge({ ...challengeInput, startsAt: 3_000 }, auth, "future");
    const sunset = await services.createAdminTitleChallenge(challengeInput, auth, "sunset");
    await services.updateAdminChallengeLifecycle({ contractVersion: "1", challengeId: sunset.challengeId, status: "active", retiredVersion: "26.1101.1" }, auth, "sunset-version");
    let response = await services.listAdminTitleSummaries(auth);
    expect(adminTitleSummaryListResponseSchema.safeParse(response).success).toBe(true);
    expect(response.items.map(row => [row.titleKey, row.status])).toEqual([["DRAFT", "draft"], ["EMPTY", "ended"], ["ENDED", "ended"], ["MANUAL", "ended"], ["MULTI", "sunsetting"], ["RULE", "active"]]);
    expect(response.items.find(row => row.titleKey === "MANUAL")!.acquisition).toEqual({ kind: "none" });
    expect((await services.listAdminTitleChallenges({ titleKey: "MANUAL" }, auth)).items).toEqual([]);
    await services.createAdminTitleChallenge(challengeInput, auth, "active");
    response = await services.listAdminTitleSummaries(auth);
    expect(response.items.find(row => row.titleKey === "MULTI")).toMatchObject({ status: "active", acquisition: { kind: "challenges", challengeCount: 3, completableCount: 2 } });
    expect(await services.listChallenges({ family: "achievement" })).toContainEqual(expect.objectContaining({ challengeId: scheduled.challengeId, status: "scheduled" }));
  });

});
