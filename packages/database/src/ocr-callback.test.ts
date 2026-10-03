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
  it("acks acceptance while recognition stays pending, and redispatches the same UUID on a Queue retry", async () => {
    const { services, sqlite } = fixture();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect((init?.body as FormData).get("job_id")).toBe(jobId);
      expect(init?.headers).toMatchObject({ authorization: "Bearer secret" });
      return Response.json({ jobId, status: "accepted" }, { status: 202 });
    });
    vi.stubGlobal("fetch", fetch);
    await services.processOcrJob(dispatch);
    await services.processOcrJob({ ...dispatch, attempt: 2 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]).toBe("https://ocr.example/api/v1/ocr/challenge/jobs");
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "ocr_pending" });
    expect(sqlite.prepare("SELECT id, status FROM ocr_results").all()).toEqual([{ id: jobId, status: "pending" }]);
  });

  it("rejects synchronous 200 responses as job acceptance", async () => {
    const { services } = fixture();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(resultPayload.result)));
    await expect(services.processOcrJob(dispatch)).rejects.toThrow("OCR_HTTP_200");
  });

  it("completes recognition through the existing business matcher once", async () => {
    const { services, sqlite } = fixture();
    await services.completeOcrJob({ jobId, payload: resultPayload });
    const result = sqlite.prepare("SELECT status, response_json FROM ocr_results").get() as { status: string; response_json: string };
    expect(result.status).toBe("review_required");
    expect(JSON.parse(result.response_json).request_id).toBe(jobId);
    expect(sqlite.prepare("SELECT status, ocr_fail_count FROM submissions").get()).toEqual({ status: "ocr_review_required", ocr_fail_count: 0 });
    await services.completeOcrJob({ jobId, payload: resultPayload });
    expect(sqlite.prepare("SELECT ocr_fail_count FROM submissions").get()).toEqual({ ocr_fail_count: 0 });
  });

  it("records service failures once and accepts duplicates", async () => {
    const { services, sqlite } = fixture();
    await services.completeOcrJob({ jobId, payload: errorPayload });
    await services.completeOcrJob({ jobId, payload: errorPayload });
    expect(sqlite.prepare("SELECT status, error_code FROM ocr_results").get()).toEqual({ status: "error", error_code: "OCR_RECOGNITION_FAILED" });
    expect(sqlite.prepare("SELECT status, ocr_fail_count FROM submissions").get()).toEqual({ status: "resubmission_required", ocr_fail_count: 1 });
  });

  it("ignores old rounds for success callbacks, failure callbacks, and failed Queue delivery", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES (?, 'submission', 0, 'pending', 2000)").run(nextJobId);
    await services.completeOcrJob({ jobId, payload: resultPayload });
    await services.completeOcrJob({ jobId, payload: errorPayload });
    await services.markOcrJobFailed({ ...dispatch, errorCode: "OCR_NETWORK" });
    expect(sqlite.prepare("SELECT status, ocr_fail_count FROM submissions").get()).toEqual({ status: "ocr_pending", ocr_fail_count: 0 });
    expect(sqlite.prepare("SELECT callback_claimed FROM ocr_results WHERE id = ?").get(jobId)).toEqual({ callback_claimed: 0 });
  });

  it("returns a retryable error for a concurrent callback instead of acknowledging its lost result", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("UPDATE ocr_results SET callback_claimed = 1 WHERE id = ?").run(jobId);
    await expect(services.completeOcrJob({ jobId, payload: errorPayload })).rejects.toThrow("OCR_CALLBACK_IN_PROGRESS");
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "ocr_pending" });
  });

  it("releases the callback claim after a processing error so delivery can be retried", async () => {
    const { database, sqlite } = fixture();
    let fail = true;
    const unreliable = { ...database, prepare: (sql: string) => {
      if (fail && /FROM "maps"/i.test(sql)) throw new Error("temporary D1 error");
      return database.prepare(sql);
    } } as D1Database;
    const services = createPlatformServices(unreliable);
    await expect(services.completeOcrJob({ jobId, payload: resultPayload })).rejects.toThrow();
    expect(sqlite.prepare("SELECT status, callback_claimed FROM ocr_results").get()).toEqual({ status: "pending", callback_claimed: 0 });
    fail = false;
    await services.completeOcrJob({ jobId, payload: resultPayload });
    expect(sqlite.prepare("SELECT status FROM ocr_results").get()).toEqual({ status: "review_required" });
  });

  it("refreshes the processing window before callbacks consume business evidence", async () => {
    const { database, sqlite } = fixture();
    const guarded = { ...database, prepare: (sql: string) => {
      if (/FROM "maps"/i.test(sql)) {
        expect((sqlite.prepare("SELECT updated_at FROM submissions").get() as { updated_at: number }).updated_at).toBeGreaterThan(1000);
      }
      return database.prepare(sql);
    } } as D1Database;
    await createPlatformServices(guarded).completeOcrJob({ jobId, payload: resultPayload });
  });

  it("blocks manual review while a callback owns the processing round", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("UPDATE ocr_results SET callback_claimed = 1 WHERE id = ?").run(jobId);
    await expect(services.reviewSubmission({ submissionId: "submission", decision: "rejected" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "review")).rejects.toThrow("SUBMISSION_NOT_REVIEWABLE");
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "ocr_pending" });
  });

  it("bounds abandoned claims with the existing stale repair", async () => {
    const { services, sqlite } = fixture();
    sqlite.prepare("UPDATE ocr_results SET callback_claimed = 1 WHERE id = ?").run(jobId);
    expect(await services.reconcileStaleOcrJobs({ olderThan: 1000 })).toBe(1);
    await services.completeOcrJob({ jobId, payload: resultPayload });
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "resubmission_required" });
    expect(sqlite.prepare("SELECT error_code FROM ocr_results WHERE id = ?").get(jobId)).toEqual({ error_code: "OCR_QUEUE_STALLED" });
  });

  it("allows manual review to finish a pending job, after which its callback is stale", async () => {
    const { services, sqlite } = fixture();
    await services.reviewSubmission({ submissionId: "submission", decision: "rejected" }, { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" }, "review");
    await services.completeOcrJob({ jobId, payload: resultPayload });
    expect(sqlite.prepare("SELECT status FROM submissions").get()).toEqual({ status: "rejected" });
    expect(sqlite.prepare("SELECT callback_claimed FROM ocr_results").get()).toEqual({ callback_claimed: 0 });
  });
});
