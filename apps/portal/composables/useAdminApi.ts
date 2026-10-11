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
import { createApiClient, type ApiFetcher } from "~/utils/api-client";
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
  return createApiClient("/api/admin", $fetch as ApiFetcher, "no-store");
}
