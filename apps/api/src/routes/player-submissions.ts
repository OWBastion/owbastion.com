import { ocrAccuracyFeedbackRequestSchema } from "@owbastion/contracts";
import type { PlatformServices } from "@owbastion/domain";
import { hasOnlyUniqueQueryNames, parsePagination } from "../query-params";
import { errorGroup, errorResponse, idempotencyErrors, parseBody, respondToMappedError, unauthenticatedErrors, type ApiApp, type ApiContext, type RouteErrorMap } from "./route-contract";

type AuthenticatedPortalPlayer = {
  sessionToken: string;
  player: NonNullable<Awaited<ReturnType<PlatformServices["getPortalSessionIdentity"]>>>;
};

const submissionNotFoundErrors: RouteErrorMap = errorGroup(404, "The submission does not exist", "SUBMISSION_NOT_FOUND");
const ocrFeedbackErrors: RouteErrorMap = {
  ...unauthenticatedErrors,
  ...submissionNotFoundErrors,
  ...errorGroup(409, "Feedback is unavailable for this submission", "OCR_FEEDBACK_UNAVAILABLE", "OCR_RESULT_NOT_FOUND"),
  OCR_PROMPT_STALE: { status: 409, message: "The recognition prompt is no longer current; refresh the submission" },
  ...idempotencyErrors,
};

type PlayerSubmissionRouteDependencies = {
  servicesFor: (context: ApiContext) => PlatformServices;
  portalPlayerRoute: (
    action: (context: ApiContext, access: AuthenticatedPortalPlayer) => Promise<any> | any,
  ) => (context: ApiContext) => Promise<any>;
};

export const registerPlayerSubmissionRoutes = (app: ApiApp, dependencies: PlayerSubmissionRouteDependencies) => {
  const { servicesFor, portalPlayerRoute } = dependencies;

  app.get("/v1/me/submissions", portalPlayerRoute(async (c, access) => {
    const params = new URL(c.req.url).searchParams;
    if (!hasOnlyUniqueQueryNames(params, ["page", "pageSize"])) return errorResponse(c, 422, "INVALID_REQUEST", "The submissions query is invalid");
    const pagination = parsePagination(params, 50);
    if (!pagination) return errorResponse(c, 422, "INVALID_REQUEST", "The submissions query is invalid");
    const list = await servicesFor(c).listCurrentPlayerSubmissions({ sessionToken: access.sessionToken, ...pagination });
    if (!list) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(list);
  }));

  app.get("/v1/me/submissions/:submissionId", portalPlayerRoute(async (c, access) => {
    try {
      return c.json(await servicesFor(c).getPlayerSubmission({ submissionId: c.req.param("submissionId")! }, access.sessionToken));
    } catch (error) {
      return respondToMappedError(c, error, submissionNotFoundErrors);
    }
  }));

  // Screenshot-level accuracy marking (#253): one accurate/inaccurate mark per
  // recognition result; the latest value wins. No transcription is accepted.
  app.post("/v1/me/submissions/:submissionId/ocr-feedback", portalPlayerRoute(async (c, access) => {
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = ocrAccuracyFeedbackRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      const response = await servicesFor(c).submitPlayerOcrFeedback({ ...parsed.data, submissionId: c.req.param("submissionId")! }, access.sessionToken, idempotencyKey);
      return c.json(response);
    } catch (error) {
      return respondToMappedError(c, error, ocrFeedbackErrors);
    }
  }));
};
