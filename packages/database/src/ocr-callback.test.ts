import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createD1, fakeEvidenceBucket, installSchema } from "./ocr-test-harness";

const jobId = "b89dab0a-b89e-40b2-932e-ff4f295d8ba3";
const nextJobId = "b89dab0a-b89e-40b2-932e-ff4f295d8ba4";
const fixture = () => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, status, created_at, updated_at) VALUES ('player', '1', 'Tester', 'tester', 'active', 1, 1)").run();
  sqlite.prepare("INSERT INTO submissions (id, player_account_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES ('submission', 'player', 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', 'msg', 1000, 1000)").run();
  sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES ('attachment', 'submission', 'portal', 'a', 'image/png', 1, 'hash', 'evidence/image.png', 'stored', 1000)").run();
  sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES (?, 'submission', 0, 'pending', 1000)").run(jobId);
  const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example", "https://ocr.example", "secret");
  return { database, sqlite, services };
};
const errorPayload = { contractVersion: "1" as const, errorCode: "OCR_RECOGNITION_FAILED" as const };
const resultPayload = { contractVersion: "1" as const, result: { schema_version: "1" as const, request_id: jobId, ok: true, fields: {}, data: {} } };
const dispatch = { jobId, submissionId: "submission", objectKey: "evidence/image.png", attempt: 1 };
afterEach(() => vi.unstubAllGlobals());

describe("asynchronous OCR callbacks", () => {

  it("ignores old rounds for success callbacks, failure callbacks, and failed Queue delivery", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES (?, 'submission', 0, 'pending', 2000)").run(nextJobId);
    await services.completeOcrJob({ jobId, payload: resultPayload });
    await services.completeOcrJob({ jobId, payload: errorPayload });
    await services.markOcrJobFailed({ ...dispatch, errorCode: "OCR_NETWORK" });
    expect(sqlite.prepare("SELECT status, ocr_fail_count FROM submissions").get()).toEqual({ status: "ocr_pending", ocr_fail_count: 0 });
    expect(sqlite.prepare("SELECT callback_claimed FROM ocr_results WHERE id = ?").get(jobId)).toEqual({ callback_claimed: 0 });
  });

  it("blocks manual review while a callback owns the processing round", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("UPDATE ocr_results SET callback_claimed = 1 WHERE id = ?").run(jobId);
    await expect(services.reviewSubmission({ submissionId: "submission", decision: "rejected" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "review")).rejects.toThrow("SUBMISSION_NOT_REVIEWABLE");
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "ocr_pending" });
  });

  it("allows manual review to finish a pending job, after which its callback is stale", async () => {
    const { services, sqlite } = fixture();
    await services.reviewSubmission({ submissionId: "submission", decision: "rejected" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "review");
    await services.completeOcrJob({ jobId, payload: resultPayload });
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "rejected" });
    expect(sqlite.prepare("SELECT callback_claimed FROM ocr_results").get()).toEqual({ callback_claimed: 0 });
  });
});
