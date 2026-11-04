import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { evaluateCanonicalChallengeConditions, parseCanonicalChallengeConditions } from "@owbastion/domain";
import type { AdminTitleChallengeCreateRequest } from "@owbastion/contracts";
import type { AuthContext, VerifiedRunInput } from "@owbastion/domain";
import { createPlatformServices } from "./index";
import { assessChallengeOcrQuality } from "./ocr-response";
import { admin, achievementInput, canonicalChallengeIds, hashRequest, insertSubmission, progressCompletion, progressGrants, runInput, seedProgressReadRule, seedProgressReadRun, seedProgressReadSession, setup, type ProgressFixtureInput } from "./progress-test-harness";

describe("verified-run progress challenges", () => {

  it("completes and grants only after every required map has an eligible active run", async () => {
    const { sqlite, services } = setup();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);

    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));

    const completions = progressCompletion(sqlite);
    expect(completions).toHaveLength(1);
    expect(completions[0]).toMatchObject({ status: "active", source_type: "verified_run_progress", source_id: "account-1", gameplay_revision_id: null });
    const grants = progressGrants(sqlite);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ status: "active", source_type: "automatic", source_id: expect.stringMatching(/^title\.ANNIVERSARY_TOUR\..+:account-1$/), granted_by: "system:verified_run_progress", completion_id: completions[0]!.id });
    expect(canonicalChallengeIds(sqlite)).toHaveLength(1);
    expect(JSON.parse(canonicalChallengeIds(sqlite)[0]!.conditions_json)).toEqual({ operator: "and", conditions: [{ type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] }] });
  });

  it("counts only runs on the rule's standalone-mode revisions", async () => {
    const { sqlite, services } = setup();
    sqlite.exec(`
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES
        ('revision:map.alpha:mirror', 'map.alpha', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1),
        ('revision:map.beta:mirror', 'map.beta', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1);
      INSERT INTO standalone_modes (mode, event_weight_total, created_at, updated_at) VALUES ('2026镜中回响', NULL, 1, 1);
    `);
    await services.createProgressChallenge(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], mode: "2026 镜中回响" } }), admin, "create.mode");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    insertSubmission(sqlite, "submission-3", "account-1", 700);
    insertSubmission(sqlite, "submission-4", "account-1", 800);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha:mirror", sourceSubmissionId: "submission-3", matchCode: "3456-7890-1234" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta:mirror", sourceSubmissionId: "submission-4", matchCode: "4567-8901-2345" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
    expect(JSON.parse(canonicalChallengeIds(sqlite)[0]!.conditions_json).conditions[0]).toMatchObject({ mode: "2026镜中回响" });
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session-1', 'account-1', ?, ?)").run(await hashRequest("session-token"), Date.now() + 60_000);
    expect((await services.listCurrentPlayerChallengeProgress({ sessionToken: "session-token" }))!.items[0]).toMatchObject({
      progressRule: { mode: "2026镜中回响" },
      satisfied: true,
    });
  });

  it("follows every map of its standalone mode when the rule lists none", async () => {
    const { sqlite, services } = setup();
    const save = (mapIds: string[], key: string) => services.upsertAdminStandaloneMode({ contractVersion: "1", mode: "2026镜中回响", mapIds, eventPools: [], eventWeightTotal: null }, admin, key);
    await expect(services.createProgressChallenge(achievementInput({ progressRule: { type: "required_maps_completed", mode: "2026镜中回响" } }), admin, "create.unknown-mode")).rejects.toThrow("STANDALONE_MODE_NOT_FOUND");
    await save(["map.alpha", "map.beta"], "mode.two");
    await services.createProgressChallenge(achievementInput({ progressRule: { type: "required_maps_completed", mode: "2026镜中回响" } }), admin, "create.follow");
    const mirror = (mapId: string) => (sqlite.prepare("SELECT id FROM gameplay_revisions WHERE map_id = ? AND mode = '2026镜中回响'").get(mapId) as { id: string }).id;
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: mirror("map.alpha"), sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: mirror("map.beta"), sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(JSON.parse(canonicalChallengeIds(sqlite)[0]!.conditions_json)).toEqual({ operator: "and", conditions: [{ type: "required_maps_completed", mode: "2026镜中回响" }] });

    // A map added to the mode joins the requirement and the follow-on rule is reconciled at once.
    await save(["map.alpha", "map.beta", "map.gamma"], "mode.three");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    // The rule keeps one canonical identity while its maps follow the mode.
    expect(canonicalChallengeIds(sqlite)).toHaveLength(1);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session-1', 'account-1', ?, ?)").run(await hashRequest("session-token"), Date.now() + 60_000);
    expect((await services.listCurrentPlayerChallengeProgress({ sessionToken: "session-token" }))!.items[0]).toMatchObject({
      maps: [{ mapId: "map.alpha", completed: true }, { mapId: "map.beta", completed: true }, { mapId: "map.gamma", completed: false }],
      completedMaps: 2,
      satisfied: false,
    });
  });

  it("keeps standalone-mode runs out of a regular progress rule", async () => {
    const { sqlite, services } = setup();
    sqlite.exec(`
      INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, copied_from_revision_id, reset_reason, game_version, created_at, updated_at) VALUES
        ('revision:map.alpha:mirror', 'map.alpha', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1),
        ('revision:map.beta:mirror', 'map.beta', 'selectable', NULL, '2026镜中回响', NULL, NULL, '26.1001.1', 1, 1);
    `);
    await services.createProgressChallenge(achievementInput(), admin, "create.regular");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha:mirror", sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta:mirror", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);
  });

  it("keeps progress open for another player and counts only their own runs", async () => {
    const { sqlite, services } = setup();
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding-2', 'identity-2', 'account-2', 'qq', 'group-1', 'member-2', 'active', 1)").run();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-2", 600);

    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ playerAccountId: "account-2", mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2" }));
    expect(progressCompletion(sqlite)).toEqual([]);
  });

  it("honours the minimum difficulty threshold per map", async () => {
    const { sqlite, services } = setup();
    await services.createProgressChallenge(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha"], difficultyAtLeast: "专家" } }), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);

    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-2", difficulty: "专家", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("applies the event window to the source submission creation time", async () => {
    const { sqlite, services } = setup();
    await services.createProgressChallenge(achievementInput({ status: "active", gameVersion: "26.0810.1", startsAt: 1_000, endsAt: 2_000 }), admin, "create.1");
    // Runs recorded against submissions outside [startsAt, endsAt) do not count.
    insertSubmission(sqlite, "submission-early", "account-1", 500);
    insertSubmission(sqlite, "submission-alpha", "account-1", 1_500);
    insertSubmission(sqlite, "submission-late", "account-1", 2_500);
    insertSubmission(sqlite, "submission-beta", "account-1", 1_999);

    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-early" }));
    expect(progressCompletion(sqlite)).toEqual([]);
    await services.recordVerifiedRun(runInput({ mapId: "map.alpha", gameplayRevisionId: "revision:map.alpha", sourceSubmissionId: "submission-alpha", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-late", matchCode: "3456-7890-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-beta", matchCode: "4567-8901-2345" }));
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("invalidates and restores the derived completion and grant with the run", async () => {
    const { sqlite, services } = setup();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);

    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated", invalidation_reason: "evidence invalidated" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "revoked", revocation_type: "evidence" }]);

    await services.transitionAdminVerifiedRun({ contractVersion: "1", verifiedRunId: betaRun.run.runId, action: "restore" }, admin, "restore.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active", revocation_type: null }]);
  });

  it("reconciles when an admin corrects run facts across required maps", async () => {
    const { sqlite, services } = setup();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const gammaRun = await services.recordVerifiedRun(runInput({ mapId: "map.gamma", gameplayRevisionId: "revision:map.gamma", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    await services.correctAdminVerifiedRun({ contractVersion: "1", verifiedRunId: gammaRun.run.runId, changes: { mapId: "map.beta", gameplayRevisionId: "revision:map.beta" }, reason: "map attribution corrected" }, admin, "correct.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
  });

  it("keeps the title when a satisfied sibling path replaces the revoking grant owner", async () => {
    const { sqlite, services } = setup();
    // Path A needs both maps and grants first; path B (map.alpha only) is
    // added later and shares the player's satisfaction of map.alpha.
    await services.createProgressChallenge(achievementInput(), admin, "create.a");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
    const originalSource = progressGrants(sqlite)[0]!.source_id;

    // A second path that also satisfies the title must not leave the player
    // titleless when the first path's grant is revoked later.
    await services.createProgressChallenge(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha"] } }), admin, "create.b");
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);

    // Invalidate the beta run: path A stops being satisfied and revokes its
    // grant, while path B still satisfies the title and must re-issue it.
    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    const activeGrants = progressGrants(sqlite).filter(row => row.status === "active");
    expect(activeGrants).toHaveLength(1);
    const liveCompletion = sqlite.prepare("SELECT id FROM challenge_completions WHERE status = 'active'").get() as { id: string };
    expect(activeGrants[0]!.completion_id).toBe(liveCompletion.id);
    expect(activeGrants[0]!.source_id).not.toBe(originalSource);
    expect(progressCompletion(sqlite).filter(row => row.status === "active")).toHaveLength(1);
  });

  it("stays idempotent under repeated runs and reconciliation", async () => {
    const { sqlite, services } = setup();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    insertSubmission(sqlite, "submission-3", "account-1", 700);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const betaRun = await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toHaveLength(1);
    expect(progressGrants(sqlite)).toHaveLength(1);

    // A new run on an already-satisfied map re-triggers reconciliation.
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-3", matchCode: "3456-7890-1234" }));
    expect(progressCompletion(sqlite)).toHaveLength(1);
    expect(progressGrants(sqlite)).toHaveLength(1);

    // A replayed record reconciles the same run again without duplicating rows.
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    expect(progressCompletion(sqlite)).toHaveLength(1);
    expect(progressGrants(sqlite)).toHaveLength(1);

    // A no-op status transition replays the reconciliation path harmlessly.
    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "invalidated" }]);
    await services.invalidateVerifiedRun({ verifiedRunId: betaRun.run.runId }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressCompletion(sqlite)).toHaveLength(1);
  });

  it("reconciles already-eligible players when the challenge is created", async () => {
    const { sqlite, services } = setup();
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressCompletion(sqlite)).toEqual([]);

    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toMatchObject([{ status: "active" }]);
  });

  const insertMapGrant = (sqlite: DatabaseSync, titleKey: string, mapId: string, sourceType = "historical") =>
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, status, source_type, source_id, granted_by, granted_at) VALUES (?, 'account-1', ?, ?, ?, 'active', ?, ?, 'admin.1', 1)")
      .run(`grant:${titleKey}:${mapId}`, titleKey, mapId, `revision:${mapId}`, sourceType, `${sourceType}:${titleKey}:${mapId}`);

  it("counts held map titles without a Verified Run when the player's progress is read", async () => {
    const { sqlite, services } = setup();
    await seedProgressReadSession(sqlite);
    seedProgressReadRule(sqlite, { id: "held", rule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "传奇" } });
    insertMapGrant(sqlite, "CONQUEROR", "map.alpha");
    insertMapGrant(sqlite, "DOMINATOR", "map.beta");
    const { items } = (await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" }))!;
    expect(items).toMatchObject([{ completedMaps: 2, satisfied: true }]);
  });

  it("does not let a Conqueror title satisfy a Hell-level rule or a revoked title count", async () => {
    const { sqlite, services } = setup();
    await seedProgressReadSession(sqlite);
    seedProgressReadRule(sqlite, { id: "hell", rule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "地狱" } });
    insertMapGrant(sqlite, "CONQUEROR", "map.alpha");
    insertMapGrant(sqlite, "DOMINATOR", "map.beta");
    expect((await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" }))!.items).toMatchObject([{ completedMaps: 1, satisfied: false }]);

    insertMapGrant(sqlite, "DOMINATOR", "map.alpha");
    sqlite.prepare("UPDATE player_title_grants SET status = 'revoked', revoked_at = 2, revocation_type = 'administrator' WHERE id = 'grant:DOMINATOR:map.beta'").run();
    expect((await services.listCurrentPlayerChallengeProgress({ sessionToken: "read-token" }))!.items).toMatchObject([{ completedMaps: 1, satisfied: false }]);
  });

  it("requires a new progress challenge for qualification changes and preserves predecessor awards", async () => {
    const { sqlite, services } = setup();
    const first = await services.createProgressChallenge(achievementInput({ progressRule: { type: "required_maps_completed", mapIds: ["map.alpha"] } }), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    const before = progressGrants(sqlite);
    const update = { contractVersion: "1" as const, family: "achievement" as const, challengeId: first.challengeId, saveMode: "in_place" as "in_place" | "new_challenge", condition: first.condition, evidenceRule: first.evidenceRule, submissionMode: first.submissionMode, categoryOverride: null, status: "active" as const, gameVersion: first.gameVersion, progressRule: { type: "required_maps_completed" as const, mapIds: ["map.alpha", "map.beta"] } };
    await expect(services.updateAdminChallenge(update, admin, "reject")).rejects.toThrow("CHALLENGE_QUALIFICATION_CHANGED");
    const next = await services.updateAdminChallenge({ ...update, saveMode: "new_challenge" }, admin, "replace");
    expect(next.challengeId).not.toBe(first.challengeId);
    expect(progressCompletion(sqlite)).toMatchObject([{ status: "active" }]);
    expect(progressGrants(sqlite)).toEqual(before);
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    expect(progressGrants(sqlite)).toEqual(before);
    expect(progressCompletion(sqlite).every(row => row.status === "active")).toBe(true);
    const screenshot = await services.updateAdminChallenge({ ...update, challengeId: next.challengeId, saveMode: "new_challenge", progressRule: null }, admin, "remove-rule");
    expect(screenshot).not.toHaveProperty("progressRule");
    expect(progressGrants(sqlite)).toEqual(before);
    expect(progressCompletion(sqlite).every(row => row.status === "active")).toBe(true);
  });

  it("exposes privacy-safe per-map progress to the owning player only", async () => {
    const { sqlite, services } = setup();
    const startsAt = Date.now() - 60_000;
    const endsAt = Date.now() + 3_600_000;
    await services.createProgressChallenge(achievementInput({ status: "active", startsAt, endsAt, progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "困难" } }), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", startsAt + 1);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1", acceptedAt: startsAt + 1 }));
    const tokenHash = await hashRequest("session-token");
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session-1', 'account-1', ?, ?)").run(tokenHash, Date.now() + 60_000);

    const response = await services.listCurrentPlayerChallengeProgress({ sessionToken: "session-token" });
    expect(response).not.toBeNull();
    expect(response!.items).toHaveLength(1);
    expect(response!.items[0]).toMatchObject({
      challengeId: expect.stringMatching(/^title\.ANNIVERSARY_TOUR\..+/),
      titleKey: "ANNIVERSARY_TOUR",
      status: "active",
      startsAt,
      endsAt,
      progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "困难" },
      maps: [{ mapId: "map.alpha", completed: true }, { mapId: "map.beta", completed: false }],
      completedMaps: 1,
      satisfied: false,
    });
    expect(Object.keys(response!.items[0]!).sort()).toEqual(["challengeId", "completedMaps", "endsAt", "icon", "maps", "progressRule", "satisfied", "startsAt", "status", "titleKey", "titleName"].sort());

    expect(await services.listCurrentPlayerChallengeProgress({ sessionToken: "unknown-token" })).toBeNull();
  });

  it("scopes grant mutations to the reconciled player", async () => {
    const { sqlite, services } = setup();
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding-2', 'identity-2', 'account-2', 'qq', 'group-1', 'member-2', 'active', 1)").run();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    insertSubmission(sqlite, "submission-1", "account-1", 500);
    insertSubmission(sqlite, "submission-2", "account-1", 600);
    insertSubmission(sqlite, "submission-3", "account-2", 500);
    insertSubmission(sqlite, "submission-4", "account-2", 600);
    await services.recordVerifiedRun(runInput({ sourceSubmissionId: "submission-1" }));
    await services.recordVerifiedRun(runInput({ mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-2", matchCode: "2345-6789-1234" }));
    await services.recordVerifiedRun(runInput({ playerAccountId: "account-2", sourceSubmissionId: "submission-3", matchCode: "3456-7890-1234" }));
    const betaRun2 = await services.recordVerifiedRun(runInput({ playerAccountId: "account-2", mapId: "map.beta", gameplayRevisionId: "revision:map.beta", sourceSubmissionId: "submission-4", matchCode: "4567-8901-2345" }));

    const grants = progressGrants(sqlite);
    expect(grants).toHaveLength(2);
    expect(grants.map(({ player_account_id }) => player_account_id).sort()).toEqual(["account-1", "account-2"]);

    await services.invalidateVerifiedRun({ verifiedRunId: betaRun2.run.runId, reason: "evidence invalidated" }, { actorType: "user", actorId: "maintainer-1" });
    expect(progressGrants(sqlite)).toMatchObject([
      { player_account_id: "account-1", status: "active" },
      { player_account_id: "account-2", status: "revoked", revocation_type: "evidence" },
    ]);
    const completions = progressCompletion(sqlite);
    expect(completions.filter((completion) => completion.status === "active")).toHaveLength(1);
    expect(completions.filter((completion) => completion.status === "invalidated")).toHaveLength(1);

    await services.transitionAdminVerifiedRun({ contractVersion: "1", verifiedRunId: betaRun2.run.runId, action: "restore" }, admin, "restore.1");
    expect(progressGrants(sqlite)).toMatchObject([
      { player_account_id: "account-1", status: "active" },
      { player_account_id: "account-2", status: "active", revocation_type: null },
    ]);
  });

  it("keeps aggregate conditions out of screenshot evidence evaluation", async () => {
    const conditions = parseCanonicalChallengeConditions(JSON.stringify({ operator: "and", conditions: [{ type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] }] }));
    const evaluation = evaluateCanonicalChallengeConditions(conditions, { mapId: "map.alpha", completed: true, difficulty: "地狱", achievementTitles: ["到此一游"] });
    expect(evaluation.matched).toBe(false);

    // The quality gate also demands evidence fields OCR can never provide.
    const quality = assessChallengeOcrQuality(conditions, { ok: true, fields: {}, data: {} });
    expect(quality.accepted).toBe(false);
    expect(quality.reasons).toContain("verified_runs:missing_value");

    // The public catalog still exposes the rule so clients can render progress.
    const { services } = setup();
    await services.createProgressChallenge(achievementInput(), admin, "create.1");
    const publicList = await services.listChallenges({ family: "achievement" });
    expect(publicList).toMatchObject([{ challengeId: expect.stringMatching(/^title\.ANNIVERSARY_TOUR\..+/), progressRule: { type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"] } }]);
  });
});
