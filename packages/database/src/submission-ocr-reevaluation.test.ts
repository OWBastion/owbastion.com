import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, fakeEvidenceBucket, installSchema, localVerifiedRunEvidenceCompatibility, now, seedEventPools } from "../test/map-title-rule-fixtures";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

const seedReviewHold = () => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  seedEventPools(sqlite);
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.hold', 'hold-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.hold', 'identity.hold', 'player.hold', 'qq', 'group.hold', 'member.hold', 'active', ?)").run(now);
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, review_reason, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.hold', 'binding.hold', 'ocr_review_required', '原因', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'hold.1', ?, ?)").run(now, now);
  const stored = { schema_version: "1", ok: true, layout_version: "1280x720-v7", fields: {}, data: { mode: "不存在的模式", version: "99.0101.1" } };
  sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES ('ocr.hold.stored', 'submission.hold', 1, 'review_required', ?, '{}', ?)").run(JSON.stringify(stored), now);
  const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
  return { sqlite, services };
};

describe("OCR re-evaluation that does not approve", () => {
  it("settles the new result and returns the submission to review", async () => {
    const { sqlite, services } = seedReviewHold();
    expect(await services.reevaluateAdminSubmissionOcr({ submissionId: "submission.hold" }, auth, "key-1")).toEqual({ contractVersion: "1", submissionId: "submission.hold", status: "ocr_review_required" });
    expect(sqlite.prepare("SELECT status FROM ocr_results WHERE submission_id = 'submission.hold' AND id != 'ocr.hold.stored'").all()).toEqual([{ status: "review_required" }]);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM ocr_results WHERE submission_id = 'submission.hold' AND status = 'pending'").get()).toEqual({ n: 0 });
  });

  it("restores the review hold when the decision cannot be persisted", async () => {
    const { sqlite, services } = seedReviewHold();
    sqlite.exec("CREATE TRIGGER block_review_result BEFORE UPDATE OF status ON ocr_results WHEN NEW.status = 'review_required' BEGIN SELECT RAISE(ABORT, 'persist failed'); END");
    await expect(services.reevaluateAdminSubmissionOcr({ submissionId: "submission.hold" }, auth, "key-1")).rejects.toThrow();
    expect(sqlite.prepare("SELECT status, review_reason FROM submissions WHERE id = 'submission.hold'").get()).toEqual({ status: "ocr_review_required", review_reason: "原因" });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM ocr_results WHERE submission_id = 'submission.hold' AND status = 'pending'").get()).toEqual({ n: 0 });
    sqlite.exec("DROP TRIGGER block_review_result");
    expect(await services.reevaluateAdminSubmissionOcr({ submissionId: "submission.hold" }, auth, "key-2")).toMatchObject({ status: "ocr_review_required" });
  });
});
