import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformServices } from "@owbastion/domain";
import worker from "./worker";

const createPlatformServices = vi.hoisted(() => vi.fn());

vi.mock("@owbastion/database", () => ({ createPlatformServices }));

const queueMessage = (attempts: number) => ({
  body: { version: 1, submissionId: "submission-1", objectKey: "uploads/submission-1/evidence.upload" },
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

  it.each([
    [1, 5],
    [2, 10],
  ])("retries Queue delivery attempt %s", async (attempt, delaySeconds) => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_RETRYABLE"));
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed: vi.fn() });
    const message = queueMessage(attempt);

    await worker.queue({ messages: [message] } as never, { OCRKIT_BASE_URL: "https://ocr.example", OCRKIT_API_TOKEN: "ocr-token", OCRKIT_EVIDENCE_BUCKET: "owbastion-codes-evidence" } as never);

    expect(createPlatformServices).toHaveBeenCalledWith(undefined, undefined, undefined, "https://ocr.example", "ocr-token", undefined, "owbastion-codes-evidence", undefined, undefined, undefined, undefined);
    expect(processOcrJob).toHaveBeenCalledWith({
      version: 1,
      submissionId: "submission-1",
      objectKey: "uploads/submission-1/evidence.upload",
      attempt,
    });
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds });
    expect(message.ack).not.toHaveBeenCalled();
  });

  it("records the final failure before acknowledging the third delivery", async () => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_NETWORK"));
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockResolvedValue();
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed });
    const message = queueMessage(3);

    await worker.queue({ messages: [message] } as never, { OCRKIT_EVIDENCE_BUCKET: "owbastion-codes-evidence" } as never);

    expect(markOcrJobFailed).toHaveBeenCalledWith({ submissionId: "submission-1", attempt: 3, errorCode: "OCR_NETWORK" });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("does not acknowledge the final delivery when recording its failure fails", async () => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_NETWORK"));
    const markOcrJobFailed = vi.fn<PlatformServices["markOcrJobFailed"]>().mockRejectedValue(new Error("D1 unavailable"));
    createPlatformServices.mockReturnValue({ processOcrJob, markOcrJobFailed });
    const message = queueMessage(3);

    await worker.queue({ messages: [message] } as never, { OCRKIT_EVIDENCE_BUCKET: "owbastion-codes-evidence" } as never);

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
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

  it("dispatches pending policy events from the five-minute scheduled repair", async () => {
    const dispatchPendingQqGroupPolicyEvents = vi.fn<PlatformServices["dispatchPendingQqGroupPolicyEvents"]>().mockResolvedValue(undefined);
    createPlatformServices.mockReturnValue({ dispatchPendingQqGroupPolicyEvents });

    await worker.scheduled({} as never, {} as never);

    expect(dispatchPendingQqGroupPolicyEvents).toHaveBeenCalledOnce();
  });
});
