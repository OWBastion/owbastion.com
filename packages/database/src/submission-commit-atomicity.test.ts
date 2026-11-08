import { describe, expect, it } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, fakeEvidenceBucket, installSchema, localVerifiedRunEvidenceCompatibility, now, seedTitle } from "../test/map-title-rule-fixtures";

const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "test" };

const seedApprovedSubmission = (spotCheck: boolean) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  seedTitle(sqlite, "PROPHET");
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.a', 'a-1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.a', 'identity.a', 'player.a', 'qq', 'group.a', 'member.a', 'active', ?)").run(now);
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission.a', 'binding.a', 'approved', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'a.1', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO player_title_grants (id, player_account_id, title_key, status, source_type, source_id, granted_by, granted_at) VALUES ('grant.a', 'player.a', 'PROPHET', 'active', 'automatic', 'submission.a', 'system:ocr', ?)").run(now);
  if (spotCheck) sqlite.prepare("INSERT INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) VALUES ('spot.a', 'submission.a', 'pending', '{}', 1)").run();
  const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", {} as Queue, undefined, undefined, 1, 0, localVerifiedRunEvidenceCompatibility);
  return { sqlite, services };
};

describe("spot-check resolution", () => {
  it("lets only one of two concurrent resolutions change anything", async () => {
    const { sqlite, services } = seedApprovedSubmission(true);
    const results = await Promise.allSettled([
      services.resolveAdminSubmissionSpotCheck({ submissionId: "submission.a", contractVersion: "1", decision: "confirmed" }, auth, "spot.confirm"),
      services.resolveAdminSubmissionSpotCheck({ submissionId: "submission.a", contractVersion: "1", decision: "revoked" }, auth, "spot.revoke"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const { status } = sqlite.prepare("SELECT status FROM submission_spot_checks WHERE id = 'spot.a'").get() as { status: string };
    expect(sqlite.prepare("SELECT status FROM player_title_grants WHERE id = 'grant.a'").get()).toEqual({ status: status === "revoked" ? "revoked" : "active" });
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM idempotency_keys WHERE operation = 'submission.spot_check.resolve'").get()).toEqual({ n: 1 });
  });
});

describe("submission reopening", () => {
  it("commits the reopen and its idempotency record together", async () => {
    const { sqlite, services } = seedApprovedSubmission(false);
    sqlite.exec("CREATE TRIGGER block_reopen_idempotency BEFORE INSERT ON idempotency_keys WHEN NEW.operation = 'submission.reopen' BEGIN SELECT RAISE(ABORT, 'idempotency write failed'); END");
    await expect(services.reopenAdminSubmission({ submissionId: "submission.a" }, auth, "reopen-1")).rejects.toThrow();
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.a'").get()).toEqual({ status: "approved" });
    expect(sqlite.prepare("SELECT status FROM player_title_grants WHERE id = 'grant.a'").get()).toEqual({ status: "active" });
    sqlite.exec("DROP TRIGGER block_reopen_idempotency");
    const reopened = await services.reopenAdminSubmission({ submissionId: "submission.a" }, auth, "reopen-1");
    expect(reopened).toMatchObject({ status: "ocr_review_required", revokedGrantCount: 1 });
    expect(await services.reopenAdminSubmission({ submissionId: "submission.a" }, auth, "reopen-1")).toEqual(reopened);
  });
});
