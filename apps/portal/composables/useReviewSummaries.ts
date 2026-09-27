import type { ReviewSummary, ReviewTargetType } from "~/composables/usePlayerReview";
import { portalErrorDetails } from "~/utils/portal-error";

type ReviewSummaryBatchResponse = {
  contractVersion: "1";
  targetType: ReviewTargetType;
  items: ReviewSummary[];
};

const batchSize = 100;

export function useReviewSummaries(
  targetType: ReviewTargetType,
  targetIds: MaybeRefOrGetter<string[]>,
  gameplayRevisionIds?: MaybeRefOrGetter<Array<string | null>>,
) {
  const api = usePortalApi();
  const summaries = shallowRef<Record<string, ReviewSummary>>({});
  const loading = shallowRef(false);
  const error = shallowRef("");
  let requestSequence = 0;

  const refresh = async () => {
    const sequence = ++requestSequence;
    const ids = toValue(targetIds).filter(Boolean);
    const revisionIds = targetType === "map" ? toValue(gameplayRevisionIds ?? []) : [];
    const targets = targetType === "event"
      ? [...new Set(ids)].map((targetId) => ({ targetId, gameplayRevisionId: null }))
      : [...new Map(ids.map((targetId, index) => {
        const gameplayRevisionId = revisionIds[index];
        return gameplayRevisionId ? [targetId + ":" + gameplayRevisionId, { targetId, gameplayRevisionId }] as const : null;
      }).filter((entry): entry is readonly [string, { targetId: string; gameplayRevisionId: string }] => entry !== null)).values()];
    if (!targets.length) {
      summaries.value = {};
      error.value = "";
      loading.value = false;
      return;
    }

    loading.value = true;
    error.value = "";
    const batches = Array.from({ length: Math.ceil(targets.length / batchSize) }, (_, index) => targets.slice(index * batchSize, (index + 1) * batchSize));
    const results = await Promise.allSettled(batches.map((batch) => {
      const query = new URLSearchParams({ targetType, targetIds: batch.map((target) => target.targetId).join(",") });
      if (targetType === "map") query.set("gameplayRevisionIds", batch.map((target) => target.gameplayRevisionId ?? "").join(","));
      return api<ReviewSummaryBatchResponse>("/v1/public/reviews/summaries?" + query.toString());
    }));
    if (sequence !== requestSequence) return;

    const failed = results.find((result) => result.status === "rejected");
    const nextSummaries: Record<string, ReviewSummary> = {};
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const summary of result.value.items) nextSummaries[summary.targetType === "map" ? summary.targetId + ":" + summary.gameplayRevisionId : summary.targetId] = summary;
      }
    }
    summaries.value = nextSummaries;
    if (failed?.status === "rejected") error.value = portalErrorDetails(failed.reason, "无法读取评分摘要，请稍后重试。").description;
    loading.value = false;
  };

  const summaryFor = (targetId: string, gameplayRevisionId?: string | null) => summaries.value[targetType === "map" ? targetId + ":" + (gameplayRevisionId ?? "") : targetId] ?? null;

  watch([() => toValue(targetIds), () => toValue(gameplayRevisionIds ?? [])], () => { void refresh(); }, { immediate: true, deep: true });

  return { summaries, loading, error, refresh, summaryFor };
}
