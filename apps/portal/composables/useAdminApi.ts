import type {
  AdminBindingClaimListResponse,
  AdminBindingInviteListResponse,
  AdminPlayerListResponse,
  AdminReviewDetailResponse as ContractAdminReviewDetail,
  AdminSubmission as ContractAdminSubmission,
  AdminSubmissionReviewPreviewRequest,
  AdminSubmissionReviewPreviewResponse,
  AdminVerifiedRun as ContractAdminVerifiedRun,
  AdminVerifiedRunCorrectionRequest,
  AdminVerifiedRunDetailResponse,
  OcrAccuracyFeedbackResponse,
  QqGroupAccessResponse,
  VerifiedRunDifficulty,
} from "@owbastion/contracts";
export type {
  AdminPlayerDetail,
  AdminReview,
  AdminReviewAudit,
  AdminScreenshotSet,
  AdminScreenshotSetCandidate,
  AdminScreenshotSetCreateResponse,
  AdminScreenshotSetDetailResponse as AdminScreenshotSetDetail,
  AdminScreenshotSetExclusion,
  AdminScreenshotSetMember,
  AdminSubmissionReviewCandidate,
  AdminVerifiedRunConflict,
  AdminVerifiedRunCorrectionResponse,
  AdminVerifiedRunProjection,
  OcrAccuracyMark,
} from "@owbastion/contracts";
import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { recordPortalError } from "~/utils/portal-error";

export type AdminPlayer = AdminPlayerListResponse["items"][number];
export type AdminGroup = Omit<QqGroupAccessResponse, "contractVersion">;
export type AdminBindingClaim = AdminBindingClaimListResponse["items"][number];
export type AdminBindingInvitation = AdminBindingInviteListResponse["items"][number];
export type AdminSubmissionReviewPreview = AdminSubmissionReviewPreviewResponse;
export type AdminSubmissionReviewInput = Required<Pick<AdminSubmissionReviewPreviewRequest, "fieldCorrections" | "confirmedChallengeIds">>;
export type AdminSubmission = ContractAdminSubmission;
export type AdminVerifiedRunDifficulty = VerifiedRunDifficulty;
export type AdminVerifiedRun = ContractAdminVerifiedRun;
export type AdminVerifiedRunCorrectionChanges = AdminVerifiedRunCorrectionRequest["changes"];
export type AdminVerifiedRunDetail = AdminVerifiedRunDetailResponse;
export type AdminReviewDetail = ContractAdminReviewDetail;
export type AdminOcrAccuracyResponse = OcrAccuracyFeedbackResponse;

export function useAdminApi() {
  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) => {
    const requestId = createRequestId();
    const headers = new Headers(options?.headers as HeadersInit | undefined);
    if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
    try {
      return await $fetch<T>(`/api/admin${path}`, { ...options, headers, cache: "no-store", credentials: "include", retry: 0, timeout: 8_000 });
    } catch (error) {
      Object.assign(error as object, { requestId });
      recordPortalError(error, { operation: path, requestId });
      throw error;
    }
  };
}
