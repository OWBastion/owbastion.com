import { describe, expect, it, vi } from "vitest";
import { invalidateSubmissionCache, submissionCacheKey } from "./submission-cache";

describe("submission cache", () => {
  it("formats key as submission:v1:<id>", () => {
    expect(submissionCacheKey("sub-123")).toBe("submission:v1:sub-123");
  });

  it("deletes the cache key on invalidation", async () => {
    const cache = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as KVNamespace;

    await invalidateSubmissionCache(cache, "sub-123");
    expect(cache.delete).toHaveBeenCalledWith("submission:v1:sub-123");
  });

  it("handles undefined cache and KV errors gracefully", async () => {
    await expect(invalidateSubmissionCache(undefined, "sub-123")).resolves.not.toThrow();

    const brokenCache = {
      delete: vi.fn().mockRejectedValue(new Error("KV error")),
    } as unknown as KVNamespace;

    await expect(invalidateSubmissionCache(brokenCache, "sub-123")).resolves.not.toThrow();
  });
});
