import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createTestDatabase, fakeEvidenceBucket, localVerifiedRunEvidenceCompatibility, masteryOcr, now, seedMasteryPlayer, seedMasterySubmission } from "../test/map-title-rule-fixtures";

const automaticRunFacts = {
  mapId: "map.mastery",
  gameplayRevisionId: "revision:map.mastery:initial",
  mapVariant: null,
  difficulty: "困难",
  gameVersion: "99.0101.1",
  matchCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 1,
  skips: 0,
  eventCounters: {},
  acceptanceSource: "submission_automatic",
  acceptedAt: now,
} as const;

// One match code identifies one Verified Run per player, map and game version.
describe("match code duplicates", () => {
  it("refuses a later Submission with the same match code and different facts, keeping the earlier Run and its titles", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.supersede", "binding.supersede", "Supersede Player");
    seedMasterySubmission(sqlite, "submission.supersede-first", "binding.supersede", "Supersede Player");
    seedMasterySubmission(sqlite, "submission.supersede-second", "binding.supersede", "Supersede Player");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = 'submission.supersede-second'").run("map.mastery");
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.supersede-second', 'submission.supersede-second', 1, 'review_required', ?, ?)").run(JSON.stringify(masteryOcr()), now);
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const first = await services.recordVerifiedRun({ ...automaticRunFacts, playerAccountId: "player.supersede", sourceSubmissionId: "submission.supersede-first" });
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const corrections = [{ fieldKey: "difficulty", reviewedValue: "传奇" }];
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.prepare("INSERT INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) VALUES ('completion.first', 'player.supersede', 'challenge.first', NULL, 'active', 'submission', 'submission.supersede-first', ?, ?)").run(now, now);
    sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) VALUES ('grant.first', 'player.supersede', 'HERO', NULL, NULL, NULL, 'active', 'submission', 'submission.supersede-first', 'admin', ?, 'completion.first')").run(now);

    const preview = await services.previewSubmissionReview({ submissionId: "submission.supersede-second", fieldCorrections: corrections }, maintainer);
    expect(preview).toMatchObject({ approvable: false, blockingCode: "SUBMISSION_RUN_CODE_CONFLICT" });

    await expect(services.reviewSubmission({ submissionId: "submission.supersede-second", decision: "approved", fieldCorrections: corrections }, maintainer, "review.supersede")).rejects.toThrow("SUBMISSION_RUN_CODE_CONFLICT");
    expect(sqlite.prepare("SELECT status FROM mastery_runs WHERE id = ?").get(first.run.runId)).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.supersede-second'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT status FROM player_title_grants WHERE id = 'grant.first'").get()).toEqual({ status: "active" });
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.supersede-second'").get()).toEqual({ status: "ocr_review_required" });
  });

  it("resolves every combination of the Submission's own Run and another Run holding the match code", async () => {
    // Own Run states: at the evidence key (K) or a different code, equal or differing facts, active or invalidated.
    // Another Submission's Run for the key: absent, active with equal or differing facts, or maintainer-invalidated.
    const own = ["none", "act-K-eq", "act-K-diff", "act-other", "inv-reopened-K", "inv-super-K", "inv-super-other", "inv-admin-K"] as const;
    const other = ["none", "act-eq", "act-diff", "inv-eq"] as const;
    for (const o of own) for (const x of other) {
      if (o.startsWith("act-K") && x.startsWith("act")) continue;
      const { database, sqlite } = createTestDatabase("map.mastery");
      seedMasteryPlayer(sqlite, "player.m", "binding.m", "M Player");
      for (const id of ["s.own", "s.other"]) seedMasterySubmission(sqlite, id, "binding.m", "M Player");
      sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = 's.own'").run("map.mastery");
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES ('ocr.own', 's.own', 1, 'review_required', ?, ?)").run(JSON.stringify(masteryOcr()), now);
      const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
      const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
      if (x !== "none") {
        const xr = await services.recordVerifiedRun({ ...automaticRunFacts, playerAccountId: "player.m", sourceSubmissionId: "s.other", ...(x === "act-diff" ? { difficulty: "传奇" } : {}) });
        if (x === "inv-eq") sqlite.prepare("UPDATE mastery_runs SET status='invalidated', invalidation_reason='admin' WHERE id=?").run(xr.run.runId);
      }
      if (o !== "none") {
        const ownRun = await services.recordVerifiedRun({ ...automaticRunFacts, playerAccountId: "player.m", sourceSubmissionId: "s.own", matchCode: "9999-8888-7777", ...(o === "act-K-diff" ? { difficulty: "传奇" } : {}) });
        const invalid = o.startsWith("inv");
        if (invalid) sqlite.prepare("UPDATE mastery_runs SET status='invalidated', invalidation_reason=? WHERE id=?").run(o.startsWith("inv-reopened") ? "submission_reopened" : o.startsWith("inv-super") ? "Superseded by reviewed Submission x (gameplay_revision)" : "admin", ownRun.run.runId);
        if (o.endsWith("-K")) sqlite.prepare("UPDATE mastery_runs SET run_code='1234-5678-9012' WHERE id=?").run(ownRun.run.runId);
      }
      // A duplicate of an active Run is reused, a differing active Run is a conflict that blocks approval, an
      // invalidation by a maintainer stands, and everything else records the reviewed evidence.
      const expected = x === "act-eq" ? "reused"
        : x === "act-diff" ? "conflict"
          : o.startsWith("inv-super") || o.startsWith("inv-admin") || (o === "none" && x === "inv-eq") ? "blocked"
            : "created";
      const preview = await services.previewSubmissionReview({ submissionId: "s.own" }, maintainer);
      expect(preview.approvable, `${o}/${x}`).toBe(expected !== "blocked" && expected !== "conflict");
      if (expected === "blocked" || expected === "conflict") {
        const code = expected === "conflict" ? "SUBMISSION_RUN_CODE_CONFLICT" : "SUBMISSION_OUTCOME_NOT_CONFIGURED";
        expect(preview.blockingCode, `${o}/${x}`).toBe(code);
        await expect(services.reviewSubmission({ submissionId: "s.own", decision: "approved" }, maintainer, "r.m"), `${o}/${x}`).rejects.toThrow(code);
      } else {
        const approved = await services.reviewSubmission({ submissionId: "s.own", decision: "approved" }, maintainer, "r.m");
        expect(approved.verifiedRunOutcome?.status, `${o}/${x}`).toBe(expected);
      }
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM (SELECT 1 FROM mastery_runs WHERE status = 'active' GROUP BY player_account_id, map_id, game_version, run_code HAVING COUNT(*) > 1)").get(), `${o}/${x}`).toEqual({ count: 0 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 's.own'").get() as { count: number }, `${o}/${x}`).toEqual({ count: o === "none" && expected !== "created" ? 0 : 1 });
      expect((sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 's.own' AND status = 'active'").get() as { count: number }).count, `${o}/${x}`).toBe(expected === "created" || (expected === "conflict" && o === "act-other") ? 1 : 0);
    }
  });

  it("treats a Submission whose own Run was displaced by the former replace behavior as a duplicate of the active Run", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.duplicate", "binding.duplicate", "Duplicate Player");
    for (const id of ["submission.duplicate-first", "submission.duplicate-second"]) {
      seedMasterySubmission(sqlite, id, "binding.duplicate", "Duplicate Player");
      sqlite.prepare("UPDATE submissions SET status = 'ocr_review_required', target_map_id = ? WHERE id = ?").run("map.mastery", id);
      sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, created_at) VALUES (?, ?, 1, 'review_required', ?, ?)").run(`ocr.${id}`, id, JSON.stringify(masteryOcr()), now);
    }
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const corrections = [{ fieldKey: "difficulty", reviewedValue: "传奇" }];
    // Stored state from the former behavior: the second Submission's Run replaced the first one's under the same code.
    const first = await services.recordVerifiedRun({ ...automaticRunFacts, playerAccountId: "player.duplicate", sourceSubmissionId: "submission.duplicate-first", matchCode: "9999-8888-7777" });
    await services.recordVerifiedRun({ ...automaticRunFacts, playerAccountId: "player.duplicate", sourceSubmissionId: "submission.duplicate-second", difficulty: "传奇" });
    sqlite.prepare("UPDATE mastery_runs SET status = 'invalidated', run_code = ?, invalidation_reason = 'Superseded by reviewed Submission submission.duplicate-second (difficulty)' WHERE id = ?").run(automaticRunFacts.matchCode, first.run.runId);

    const preview = await services.previewSubmissionReview({ submissionId: "submission.duplicate-first", fieldCorrections: corrections }, maintainer);
    expect(preview).toMatchObject({ approvable: true, verifiedRun: { status: "recorded", reason: null, supersededFields: [] } });
    const approved = await services.reviewSubmission({ submissionId: "submission.duplicate-first", decision: "approved", fieldCorrections: corrections }, maintainer, "review.duplicate-first");
    expect(approved.verifiedRunOutcome).toMatchObject({ status: "reused", awardedXp: 0 });
    expect(sqlite.prepare("SELECT source_submission_id, status FROM mastery_runs ORDER BY created_at, rowid").all()).toEqual([
      { source_submission_id: "submission.duplicate-first", status: "invalidated" },
      { source_submission_id: "submission.duplicate-second", status: "active" },
    ]);
  });

});
