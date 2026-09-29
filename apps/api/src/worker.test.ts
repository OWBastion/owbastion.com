// @ts-expect-error Node file access is limited to this Vitest config-parity test; Worker runtime types intentionally exclude Node APIs.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import worker, { OCR_PENDING_RECOVERY_AGE_MS, OCR_QUEUE_MAX_DELIVERIES, OCR_QUEUE_MAX_RETRIES } from "./worker";

const createPlatformServices = vi.hoisted(() => vi.fn());

vi.mock("@owbastion/database", () => ({ createPlatformServices }));

const queueMessage = (attempts: number, overrides: { manual?: boolean } = {}) => ({
  body: { version: 1, submissionId: "submission-1", objectKey: "uploads/submission-1/evidence.upload", requestId: "test-request-1", ...overrides },
  attempts,
  ack: vi.fn(),
  retry: vi.fn(),
});

const policyMessage = (attempts: number) => ({
  body: { version: 1 as const, eventId: "00000000-0000-4000-8000-000000000001" },
  attempts,
  ack: vi.fn(),
  retry: vi.fn(),
});

describe("OCR Queue consumer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches both Wrangler OCR retry budgets and dead-letter queue names", () => {
    const readConsumer = (path: string, queue: string) => {
      const source = readFileSync(new URL(path, import.meta.url), "utf8") as string;
      const blocks = source.split("[[queues.consumers]]").slice(1);
      const block = blocks.find((candidate: string) => candidate.match(/^\s*queue\s*=\s*"([^"]+)"/m)?.[1] === queue);
      return {
        maxRetries: Number(block?.match(/^\s*max_retries\s*=\s*(\d+)/m)?.[1]),
        deadLetterQueue: block?.match(/^\s*dead_letter_queue\s*=\s*"([^"]+)"/m)?.[1],
      };
    };
    const deployWorkflow = readFileSync(new URL("../../../.github/workflows/deploy-api.yml", import.meta.url), "utf8") as string;
    const productionCron = readFileSync(new URL("../../../wrangler.toml", import.meta.url), "utf8") as string;
    const localCron = readFileSync(new URL("../../../wrangler.local.toml", import.meta.url), "utf8") as string;
    const production = readConsumer("../../../wrangler.toml", "owbastion-ocr");
    const local = readConsumer("../../../wrangler.local.toml", "owbastion-ocr-local");
    const productionDeadLetter = readConsumer("../../../wrangler.toml", "owbastion-ocr-dlq");
    const localDeadLetter = readConsumer("../../../wrangler.local.toml", "owbastion-ocr-local-dlq");

    expect(production).toEqual({ maxRetries: OCR_QUEUE_MAX_RETRIES, deadLetterQueue: "owbastion-ocr-dlq" });
    expect(local).toEqual({ maxRetries: OCR_QUEUE_MAX_RETRIES, deadLetterQueue: "owbastion-ocr-local-dlq" });
    expect(productionDeadLetter.maxRetries).toBeGreaterThan(0);
    expect(localDeadLetter.maxRetries).toBeGreaterThan(0);
    expect(deployWorkflow).toMatch(/for queue in [^\n]*owbastion-ocr-dlq/);
    expect(productionCron).toMatch(/^crons\s*=\s*\["\*\/5 \* \* \* \*"\]/m);
    expect(localCron).toMatch(/^crons\s*=\s*\["\*\/5 \* \* \* \*"\]/m);
    expect(OCR_QUEUE_MAX_DELIVERIES).toBe(OCR_QUEUE_MAX_RETRIES + 1);
  });

  it.each([
    [1, 5],
    [2, 10],
    [3, 15],
  ])("retries Queue delivery attempt %s", async (attempt, delaySeconds) => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_RETRYABLE"));
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed: vi.fn() });
    const message = queueMessage(attempt);

    await worker.queue({ messages: [message] } as never, { OCRKIT_BASE_URL: "https://ocr.example", OCRKIT_API_TOKEN: "ocr-token", EVIDENCE_PUBLIC_ORIGIN: "https://evidence.example" } as never);

    expect(createPlatformServices).toHaveBeenCalledWith(undefined, undefined, undefined, "https://ocr.example", "ocr-token", undefined, undefined, undefined, 1, 0, {
      version: "v1",
      minimumGameVersion: null,
      supportedOcrLayoutVersions: [],
      requiredConfidence: 0.9,
    }, "https://evidence.example");
    expect(processOcrJob).toHaveBeenCalledWith({
      version: 1,
      submissionId: "submission-1",
      objectKey: "uploads/submission-1/evidence.upload",
      requestId: "test-request-1",
      attempt,
    });
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it("passes only explicit released compatibility settings to OCR processing", async () => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockResolvedValue();
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed: vi.fn() });
    const message = queueMessage(1);

    await worker.queue({ messages: [message] } as never, {
      MASTERY_MIN_GAME_VERSION: "99.0101.1",
      MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS: "test-layout-v1, test-layout-v2",
    } as never);

    expect(createPlatformServices.mock.calls[0]?.at(-2)).toEqual({
      version: "v1",
      minimumGameVersion: "99.0101.1",
      supportedOcrLayoutVersions: ["test-layout-v1", "test-layout-v2"],
      requiredConfidence: 0.9,
    });
    expect(message.ack).toHaveBeenCalledOnce();
  });

  it("records the final failure before acknowledging the last configured delivery", async () => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_NETWORK"));
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockResolvedValue();
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed });
    const message = queueMessage(OCR_QUEUE_MAX_DELIVERIES);

    await worker.queue({ messages: [message] } as never, {} as never);

    expect(markOcrJobFailed).toHaveBeenCalledWith({ submissionId: "submission-1", attempt: OCR_QUEUE_MAX_DELIVERIES, errorCode: "OCR_NETWORK", manual: undefined, requestId: "test-request-1" });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("logs the original processing error before recording the generic failure", async () => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("TypeError: OCR response field was not a string"));
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockResolvedValue();
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed });
    const message = queueMessage(OCR_QUEUE_MAX_DELIVERIES);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worker.queue({ messages: [message] } as never, {} as never);
    const errorLogs = errorSpy.mock.calls.map(([line]) => String(line));
    errorSpy.mockRestore();

    expect(errorLogs.some((line) => line.includes('"event":"queue_job_failed"'))).toBe(true);
    expect(errorLogs.some((line) => line.includes("OCR response field was not a string"))).toBe(true);
    expect(errorLogs.some((line) => line.includes('"submissionId":"submission-1"'))).toBe(true);
    expect(markOcrJobFailed).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "OCR_PROCESS_FAILED" }));
  });

  it("sends the exhausted fourth delivery to the dead-letter queue when failure recording fails", async () => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_NETWORK"));
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockRejectedValue(new Error("D1 unavailable"));
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed });
    const message = queueMessage(OCR_QUEUE_MAX_DELIVERIES);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worker.queue({ messages: [message] } as never, {} as never);
    const errorLogs = errorSpy.mock.calls.map(([line]) => String(line));
    errorSpy.mockRestore();

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(errorLogs.some((line) => line.includes('"event":"queue_failure_record_failed"') && line.includes('"submissionId":"submission-1"'))).toBe(true);
  });

  it.each(["owbastion-ocr-dlq", "owbastion-ocr-local-dlq"])("records an exhausted OCR job from %s without calling OCRKit again", async (queue) => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>();
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockResolvedValue();
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed });
    const message = queueMessage(1, { manual: false });

    await worker.queue({ queue, messages: [message] } as never, {} as never);

    expect(processOcrJob).not.toHaveBeenCalled();
    expect(markOcrJobFailed).toHaveBeenCalledWith({ submissionId: "submission-1", attempt: OCR_QUEUE_MAX_DELIVERIES, errorCode: "OCR_QUEUE_EXHAUSTED", manual: false, requestId: "test-request-1" });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries dead-letter recovery with a submission-scoped failure log when D1 is unavailable", async () => {
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockRejectedValue(new Error("D1 unavailable"));
    createPlatformServices.mockReturnValue({ markOcrJobFailed });
    const message = queueMessage(1);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await worker.queue({ queue: "owbastion-ocr-dlq", messages: [message] } as never, {} as never);
    const errorLogs = errorSpy.mock.calls.map(([line]) => String(line));
    errorSpy.mockRestore();

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(errorLogs.some((line) => line.includes('"event":"dead_letter_recovery_failed"') && line.includes('"submissionId":"submission-1"'))).toBe(true);
  });

  it("delivers a policy event and acknowledges it only after the platform records delivery", async () => {
    const markQqGroupPolicyEventDelivered = vi.fn<PlatformServices["markQqGroupPolicyEventDelivered"]>().mockResolvedValue(undefined);
    createPlatformServices.mockReturnValue({ markQqGroupPolicyEventDelivered });
    const message = policyMessage(1);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    try {
      await worker.queue({ messages: [message] } as never, { QQBOT_POLICY_WEBHOOK_URL: "https://qqbot.example/internal/v1/qq/group-policy-events", QQBOT_POLICY_WEBHOOK_SECRET: "policy-secret" } as never);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(markQqGroupPolicyEventDelivered).toHaveBeenCalledWith({ eventId: message.body.eventId });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("retries a policy event when qqbot rejects the callback", async () => {
    createPlatformServices.mockReturnValue({ markQqGroupPolicyEventDelivered: vi.fn<PlatformServices["markQqGroupPolicyEventDelivered"]>().mockResolvedValue(undefined) });
    const message = policyMessage(2);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    try {
      await worker.queue({ messages: [message] } as never, { QQBOT_POLICY_WEBHOOK_URL: "https://qqbot.example/internal/v1/qq/group-policy-events", QQBOT_POLICY_WEBHOOK_SECRET: "policy-secret" } as never);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 10 });
  });

  it("reconciles stale OCR jobs on schedule without dispatching QQ policy events", async () => {
    const dispatchPendingQqGroupPolicyEvents = vi.fn<PlatformServices["dispatchPendingQqGroupPolicyEvents"]>().mockResolvedValue(undefined);
    const reconcileStaleOcrJobs = vi.fn<PlatformServices["reconcileStaleOcrJobs"]>().mockResolvedValue(0);
    const before = Date.now();
    createPlatformServices.mockReturnValue({ dispatchPendingQqGroupPolicyEvents, reconcileStaleOcrJobs });

    await worker.scheduled({} as never, {} as never);

    expect(dispatchPendingQqGroupPolicyEvents).not.toHaveBeenCalled();
    expect(reconcileStaleOcrJobs).toHaveBeenCalledOnce();
    const olderThan = reconcileStaleOcrJobs.mock.calls[0]![0].olderThan;
    expect(olderThan).toBeGreaterThanOrEqual(before - OCR_PENDING_RECOVERY_AGE_MS);
    expect(olderThan).toBeLessThanOrEqual(Date.now() - OCR_PENDING_RECOVERY_AGE_MS);
  });
});
