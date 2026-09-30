import {
  adminReviewCommentModerationRequestSchema,
  adminReviewStateModerationRequestSchema,
  adminSubmissionOcrRetryRequestSchema,
  adminSubmissionReviewPreviewRequestSchema,
  adminSubmissionReviewRequestSchema,
  adminSubmissionSpotCheckRequestSchema,
  ocrAccuracyFeedbackRequestSchema,
  reviewTargetSchema,
  reviewTargetTypeSchema,
} from "@owbastion/contracts";
import type { AuthContext } from "@owbastion/domain";
import { parsePagination } from "../query-params";
import { isUuid, maintainerRoute, parseBody, type AdminRouteDependencies, type ApiApp } from "./route-contract";

export const registerAdminReviewWorkflowRoutes = (app: ApiApp, dependencies: AdminRouteDependencies) => {
  const { requireMaintainer, errorResponse, errorGroup, adminMutation } = dependencies;

  const moderateAdminReview = (
    c: any,
    schema: { safeParse(value: unknown): { success: true; data: { action: string; reason?: string } } | { success: false } },
    action: (input: { action: string; reason?: string; reviewId: string }, auth: AuthContext, key: string) => Promise<unknown>,
    errors: Record<string, { status: 404 | 409 | 422 | 503; message: string }>,
  ) => adminMutation(c, {
    schema,
    before: () => isUuid(c.req.param("reviewId"))
      ? undefined
      : errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid"),
    action: (input, auth, key) => action({ ...input, reviewId: c.req.param("reviewId") }, auth, key),
    errors,
  });

  app.get("/v1/admin/reviews", maintainerRoute(requireMaintainer, async (c, auth) => {
    const pageValue = Number(c.req.query("page") ?? 1);
    const pageSizeValue = Number(c.req.query("pageSize") ?? 20);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 0;
    const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0 && pageSizeValue <= 50 ? pageSizeValue : 0;
    const targetTypeValue = c.req.query("targetType");
    const targetType = targetTypeValue ? reviewTargetTypeSchema.safeParse(targetTypeValue) : null;
    const status = c.req.query("status");
    const commentStatus = c.req.query("commentStatus");
    const ratingValue = c.req.query("rating");
    const rating = ratingValue === undefined ? undefined : Number(ratingValue);
    const fromValue = c.req.query("from");
    const toValue = c.req.query("to");
    const from = fromValue === undefined ? undefined : Number(fromValue);
    const to = toValue === undefined ? undefined : Number(toValue);
    const allowedStatuses = ["active", "withdrawn", "invalidated"] as const;
    const allowedCommentStatuses = ["visible", "hidden"] as const;
    const targetId = c.req.query("targetId")?.trim() || undefined;
    const targetIdValid = targetId ? reviewTargetSchema.safeParse({ targetType: "event", targetId }).success : true;
    if (!page || !pageSize || (targetTypeValue && !targetType?.success) || (status && !allowedStatuses.includes(status as typeof allowedStatuses[number])) || (commentStatus && !allowedCommentStatuses.includes(commentStatus as typeof allowedCommentStatuses[number])) || (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) || (from !== undefined && (!Number.isInteger(from) || from < 0)) || (to !== undefined && (!Number.isInteger(to) || to < 0)) || (from !== undefined && to !== undefined && from > to) || !targetIdValid) {
      return errorResponse(c, 422, "INVALID_REQUEST", "The review query is invalid");
    }
    return c.json(await dependencies.services(c.env).listAdminReviews({ page, pageSize, ...(targetType?.success ? { targetType: targetType.data } : {}), ...(targetId ? { targetId } : {}), ...(status ? { status: status as typeof allowedStatuses[number] } : {}), ...(commentStatus ? { commentStatus: commentStatus as typeof allowedCommentStatuses[number] } : {}), ...(rating !== undefined ? { rating: rating as 1 | 2 | 3 | 4 | 5 } : {}), ...(from !== undefined ? { from } : {}), ...(to !== undefined ? { to } : {}) }, auth));
  }));

  app.get("/v1/admin/reviews/:reviewId", maintainerRoute(requireMaintainer, async (c, auth) => {
    const reviewId = c.req.param("reviewId")!;
    if (!isUuid(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
    try { return c.json(await dependencies.services(c.env).getAdminReview({ reviewId }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "REVIEW_NOT_FOUND") return errorResponse(c, 404, "REVIEW_NOT_FOUND", "The review does not exist"); if (error instanceof Error && error.message === "REVIEW_TARGET_NOT_FOUND") return errorResponse(c, 404, "REVIEW_TARGET_NOT_FOUND", "The review target does not exist"); throw error; }
  }));

  app.post("/v1/admin/reviews/:reviewId/comment", (c) => moderateAdminReview(
    c,
    adminReviewCommentModerationRequestSchema,
    async ({ action, reason, reviewId }, auth, key) => {
      const input = reason === undefined ? { reviewId } : { reviewId, reason };
      const services = dependencies.services(c.env);
      if (action === "hide") await services.hideReviewComment(input, auth, key);
      else await services.restoreReviewComment(input, auth, key);
      return services.getAdminReview({ reviewId }, auth);
    },
    {
      ...errorGroup(404, "The review does not exist", "REVIEW_NOT_FOUND"),
      ...errorGroup(422, "The review has no comment", "REVIEW_COMMENT_NOT_FOUND"),
    },
  ));

  app.post("/v1/admin/reviews/:reviewId/state", (c) => moderateAdminReview(
    c,
    adminReviewStateModerationRequestSchema,
    async ({ action, reason, reviewId }, auth, key) => {
      const input = reason === undefined ? { reviewId } : { reviewId, reason };
      const services = dependencies.services(c.env);
      if (action === "invalidate") await services.invalidateReview(input, auth, key);
      else await services.restoreReview(input, auth, key);
      return services.getAdminReview({ reviewId }, auth);
    },
    errorGroup(404, "The review does not exist", "REVIEW_NOT_FOUND"),
  ));

  app.get("/v1/admin/submissions", maintainerRoute(requireMaintainer, async (c, auth) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 50) || 50));
    const statuses = c.req.query("status")?.split(",").map((status) => status.trim()).filter(Boolean) ?? [];
    const spotCheck = c.req.query("spotCheck");
    const order = c.req.query("order");
    const allowedStatuses = ["received", "evidence_pending", "evidence_stored", "upload_pending", "ocr_pending", "awaiting_player_confirmation", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"] as const;
    if (statuses.some((status) => !allowedStatuses.includes(status as typeof allowedStatuses[number]))) return errorResponse(c, 422, "INVALID_REQUEST", "The submission status is invalid");
    if (spotCheck && !["pending", "confirmed", "revoked"].includes(spotCheck)) return errorResponse(c, 422, "INVALID_REQUEST", "The spot-check status is invalid");
    if (order && order !== "oldest" && order !== "newest") return errorResponse(c, 422, "INVALID_REQUEST", "The submission order is invalid");
    return c.json(await dependencies.services(c.env).listAdminSubmissions({ statuses: statuses as typeof allowedStatuses[number][], ...(spotCheck ? { spotCheck: spotCheck as "pending" | "confirmed" | "revoked" } : {}), ...(order ? { order: order as "oldest" | "newest" } : {}), page, pageSize }, auth));
  }));

  app.get("/v1/admin/submissions/:submissionId", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await dependencies.services(c.env).getAdminSubmission({ submissionId: c.req.param("submissionId")! }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist"); throw error; }
  }));

  const submissionReviewErrorCodes = ["SUBMISSION_NOT_REVIEWABLE", "CHALLENGE_REWARD_NOT_CONFIGURED", "SUBMISSION_OUTCOME_NOT_CONFIGURED", "SUBMISSION_CORRECTION_INVALID", "CHALLENGE_CONFIRMATION_INELIGIBLE", "CHALLENGE_NOT_COMPLETABLE", "TITLE_GRANT_ADMINISTRATIVELY_REVOKED", "SUBMISSION_REVISION_MISMATCH", "GAMEPLAY_REVISION_NOT_FOUND"];
  const submissionReviewErrorMessage = (code: string) => code === "CHALLENGE_REWARD_NOT_CONFIGURED"
    ? "The challenge has no configured title reward"
    : code === "CHALLENGE_CONFIRMATION_INELIGIBLE"
      ? "A confirmed challenge is not eligible for this submission"
      : "The submission cannot be reviewed";

  app.post("/v1/admin/submissions/:submissionId/review/preview", maintainerRoute(requireMaintainer, async (c, auth) => {
    const parsed = adminSubmissionReviewPreviewRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await dependencies.services(c.env).previewSubmissionReview({ submissionId: c.req.param("submissionId")!, fieldCorrections: parsed.data.fieldCorrections, confirmedChallengeIds: parsed.data.confirmedChallengeIds }, auth)); }
    catch (error) {
      const code = error instanceof Error ? error.message : "REVIEW_PREVIEW_FAILED";
      if (code === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, code, "The submission does not exist");
      if (submissionReviewErrorCodes.includes(code)) return errorResponse(c, 422, code, submissionReviewErrorMessage(code));
      throw error;
    }
  }));

  app.post("/v1/admin/submissions/:submissionId/review", async (c) => {
    return adminMutation(c, {
      schema: adminSubmissionReviewRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).reviewSubmission({
        submissionId: c.req.param("submissionId"),
        decision: input.decision,
        reason: input.reason,
        fieldCorrections: input.fieldCorrections,
        confirmedChallengeIds: input.confirmedChallengeIds,
      }, auth, key),
      errors: {
        ...errorGroup(422, "The submission cannot be reviewed", "SUBMISSION_NOT_FOUND", ...submissionReviewErrorCodes.filter((code) => !["CHALLENGE_REWARD_NOT_CONFIGURED", "CHALLENGE_CONFIRMATION_INELIGIBLE"].includes(code))),
        ...errorGroup(422, submissionReviewErrorMessage("CHALLENGE_REWARD_NOT_CONFIGURED"), "CHALLENGE_REWARD_NOT_CONFIGURED"),
        ...errorGroup(422, submissionReviewErrorMessage("CHALLENGE_CONFIRMATION_INELIGIBLE"), "CHALLENGE_CONFIRMATION_INELIGIBLE"),
      },
    });
  });

  app.post("/v1/admin/submissions/:submissionId/ocr/retry", async (c) => {
    return adminMutation(c, {
      schema: adminSubmissionOcrRetryRequestSchema,
      action: (_input, auth, key) => dependencies.services(c.env).requestAdminOcr({ submissionId: c.req.param("submissionId") }, auth, key, c.get("requestId")),
      errors: {
        ...errorGroup(404, "The submission does not exist", "SUBMISSION_NOT_FOUND"),
        ...errorGroup(404, "The submission has no evidence", "EVIDENCE_NOT_FOUND"),
        ...errorGroup(503, "OCRKit is not configured", "OCR_NOT_CONFIGURED"),
        ...errorGroup(409, "An OCR retry is already in progress for this submission", "OCR_RETRY_IN_PROGRESS"),
      },
    });
  });

  // Maintainer-side of the shared screenshot accuracy mark (#253): marks the
  // specific recognition result shown on the review page; latest value wins.
  app.post("/v1/admin/submissions/:submissionId/ocr-accuracy", async (c) => {
    return adminMutation(c, {
      schema: ocrAccuracyFeedbackRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).submitAdminOcrAccuracy({ ...input, submissionId: c.req.param("submissionId")! }, auth, key),
      errors: {
        ...errorGroup(404, "The submission does not exist", "SUBMISSION_NOT_FOUND"),
        ...errorGroup(409, "Feedback is unavailable for this submission", "OCR_RESULT_NOT_FOUND"),
        ...errorGroup(409, "The recognition is no longer current; refresh the submission", "OCR_PROMPT_STALE"),
      },
    });
  });

  app.post("/v1/admin/submissions/:submissionId/spot-check", async (c) => {
    return adminMutation(c, {
      schema: adminSubmissionSpotCheckRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).resolveAdminSubmissionSpotCheck({ ...input, submissionId: c.req.param("submissionId") }, auth, key),
      errors: {
        ...errorGroup(404, "The spot check does not exist", "SUBMISSION_NOT_FOUND", "SPOT_CHECK_NOT_FOUND"),
        ...errorGroup(409, "The spot check cannot be resolved", "SPOT_CHECK_ALREADY_RESOLVED", "TITLE_GRANT_NOT_FOUND"),
      },
    });
  });

};
