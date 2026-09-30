import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createTestDatabase, now, seedCompat, seedException, seedMap, seedRule, seedTitle } from "../test/map-title-rule-fixtures";

describe("maintainer Challenge confirmation during submission review", () => {
  const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
  const writeCounts = (sqlite: DatabaseSync, submissionId: string) => ({
    reviews: (sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = ?").get(submissionId) as { count: number }).count,
    completions: (sqlite.prepare("SELECT COUNT(*) AS count FROM challenge_completions WHERE source_id = ?").get(submissionId) as { count: number }).count,
    grants: (sqlite.prepare("SELECT COUNT(*) AS count FROM player_title_grants WHERE source_id = ?").get(submissionId) as { count: number }).count,
    status: (sqlite.prepare("SELECT status FROM submissions WHERE id = ?").get(submissionId) as { status: string }).status,
  });

  const databaseContents = (sqlite: DatabaseSync) => Object.fromEntries((sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>)
    .map(({ name }) => [name, sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));

  const seedIncompleteMapEvidence = (sqlite: DatabaseSync) => {
    seedMap(sqlite, "map.paris");
    seedTitle(sqlite, "PIONEER");
    seedRule(sqlite, "rule.pioneer", "PIONEER", "pioneer", { slot: "pioneer", defaultScope: "explicit" });
    seedException(sqlite, "exception.pioneer.paris", "rule.pioneer", "map.paris", { startsAt: now - 10_000, endsAt: now + 10_000 });
    seedCompat(sqlite, "map.paris.pioneer", "rule.pioneer", "map.paris");
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.confirm', 'confirm-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.confirm', 'identity.confirm', 'player.confirm', 'qq', 'group.confirm', 'member.confirm', 'active', ?)").run(now);
    sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.confirm', 'binding.confirm', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.confirm', ?, ?)").run(now, now);
    // The completion marker is absent, so the Pioneer Conditions cannot be decided from OCR alone.
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.confirm', 'submission.confirm', 1, 'review_required', ?, ?, ?)").run(
      JSON.stringify({ schema_version: "1", ok: true, layout_version: "1280x720-v6", data: { map_name: "地图 map.paris", difficulty: "地狱" } }),
      JSON.stringify({ candidates: [{ challengeId: "map.paris.pioneer", quality: { accepted: false, reasons: ["achievement_evidence:low_confidence"] } }] }),
      now,
    );
  };

  const seedAchievementEvidence = (sqlite: DatabaseSync, titles: string[]) => {
    seedTitle(sqlite, "HERO");
    sqlite.prepare("UPDATE title_catalog SET scope = 'global' WHERE key = 'HERO'").run();
    sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, game_version, status, introduced_version, scope, created_at, updated_at) VALUES ('title.hero', 'HERO', '完成英雄挑战', '带勾称号', 'manual', '2026.07.15', 'active', '2026.07.15', 'global', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.add', 'add-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.add', 'identity.add', 'player.add', 'qq', 'group.add', 'member.add', ?)").run(now);
    sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.add', 'binding.add', 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'message.add', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.add', 'submission.add', 1, 'review_required', ?, ?)").run(JSON.stringify({ schema_version: "1", ok: true, layout_version: "1280x720-v6", data: { achievement_titles: titles } }), now);
  };

  it("previews and approves a displayed Challenge that the maintainer confirms from the screenshot", async () => {
    const { database, sqlite } = createTestDatabase();
    seedIncompleteMapEvidence(sqlite);
    const services = createPlatformServices(database);
    const beforePreview = databaseContents(sqlite);

    const unconfirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    const pioneer = unconfirmed.candidates.find((candidate) => candidate.titleName === "称号 PIONEER");
    expect(pioneer).toMatchObject({ family: "map", evidence: "needs_confirmation", missingFields: ["challenge_completed"], selectedBy: null });
    expect(unconfirmed).toMatchObject({ evidenceOutcome: "review", titles: [], completions: [], approvable: false, blockingCode: "SUBMISSION_OUTCOME_NOT_CONFIGURED" });
    expect(JSON.stringify(unconfirmed)).not.toContain("achievement_evidence");

    const confirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm", confirmedChallengeIds: [pioneer!.challengeId] }, auth);
    expect(confirmed.candidates.find((candidate) => candidate.challengeId === pioneer!.challengeId)).toMatchObject({ selectedBy: "reviewer" });
    expect(confirmed).toMatchObject({
      approvable: true,
      blockingCode: null,
      titles: [{ titleKey: "PIONEER", titleName: "称号 PIONEER", mapName: "地图 map.paris", alreadyOwned: false }],
      completions: [{ challengeId: pioneer!.challengeId, titleKey: "PIONEER", basis: "reviewer" }],
    });
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 0, completions: 0, grants: 0, status: "ocr_review_required" });
    // Preview is read-only: canonical Challenges it plans are materialized only by the approval.
    expect(databaseContents(sqlite)).toEqual(beforePreview);
    await expect(services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved" }, auth, "confirm.without")).rejects.toThrow("SUBMISSION_OUTCOME_NOT_CONFIGURED");

    const result = await services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved", confirmedChallengeIds: [pioneer!.challengeId] }, auth, "confirm.with");
    expect(result).toMatchObject({ decision: "approved", titleKey: "PIONEER", alreadyOwned: false });
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 1, completions: 1, grants: 1, status: "approved" });
    expect(sqlite.prepare("SELECT g.title_key, g.map_id, g.slot, c.challenge_id, c.source_type FROM player_title_grants g JOIN challenge_completions c ON c.id = g.completion_id WHERE g.source_id = 'submission.confirm'").get()).toEqual({ title_key: "PIONEER", map_id: "map.paris", slot: "pioneer", challenge_id: pioneer!.challengeId, source_type: "submission" });
    const outcome = sqlite.prepare("SELECT details_json FROM submission_outcomes WHERE submission_id = 'submission.confirm' AND outcome_type = 'challenge'").get() as { details_json: string };
    expect(JSON.parse(outcome.details_json)).toMatchObject({ basis: "reviewer" });
    const audit = sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'submission.review' AND entity_id = 'submission.confirm'").get() as { payload_json: string };
    expect(JSON.parse(audit.payload_json)).toMatchObject({ evidenceMatchedChallengeIds: [], reviewerConfirmedChallengeIds: [pioneer!.challengeId] });

    // A maintainer may decide again: the latest review is current, and the Submission decision never revokes Titles already granted.
    await services.reviewSubmission({ submissionId: "submission.confirm", decision: "rejected", reason: "截图裁剪" }, auth, "confirm.reject");
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 2, completions: 1, grants: 1, status: "rejected" });
    expect(sqlite.prepare("SELECT status FROM player_title_grants WHERE source_id = 'submission.confirm'").get()).toEqual({ status: "active" });
    const grantId = (sqlite.prepare("SELECT id FROM player_title_grants WHERE source_id = 'submission.confirm'").get() as { id: string }).id;
    expect(await services.getAdminSubmission({ submissionId: "submission.confirm" }, auth)).toMatchObject({ status: "rejected", review: { decision: "rejected", automatic: false, reason: "截图裁剪" }, activeTitleGrants: [{ grantId, titleKey: "PIONEER", titleName: "称号 PIONEER" }] });

    // The Title is still held, so the Challenge is no longer confirmable; re-approval rests on what this Submission already granted.
    const reapproval = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    expect(reapproval).toMatchObject({ approvable: true, blockingCode: null, titles: [{ titleKey: "PIONEER", mapName: "地图 map.paris", alreadyOwned: true }] });
    await expect(services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved" }, auth, "confirm.reapprove")).resolves.toMatchObject({ decision: "approved", grantId, titleKey: "PIONEER", alreadyOwned: true });
    expect(writeCounts(sqlite, "submission.confirm")).toEqual({ reviews: 3, completions: 1, grants: 1, status: "approved" });
    expect(sqlite.prepare("SELECT grant_id FROM submissions WHERE id = 'submission.confirm'").get()).toEqual({ grant_id: grantId });
    expect(await services.getAdminSubmission({ submissionId: "submission.confirm" }, auth)).toMatchObject({ review: { decision: "approved", reason: null } });
    const reapprovalAudit = sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'submission.review' AND entity_id = 'submission.confirm' ORDER BY rowid DESC LIMIT 1").get() as { payload_json: string };
    expect(JSON.parse(reapprovalAudit.payload_json)).toMatchObject({ decision: "approved", retainedGrants: [{ grantId, titleKey: "PIONEER" }] });
  });

  it("keeps the preview read-only when approval would replace a legacy canonical Challenge", async () => {
    const { database, sqlite } = createTestDatabase();
    seedIncompleteMapEvidence(sqlite);
    sqlite.prepare("INSERT INTO challenges (id, source_family, source_id, title_key, rule_version, map_id, gameplay_revision_id, status, manual, public_condition, condition_operator, conditions_json, condition, starts_at, ends_at, created_at, updated_at) VALUES ('challenge.legacy-pioneer', 'map_title_rule', 'map.paris.pioneer', 'PIONEER', 'legacy', 'map.paris', 'revision:map.paris:initial', 'active', 0, 1, 'and', ?, '旧条件', NULL, NULL, ?, ?)")
      .run(JSON.stringify({ operator: "and", conditions: [{ type: "map", mapId: "map.paris" }, { type: "completed" }] }), now, now);
    const services = createPlatformServices(database);
    const beforePreview = databaseContents(sqlite);

    const unconfirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm" }, auth);
    const pioneer = unconfirmed.candidates.find((candidate) => candidate.titleName === "称号 PIONEER");
    expect(pioneer?.challengeId).not.toBe("challenge.legacy-pioneer");
    const confirmed = await services.previewSubmissionReview({ submissionId: "submission.confirm", confirmedChallengeIds: [pioneer!.challengeId] }, auth);
    expect(confirmed).toMatchObject({ approvable: true, blockingCode: null, completions: [{ challengeId: pioneer!.challengeId, titleKey: "PIONEER", basis: "reviewer" }] });
    expect(databaseContents(sqlite)).toEqual(beforePreview);

    await services.reviewSubmission({ submissionId: "submission.confirm", decision: "approved", confirmedChallengeIds: [pioneer!.challengeId] }, auth, "confirm.legacy");
    expect(sqlite.prepare("SELECT id, status FROM challenges ORDER BY id").all()).toEqual([
      { id: "challenge.legacy-pioneer", status: "archived" },
      { id: pioneer!.challengeId, status: "active" },
    ].sort((left, right) => left.id.localeCompare(right.id)));
    expect(sqlite.prepare("SELECT challenge_id FROM challenge_completions WHERE source_id = 'submission.confirm'").get()).toEqual({ challenge_id: pioneer!.challengeId });
  });

  it("orders the review queue by longest wait when asked", async () => {
    const { database, sqlite } = createTestDatabase();
    seedIncompleteMapEvidence(sqlite);
    seedAchievementEvidence(sqlite, ["SECOND"]);
    sqlite.prepare("UPDATE submissions SET updated_at = ? WHERE id = 'submission.add'").run(now - 60_000);
    const services = createPlatformServices(database);
    const list = (order?: "oldest" | "newest") => services.listAdminSubmissions({ statuses: ["ocr_review_required"], page: 1, pageSize: 20, ...(order ? { order } : {}) }, auth);
    expect((await list("oldest")).items.map((item) => item.submissionId)).toEqual(["submission.add", "submission.confirm"]);
    expect((await list("newest")).items.map((item) => item.submissionId)).toEqual(["submission.confirm", "submission.add"]);
    expect((await list()).items.map((item) => item.submissionId)).toEqual(["submission.confirm", "submission.add"]);
  });

  it("adds an eligible Challenge that OCR did not propose and recomputes corrected evidence with the same matcher", async () => {
    const { database, sqlite } = createTestDatabase();
    seedAchievementEvidence(sqlite, ["SECOND"]);
    const services = createPlatformServices(database);

    const preview = await services.previewSubmissionReview({ submissionId: "submission.add" }, auth);
    const hero = preview.candidates.find((candidate) => candidate.titleName === "称号 HERO");
    expect(hero).toMatchObject({ family: "achievement", kind: "title_achievement", label: "称号 HERO", condition: "完成英雄挑战", evidence: "not_matched", selectedBy: null });
    expect(preview.approvable).toBe(false);

    const corrected = await services.previewSubmissionReview({ submissionId: "submission.add", fieldCorrections: [{ fieldKey: "achievement_titles", reviewedValue: "称号 HERO、SECOND" }] }, auth);
    expect(corrected.candidates.find((candidate) => candidate.challengeId === hero!.challengeId)).toMatchObject({ evidence: "matched", selectedBy: "conditions" });
    expect(corrected).toMatchObject({ evidenceOutcome: "automatic", approvable: true, titles: [{ titleKey: "HERO", alreadyOwned: false }], completions: [{ basis: "conditions" }] });

    const result = await services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [hero!.challengeId] }, auth, "add.hero");
    expect(result).toMatchObject({ decision: "approved", titleKey: "HERO" });
    expect(writeCounts(sqlite, "submission.add")).toEqual({ reviews: 1, completions: 1, grants: 1, status: "approved" });
    // A manual confirmation is reviewed evidence, not a corrected OCR field.
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM reviewed_annotations WHERE submission_id = 'submission.add'").get()).toEqual({ count: 0 });
  });

  it("rejects confirmations outside the Submission's eligible Challenges without writing", async () => {
    const { database, sqlite } = createTestDatabase();
    seedAchievementEvidence(sqlite, ["SECOND"]);
    const services = createPlatformServices(database);
    const heroId = (await services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).candidates.find((candidate) => candidate.titleName === "称号 HERO")!.challengeId;

    const unknown = await services.previewSubmissionReview({ submissionId: "submission.add", confirmedChallengeIds: ["challenge.unknown"] }, auth);
    expect(unknown).toMatchObject({ approvable: false, blockingCode: "CHALLENGE_CONFIRMATION_INELIGIBLE", titles: [] });
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: ["challenge.unknown"] }, auth, "add.unknown")).rejects.toThrow("CHALLENGE_CONFIRMATION_INELIGIBLE");

    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at, revoked_by, revoked_at, revoke_reason, revocation_type) VALUES ('grant.hero.revoked', 'player.add', 'HERO', 'revoked', 'manual', 'manual:old', 'admin', ?, 'admin', ?, 'blocked', 'administrator')").run(now, now);
    expect((await services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).candidates.some((candidate) => candidate.challengeId === heroId)).toBe(false);
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [heroId] }, auth, "add.revoked")).rejects.toThrow("CHALLENGE_CONFIRMATION_INELIGIBLE");

    sqlite.prepare("DELETE FROM player_title_grants WHERE id = 'grant.hero.revoked'").run();
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.hero.owned', 'player.add', 'HERO', 'active', 'manual', 'manual:old', 'admin', ?)").run(now);
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [heroId] }, auth, "add.owned")).rejects.toThrow("CHALLENGE_CONFIRMATION_INELIGIBLE");

    sqlite.prepare("DELETE FROM player_title_grants WHERE id = 'grant.hero.owned'").run();
    // The canonical Challenge window starts after the Submission was created, so the Completion chain must refuse it.
    sqlite.prepare("UPDATE title_challenges SET starts_at = ? WHERE id = 'title.hero'").run(now + 60_000);
    const notStartedId = (await services.previewSubmissionReview({ submissionId: "submission.add" }, auth)).candidates.find((candidate) => candidate.titleName === "称号 HERO")!.challengeId;
    expect(await services.previewSubmissionReview({ submissionId: "submission.add", confirmedChallengeIds: [notStartedId] }, auth)).toMatchObject({ approvable: false, blockingCode: "CHALLENGE_NOT_COMPLETABLE", titles: [] });
    await expect(services.reviewSubmission({ submissionId: "submission.add", decision: "approved", confirmedChallengeIds: [notStartedId] }, auth, "add.not-started")).rejects.toThrow("CHALLENGE_NOT_COMPLETABLE");

    expect(writeCounts(sqlite, "submission.add")).toEqual({ reviews: 0, completions: 0, grants: 0, status: "ocr_review_required" });
  });
});
