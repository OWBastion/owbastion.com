import { describe, expect, it } from "vitest";
import { createRequestId, ensureRequestId, normalizeRequestId } from "./request-id";

describe("request-id utility", () => {
  it("normalizes valid request IDs", () => {
    expect(normalizeRequestId(" req-123 ")).toBe("req-123");
    expect(normalizeRequestId("")).toBeUndefined();
    expect(normalizeRequestId(null)).toBeUndefined();
  });

  it("generates valid UUID when crypto.randomUUID is available", () => {
    const id = createRequestId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("falls back gracefully when crypto.randomUUID is undefined (non-secure context)", () => {
    const originalRandomUUID = crypto.randomUUID;
    // @ts-expect-error mutating global for test
    delete crypto.randomUUID;

    try {
      const id = createRequestId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    } finally {
      // @ts-expect-error restoring global for test
      crypto.randomUUID = originalRandomUUID;
    }
  });

  it("ensures request id or generates a new one", () => {
    expect(ensureRequestId("valid-id")).toBe("valid-id");
    expect(ensureRequestId("")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
