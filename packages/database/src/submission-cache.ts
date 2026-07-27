const submissionCachePrefix = "submission:v1:";
export const submissionCacheTtlSeconds = 300;

export const submissionCacheKey = (submissionId: string) => `${submissionCachePrefix}${submissionId}`;

export const invalidateSubmissionCache = async (cache: KVNamespace | undefined, submissionId: string) => {
  if (!cache) return;
  try {
    await cache.delete(submissionCacheKey(submissionId));
  } catch {
    // KV is an optional optimization; errors must not block database operations.
  }
};
