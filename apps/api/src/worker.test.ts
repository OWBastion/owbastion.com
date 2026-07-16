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

describe("OCR Queue consumer", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [1, 5],
    [2, 10],
    [3, undefined],
  ])("uses Queue delivery attempt %s", async (attempt, delaySeconds) => {
    const processOcrJob = vi.fn<PlatformServices["processOcrJob"]>().mockRejectedValue(new Error("OCR_RETRYABLE"));
    createPlatformServices.mockReturnValue({ processOcrJob });
    const message = queueMessage(attempt);

    await worker.queue({ messages: [message] } as never, { OCRKIT_EVIDENCE_BUCKET: "owbastion-codes-evidence" } as never);

    expect(createPlatformServices).toHaveBeenCalledWith(undefined, undefined, undefined, undefined, undefined, "owbastion-codes-evidence");
    expect(processOcrJob).toHaveBeenCalledWith({
      version: 1,
      submissionId: "submission-1",
      objectKey: "uploads/submission-1/evidence.upload",
      attempt,
    });
    if (delaySeconds) {
      expect(message.retry).toHaveBeenCalledWith({ delaySeconds });
      expect(message.ack).not.toHaveBeenCalled();
    } else {
      expect(message.ack).toHaveBeenCalledOnce();
      expect(message.retry).not.toHaveBeenCalled();
    }
  });
});
