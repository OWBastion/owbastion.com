import type { ReviewSummary, ReviewTargetType } from "~/composables/usePlayerReview";
import { portalErrorDetails } from "~/utils/portal-error";

type ReviewSummaryBatchResponse = {
  contractVersion: "1";
  targetType: ReviewTargetType;
  items: ReviewSummary[];
};

const batchSize = 100;

export function useReviewSummaries(targetType: ReviewTargetType, targetIds: MaybeRefOrGetter<string[]>) {
  const api = usePortalApi();
  const summaries = shallowRef<Record<string, ReviewSummary>>({});
  const loading = shallowRef(false);
  const error = shallowRef("");
  let requestSequence = 0;

  const refresh = async () => {
    const sequence = ++requestSequence;
    const ids = [...new Set(toValue(targetIds).filter(Boolean))];
    if (!ids.length) {
      summaries.value = {};
      error.value = "";
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = "";
    const batches = Array.from({ length: Math.ceil(ids.length / batchSize) }, (_, index) => ids.slice(index * batchSize, (index + 1) * batchSize));
    const results = await Promise.allSettled(batches.map((batch) => api<ReviewSummaryBatchResponse>(
      "/v1/public/reviews/summaries?targetType=" + encodeURIComponent(targetType) + "&targetIds=" + encodeURIComponent(batch.join(",")),
    )));
    if (sequence !== requestSequence) return;

    const failed = results.find((result) => result.status === "rejected");
    const nextSummaries: Record<string, ReviewSummary> = {};
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const summary of result.value.items) nextSummaries[summary.targetId] = summary;
      }
    }
    summaries.value = nextSummaries;
    if (failed?.status === "rejected") error.value = portalErrorDetails(failed.reason, "评分摘要暂时无法读取。").description;
    loading.value = false;
  };

  const summaryFor = (targetId: string) => summaries.value[targetId] ?? null;

  watch(() => toValue(targetIds), () => { void refresh(); }, { immediate: true, deep: true });

  return { summaries, loading, error, refresh, summaryFor };
}
