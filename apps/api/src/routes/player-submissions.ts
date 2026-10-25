import { ocrAccuracyFeedbackRequestSchema } from "@owbastion/contracts";
import type { PlatformServices } from "@owbastion/domain";
import { hasOnlyUniqueQueryNames, parsePagination } from "../query-params";
import { parseBody, routeErrorResponse, type AdminRouteDependencies, type ApiApp, type ApiContext, type RouteErrorMap } from "./route-contract";

type AuthenticatedPortalPlayer = {
  sessionToken: string;
  player: NonNullable<Awaited<ReturnType<PlatformServices["getPortalSessionIdentity"]>>>;
};

const submissionNotFoundErrors: RouteErrorMap = { SUBMISSION_NOT_FOUND: { status: 404, message: "The submission does not exist" } };
const ocrFeedbackErrors: RouteErrorMap = {
  UNAUTHENTICATED: { status: 401, message: "Authentication is required" },
  ...submissionNotFoundErrors,
  OCR_FEEDBACK_UNAVAILABLE: { status: 409, message: "Feedback is unavailable for this submission" },
  OCR_RESULT_NOT_FOUND: { status: 409, message: "Feedback is unavailable for this submission" },
  OCR_PROMPT_STALE: { status: 409, message: "The recognition prompt is no longer current; refresh the submission" },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "The idempotency key was used with a different request" },
};

type PlayerSubmissionRouteDependencies = Pick<AdminRouteDependencies, "services" | "errorResponse"> & {
  portalPlayerRoute: (
    action: (context: ApiContext, access: AuthenticatedPortalPlayer) => Promise<any> | any,
  ) => (context: ApiContext) => Promise<any>;
};

export const registerPlayerSubmissionRoutes = (app: ApiApp, dependencies: PlayerSubmissionRouteDependencies) => {
  const { services, errorResponse, portalPlayerRoute } = dependencies;
  const respondTo = (c: ApiContext, error: unknown, errors: RouteErrorMap): Response => {
    const response = routeErrorResponse(c, error, errors, errorResponse);
    if (response) return response;
    throw error;
  };

  app.get("/v1/me/submissions", portalPlayerRoute(async (c, access) => {
    const params = new URL(c.req.url).searchParams;
    if (!hasOnlyUniqueQueryNames(params, ["page", "pageSize"])) return errorResponse(c, 422, "INVALID_REQUEST", "The submissions query is invalid");
    const pagination = parsePagination(params, 50);
    if (!pagination) return errorResponse(c, 422, "INVALID_REQUEST", "The submissions query is invalid");
    const list = await services(c.env).listCurrentPlayerSubmissions({ sessionToken: access.sessionToken, ...pagination });
    if (!list) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(list);
  }));

  app.get("/v1/me/submissions/:submissionId", portalPlayerRoute(async (c, access) => {
    try {
      return c.json(await services(c.env).getPlayerSubmission({ submissionId: c.req.param("submissionId")! }, access.sessionToken));
    } catch (error) {
      return respondTo(c, error, submissionNotFoundErrors);
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
      const response = await services(c.env).submitPlayerOcrFeedback({ ...parsed.data, submissionId: c.req.param("submissionId")! }, access.sessionToken, idempotencyKey);
      return c.json(response);
    } catch (error) {
      return respondTo(c, error, ocrFeedbackErrors);
    }
  }));
};
