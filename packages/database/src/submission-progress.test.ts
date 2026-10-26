import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import {
  createTestDatabase, localVerifiedRunEvidenceCompatibility, now, seedMap,
  seedMasteryPlayer, seedRule, seedTitle,
} from "../test/map-title-rule-fixtures";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };
const review = { submissionId: "submission.beta", decision: "approved" as const };

const setup = async (withMapTitle: boolean) => {
  const { database, sqlite } = createTestDatabase("map.alpha");
  seedMap(sqlite, "map.beta");
  seedMasteryPlayer(sqlite, "player.tour", "binding.tour", "Tester");
  seedTitle(sqlite, "TOUR");
  sqlite.exec("UPDATE title_catalog SET scope = 'global', display_kind = 'fixed' WHERE key = 'TOUR'");
  sqlite.prepare("INSERT INTO title_challenges (id, title_key, condition, evidence_rule, submission_mode, status, scope, progress_rule, created_at, updated_at) VALUES ('title.tour', 'TOUR', 'Complete every required map', 'Verified Runs', 'manual', 'active', 'global', ?, ?, ?)")
    .run(JSON.stringify({ type: "required_maps_completed", mapIds: ["map.alpha", "map.beta"], difficultyAtLeast: "困难" }), now, now);
  if (withMapTitle) {
    seedTitle(sqlite, "CONQUEROR");
    seedRule(sqlite, "rule.conqueror", "CONQUEROR", "conqueror", { slot: "conqueror" });
  }
  const insertSubmission = sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, 'player.tour', 'ocr_review_required', 'unknown', ?, 'Tester', 'portal', 'portal', ?, ?, ?)");
  for (const map of ["alpha", "beta"]) insertSubmission.run(`submission.${map}`, `地图 map.${map}`, map, now, now);
  const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
  await services.recordVerifiedRun({
    playerAccountId: "player.tour", sourceSubmissionId: "submission.alpha", mapId: "map.alpha",
    gameplayRevisionId: "revision:map.alpha:initial", mapVariant: null, difficulty: "地狱", gameVersion: "99.0101.1",
    matchCode: "1631-2408-5670", completionDurationSeconds: 600, deaths: 0, skips: 0,
    eventCounters: {}, acceptanceSource: "submission_review", achievementCount: 0,
  });
  const response = {
    schema_version: "1", ok: true, layout_version: "1280x720-v7",
    fields: Object.fromEntries(["challenge_completed", "map_name", "difficulty", "achievement_titles", "version", "run_code", "duration_seconds", "deaths", "skips"].map((field) => [field, { status: "ok", confidence: 0.99 }])),
    data: { challenge_completed: true, viewer_player: "Tester", map_name: "地图 map.beta", difficulty: "地狱", mode: "随机事件5.0", achievement_titles: [], version: "99.0101.1", run_code: "1631-2408-5670", duration_seconds: 600, deaths: 0, skips: 0 },
  };
  sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.beta', 'submission.beta', 1, 'review_required', ?, '{}', ?)")
    .run(JSON.stringify(response), now);
  const grants = () => sqlite.prepare("SELECT title_key, status FROM player_title_grants WHERE title_key = 'TOUR'").all();
  return { database, sqlite, services, grants };
};

describe("submission review aggregate progress", () => {
  it.each([false, true])("grants the aggregate title after the final map is approved (map title: %s)", async (withMapTitle) => {
    const { sqlite, services, grants } = await setup(withMapTitle);
    try {
      expect(grants()).toEqual([]);
      const result = await services.reviewSubmission(review, auth, "approve.beta");
      expect(result.verifiedRunOutcome).toMatchObject({ status: "created" });
      expect(grants()).toEqual([{ title_key: "TOUR", status: "active" }]);
      expect(await services.reviewSubmission(review, auth, "approve.beta")).toEqual(result);
      expect(grants()).toEqual([{ title_key: "TOUR", status: "active" }]);
    } finally {
      sqlite.close();
    }
  });

  it.each([false, true])("repairs aggregate grants when approval is retried after a post-commit failure (map title: %s)", async (withMapTitle) => {
    const { database, sqlite, services, grants } = await setup(withMapTitle);
    const batch = database.batch.bind(database);
    const spy = vi.spyOn(database, "batch").mockImplementation(async (statements) => {
      if (sqlite.prepare("SELECT 1 FROM submission_reviews WHERE submission_id = 'submission.beta'").get()) {
        throw new Error("D1_TRANSIENT_FAILURE");
      }
      return batch(statements);
    });
    try {
      await expect(services.reviewSubmission(review, auth, "approve.beta")).rejects.toThrow("D1_TRANSIENT_FAILURE");
      expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.beta'").get()).toEqual({ status: "approved" });
      expect(grants()).toEqual([]);
      spy.mockRestore();
      const result = await services.reviewSubmission(review, auth, "approve.beta");
      expect(result.verifiedRunOutcome).toMatchObject({ status: "created" });
      expect(grants()).toEqual([{ title_key: "TOUR", status: "active" }]);
      expect(await services.reviewSubmission(review, auth, "approve.beta")).toEqual(result);
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM submission_reviews WHERE submission_id = 'submission.beta'").get()).toEqual({ count: 1 });
      expect(sqlite.prepare("SELECT COUNT(*) AS count FROM mastery_runs WHERE source_submission_id = 'submission.beta'").get()).toEqual({ count: 1 });
      expect(grants()).toEqual([{ title_key: "TOUR", status: "active" }]);
    } finally {
      spy.mockRestore();
      sqlite.close();
    }
  });
});
