import { describe, expect, it, vi } from "vitest";
import { createPlatformServices } from "./index";
import { createTestDatabase, fakeEvidenceBucket, now, seedMasteryPlayer, seedMasterySubmission, synchronizeConcurrentBatches } from "../test/map-title-rule-fixtures";

describe("OCR queue failure recovery", () => {
  it("rejects an OCR retry while the same-key queue send is pending and replays after completion", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.concurrent-same-key", "binding.one", "Tester");
    sqlite.prepare("UPDATE submissions SET status = 'resubmission_required' WHERE id = 'submission.concurrent-same-key'").run();

    let releaseQueueSend!: () => void;
    let markQueueSendStarted!: () => void;
    const queueSendStarted = new Promise<void>((resolve) => { markQueueSendStarted = resolve; });
    const queueSendGate = new Promise<void>((resolve) => { releaseQueueSend = resolve; });
    const queue = { send: vi.fn(async () => { markQueueSendStarted(); await queueSendGate; }) } as unknown as Queue;
    const services = createPlatformServices(database, fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

    const first = services.requestAdminOcr({ submissionId: "submission.concurrent-same-key" }, auth, "idem.concurrent-same", "request.first");
    await queueSendStarted;
    const second = services.requestAdminOcr({ submissionId: "submission.concurrent-same-key" }, auth, "idem.concurrent-same", "request.second");
    const secondOutcome = second.then(
      () => ({ status: "resolved" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    try {
      expect(await secondOutcome).toMatchObject({ status: "rejected", error: { message: "OCR_RETRY_IN_PROGRESS" } });
      expect(queue.send).toHaveBeenCalledOnce();
    } finally {
      releaseQueueSend();
    }

    await expect(first).resolves.toEqual({ contractVersion: "1", submissionId: "submission.concurrent-same-key", status: "ocr_pending" });
    await expect(services.requestAdminOcr({ submissionId: "submission.concurrent-same-key" }, auth, "idem.concurrent-same", "request.replay")).resolves.toEqual({ contractVersion: "1", submissionId: "submission.concurrent-same-key", status: "ocr_pending" });
    expect(queue.send).toHaveBeenCalledOnce();
    expect(sqlite.prepare("SELECT response_json FROM idempotency_keys WHERE operation = 'submission.ocr.retry'").get()).toEqual({ response_json: JSON.stringify({ contractVersion: "1", submissionId: "submission.concurrent-same-key", status: "ocr_pending" }) });
  });

  it("prevents a losing simultaneous retry from undoing a successful enqueue", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.concurrent-send", "binding.one", "Tester");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_pending', review_reason = '请重试', updated_at = 1000 WHERE id = 'submission.concurrent-send'").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, error_code, created_at) VALUES ('ocr.concurrent-send-failed', 'submission.concurrent-send', 0, 'error', 'OCR_QUEUE_SEND_FAILED', 1000)").run();

    const queue = { send: vi.fn(async () => {}) } as unknown as Queue;
    const services = createPlatformServices(synchronizeConcurrentBatches(database, 2), fakeEvidenceBucket, "https://api.example.com", "https://ocr.example.com", "token", queue);
    const auth = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };

    const first = services.requestAdminOcr({ submissionId: "submission.concurrent-send" }, auth, "idem.concurrent-first", "request.first");
    const second = services.requestAdminOcr({ submissionId: "submission.concurrent-send" }, auth, "idem.concurrent-second", "request.second");
    const outcomes = await Promise.allSettled([first, second]);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toMatchObject({ status: "rejected", reason: new Error("OCR_RETRY_IN_PROGRESS") });
    expect(queue.send).toHaveBeenCalledOnce();

    expect(outcomes.find((outcome) => outcome.status === "fulfilled")).toMatchObject({ status: "fulfilled", value: { contractVersion: "1", submissionId: "submission.concurrent-send", status: "ocr_pending" } });
    expect(sqlite.prepare("SELECT status, review_reason FROM submissions WHERE id = 'submission.concurrent-send'").get()).toEqual({ status: "ocr_pending", review_reason: null });
    expect(sqlite.prepare("SELECT status, error_code FROM ocr_results WHERE submission_id = 'submission.concurrent-send' ORDER BY created_at").all()).toEqual([
      { status: "error", error_code: "OCR_QUEUE_SEND_FAILED" },
      { status: "pending", error_code: null },
    ]);
  });

  it("moves stale OCR jobs to an actionable state after queue recovery deliveries are exhausted", async () => {
    const { database, sqlite } = createTestDatabase("map.mastery");
    seedMasteryPlayer(sqlite, "player.one", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.stale-ocr", "binding.one", "Tester");
    seedMasterySubmission(sqlite, "submission.fresh-ocr", "binding.one", "Tester");
    sqlite.prepare("UPDATE submissions SET status = 'ocr_pending', updated_at = 1000 WHERE id = 'submission.stale-ocr'").run();
    sqlite.prepare("UPDATE submissions SET status = 'ocr_pending', updated_at = 2000 WHERE id = 'submission.fresh-ocr'").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES ('ocr-stale-result', 'submission.stale-ocr', 0, 'pending', 1000)").run();
    sqlite.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES ('admin:submission.ocr.retry:idem.stale', 'admin', 'submission.ocr.retry', 'hash', 'ocr-retry-enqueueing:ocr-stale-result', 1000)").run();
    sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES ('ocr-fresh-result', 'submission.fresh-ocr', 0, 'pending', 2000)").run();
    const services = createPlatformServices(database);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(services.reconcileStaleOcrJobs({ olderThan: 1500 })).resolves.toBe(1);

    expect(sqlite.prepare("SELECT status, ocr_fail_count FROM submissions WHERE id = 'submission.stale-ocr'").get()).toEqual({ status: "resubmission_required", ocr_fail_count: 1 });
    expect(sqlite.prepare("SELECT status, error_code FROM ocr_results WHERE id = 'ocr-stale-result'").get()).toEqual({ status: "error", error_code: "OCR_QUEUE_STALLED" });
    expect(sqlite.prepare("SELECT id FROM idempotency_keys WHERE id = 'admin:submission.ocr.retry:idem.stale'").get()).toBeUndefined();
    expect(sqlite.prepare("SELECT status FROM submissions WHERE id = 'submission.fresh-ocr'").get()).toEqual({ status: "ocr_pending" });
    expect(logSpy.mock.calls.map(([line]) => String(line)).some((line) => line.includes('"event":"stale_job_recovered"') && line.includes('"submissionId":"submission.stale-ocr"'))).toBe(true);
    logSpy.mockRestore();
  });
});
