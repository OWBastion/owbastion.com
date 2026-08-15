import { createRequestId } from "~/utils/request-id";
import { portalErrorDetails } from "~/utils/portal-error";

export type ReviewTargetType = "event" | "map";
export type ReviewRating = 1 | 2 | 3 | 4 | 5;

export type ReviewSummary = {
  targetType: ReviewTargetType;
  targetId: string;
  averageRating: number | null;
  reviewCount: number;
  ratingDistribution: Record<ReviewRating, number>;
  sampleInsufficient: boolean;
};

export type PublicReviewComment = {
  rating: ReviewRating;
  comment: string;
  author: { displayName: string } | null;
  createdAt: number;
};

export type PlayerReview = {
  reviewId: string;
  targetType: ReviewTargetType;
  targetId: string;
  rating: ReviewRating;
  comment: string | null;
  anonymous: boolean;
  createdAt: number;
  updatedAt: number;
};

type SummaryResponse = { contractVersion: "1"; summary: ReviewSummary };
type CommentsResponse = {
  contractVersion: "1";
  targetType: ReviewTargetType;
  targetId: string;
  items: PublicReviewComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};
type PlayerReviewResponse = { contractVersion: "1"; review: PlayerReview | null };

const reviewErrorMessage = (error: unknown, fallback: string) => {
  const details = portalErrorDetails(error, fallback);
  const localized = {
    REVIEW_TARGET_NOT_FOUND: "这项内容已无法读取评价。",
    REVIEW_TARGET_NOT_RATEABLE: "这项内容暂不接受新的评价。",
    REVIEW_INVALIDATED: "这条评价已无法修改。",
    UNAUTHENTICATED: "登录状态已失效，请重新登录。",
    IDEMPOTENCY_CONFLICT: "请求未能确认，请稍后重试。",
  }[details.code ?? ""] ?? fallback;
  return details.requestId ? localized + " 请求编号：" + details.requestId : localized;
};

export function usePlayerReview(
  targetType: MaybeRefOrGetter<ReviewTargetType>,
  targetId: MaybeRefOrGetter<string>,
  authenticated: MaybeRefOrGetter<boolean>,
) {
  const api = usePortalApi();
  const summary = shallowRef<ReviewSummary | null>(null);
  const comments = shallowRef<PublicReviewComment[]>([]);
  const currentReview = shallowRef<PlayerReview | null>(null);
  const page = shallowRef(1);
  const pageSize = 5;
  const total = shallowRef(0);
  const hasMore = shallowRef(false);
  const loading = shallowRef(true);
  const saving = shallowRef(false);
  const error = shallowRef("");
  const success = shallowRef("");
  const unavailable = shallowRef(false);
  const draftRating = shallowRef<ReviewRating>(5);
  const draftComment = ref("");
  const draftAnonymous = shallowRef(false);
  let requestSequence = 0;

  const targetKey = computed(() => toValue(targetType) + ":" + toValue(targetId));

  const syncDraft = (review: PlayerReview | null) => {
    currentReview.value = review;
    draftRating.value = review?.rating ?? 5;
    draftComment.value = review?.comment ?? "";
    draftAnonymous.value = review?.anonymous ?? false;
  };

  const load = async (requestedPage = 1, preserveDraft = requestedPage !== 1) => {
    const sequence = ++requestSequence;
    const type = toValue(targetType);
    const id = toValue(targetId);
    const isAuthenticated = toValue(authenticated);
    loading.value = true;
    error.value = "";
    success.value = "";
    if (!preserveDraft) syncDraft(null);

    const encodedType = encodeURIComponent(type);
    const encodedId = encodeURIComponent(id);
    const requests = await Promise.allSettled([
      api<SummaryResponse>("/v1/public/reviews/" + encodedType + "/" + encodedId + "/summary"),
      api<CommentsResponse>("/v1/public/reviews/" + encodedType + "/" + encodedId + "/comments?page=" + requestedPage + "&pageSize=" + pageSize),
      ...(isAuthenticated ? [api<PlayerReviewResponse>("/v1/me/reviews/" + encodedType + "/" + encodedId)] : []),
    ]);
    if (sequence !== requestSequence || targetKey.value !== type + ":" + id) return;

    const failed = requests.find((result) => result.status === "rejected");
    const notFound = failed?.status === "rejected" && portalErrorDetails(failed.reason).statusCode === 404;
    unavailable.value = Boolean(notFound);
    if (failed?.status === "rejected") {
      error.value = reviewErrorMessage(failed.reason, notFound ? "这项内容已无法读取评价。" : "无法读取评价，请稍后重试。");
    }

    const summaryResult = requests[0];
    const commentsResult = requests[1];
    if (summaryResult?.status === "fulfilled") summary.value = summaryResult.value.summary;
    if (commentsResult?.status === "fulfilled") {
      comments.value = commentsResult.value.items;
      page.value = commentsResult.value.page;
      total.value = commentsResult.value.total;
      hasMore.value = commentsResult.value.hasMore;
    }
    const playerResult = requests[2];
    if (isAuthenticated && playerResult?.status === "fulfilled" && !preserveDraft) syncDraft(playerResult.value.review);
    loading.value = false;
  };

  const save = async () => {
    if (saving.value || unavailable.value || !toValue(authenticated)) return false;
    const comment = draftComment.value.trim();
    if (Array.from(comment).length > 500) {
      error.value = "评价内容不能超过 500 个字符。";
      return false;
    }
    saving.value = true;
    error.value = "";
    success.value = "";
    const type = toValue(targetType);
    const id = toValue(targetId);
    try {
      const response = await api<PlayerReviewResponse>("/v1/me/reviews/" + encodeURIComponent(type) + "/" + encodeURIComponent(id), {
        method: "PUT",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1", rating: draftRating.value, comment: comment || null, anonymous: draftAnonymous.value },
      });
      if (targetKey.value !== type + ":" + id) return false;
      syncDraft(response.review);
      await load(1);
      success.value = "评价已保存。";
      return true;
    } catch (cause) {
      if (targetKey.value === type + ":" + id) {
        unavailable.value = portalErrorDetails(cause).statusCode === 404;
        error.value = reviewErrorMessage(cause, "评价保存失败，请稍后重试。");
      }
      return false;
    } finally {
      saving.value = false;
    }
  };

  const withdraw = async () => {
    if (saving.value || !currentReview.value || unavailable.value || !toValue(authenticated)) return false;
    saving.value = true;
    error.value = "";
    success.value = "";
    const type = toValue(targetType);
    const id = toValue(targetId);
    try {
      await api("/v1/me/reviews/" + encodeURIComponent(currentReview.value.reviewId) + "/withdraw", {
        method: "POST",
        headers: { "Idempotency-Key": createRequestId() },
        body: { contractVersion: "1" },
      });
      if (targetKey.value !== type + ":" + id) return false;
      syncDraft(null);
      await load(1);
      success.value = "评价已撤回。";
      return true;
    } catch (cause) {
      if (targetKey.value === type + ":" + id) {
        unavailable.value = portalErrorDetails(cause).statusCode === 404;
        error.value = reviewErrorMessage(cause, "评价撤回失败，请稍后重试。");
      }
      return false;
    } finally {
      saving.value = false;
    }
  };

  const changePage = (nextPage: number) => {
    if (loading.value || nextPage < 1 || (!hasMore.value && nextPage > page.value)) return;
    return load(nextPage, true);
  };

  watch([() => toValue(targetType), () => toValue(targetId), () => toValue(authenticated)], () => {
    page.value = 1;
    summary.value = null;
    comments.value = [];
    total.value = 0;
    hasMore.value = false;
    unavailable.value = false;
    void load(1);
  }, { immediate: true });

  return { summary, comments, currentReview, page, total, hasMore, loading, saving, error, success, unavailable, draftRating, draftComment, draftAnonymous, load, save, withdraw, changePage };
}
