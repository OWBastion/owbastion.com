/** Submission statuses that wait for a maintainer decision; the default screenshot-review queue. */
export const reviewQueueStatuses = "ready_for_review,ocr_review_required";

/**
 * Order of the default "待核对" queue encoded in a queue URL, or `null` when the
 * maintainer is browsing a filtered view (another status or a spot-check filter),
 * where "the next item" is not defined.
 */
export function defaultReviewQueueOrder(queuePath: string): "oldest" | "newest" | null {
  const query = new URL(queuePath, "http://queue.invalid").searchParams;
  const status = query.get("status");
  const spotCheck = query.get("spotCheck");
  if ((status && status !== "queue") || (spotCheck && spotCheck !== "all")) return null;
  return query.get("order") === "newest" ? "newest" : "oldest";
}
