import {
  playerReviewUpsertRequestSchema,
  playerReviewWithdrawRequestSchema,
  reviewTargetSchema,
  reviewTargetTypeSchema,
} from "@owbastion/contracts";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import { isUuid, parseBody, routeErrorResponse, type ApiApp, type ApiContext, type AdminRouteDependencies, type RouteErrorMap, type ServiceAccessor } from "./route-contract";

type Player = NonNullable<Awaited<ReturnType<PlatformServices["getCurrentPlayer"]>>>;
type PlayerAccess = { error?: Response; sessionToken?: string; player?: Player };
type ReviewRouteDependencies = Pick<AdminRouteDependencies, "errorResponse"> & {
  services: ServiceAccessor;
  allowPortal: (c: ApiContext) => void;
  requirePortalPlayer: (c: ApiContext) => Promise<PlayerAccess>;
  logServiceOperation: <T>(c: ApiContext, operation: string, action: () => Promise<T>) => Promise<T>;
};
const playerReviewReadErrors = {
  PLAYER_NOT_FOUND: { status: 401, message: "Authentication is required" },
  REVIEW_TARGET_NOT_FOUND: { status: 404, message: "The review target does not exist" },
} satisfies RouteErrorMap;

const playerReviewUpsertErrors = {
  PLAYER_NOT_FOUND: { status: 401, message: "Authentication is required" },
  PLAYER_BANNED: { status: 403, message: "The player account is banned" },
  REVIEW_TARGET_NOT_FOUND: { status: 404, message: "The review target does not exist" },
  REVIEW_TARGET_NOT_RATEABLE: { status: 409, message: "The review target is closed to new reviews" },
  REVIEW_INVALIDATED: { status: 409, message: "The review cannot be updated" },
  REVIEW_RATING_INVALID: { status: 422, message: "The review content is invalid" },
  REVIEW_COMMENT_TOO_LONG: { status: 422, message: "The review content is invalid" },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "The idempotency key was used with a different request" },
} satisfies RouteErrorMap;

const playerReviewWithdrawErrors = {
  PLAYER_NOT_FOUND: { status: 401, message: "Authentication is required" },
  REVIEW_NOT_FOUND: { status: 404, responseCode: "REVIEW_NOT_FOUND", message: "The review does not exist" },
  REVIEW_NOT_OWNED: { status: 404, responseCode: "REVIEW_NOT_FOUND", message: "The review does not exist" },
  REVIEW_INVALIDATED: { status: 409, message: "The review cannot be withdrawn" },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "The idempotency key was used with a different request" },
} satisfies RouteErrorMap;

const publicReviewErrors = {
  REVIEW_TARGET_NOT_FOUND: { status: 404, message: "The review target does not exist" },
} satisfies RouteErrorMap;

const playerAuth = (player: Player): AuthContext => ({
  actorType: "user",
  subject: player.player.playerId,
  roles: [],
  provider: "portal-session",
});

type PlayerReview = NonNullable<Awaited<ReturnType<PlatformServices["getPlayerReview"]>>>;
const playerReviewView = (review: PlayerReview) => ({
  reviewId: review.reviewId,
  targetType: review.targetType,
  targetId: review.targetId,
  gameplayRevisionId: review.gameplayRevisionId,
  rating: review.rating,
  comment: review.comment,
  anonymous: review.anonymous,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
});

const parseReviewTarget = (c: ApiContext) => {
  const targetType = c.req.param("targetType");
  const targetId = c.req.param("targetId");
  return reviewTargetSchema.safeParse(targetType === "map"
    ? { targetType, targetId, gameplayRevisionId: c.req.query("gameplayRevisionId") }
    : { targetType, targetId });
};

const parsePublicReviewPage = (c: ApiContext) => {
  const page = Number(c.req.query("page") ?? "1");
  const pageSize = Number(c.req.query("pageSize") ?? "20");
  return Number.isInteger(page) && page >= 1 && Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50 ? { page, pageSize } : null;
};

export const registerReviewRoutes = (app: ApiApp, dependencies: ReviewRouteDependencies) => {
  const { services, allowPortal, requirePortalPlayer, errorResponse, logServiceOperation } = dependencies;

  app.get("/v1/me/reviews/:targetType/:targetId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const target = parseReviewTarget(c);
    if (!target.success) return errorResponse(c, 422, "INVALID_REVIEW_TARGET", "The review target is invalid");
    try {
      const review = await services(c.env).getPlayerReview(target.data, playerAuth(access.player!));
      return c.json({ contractVersion: "1", review: review?.status === "active" ? playerReviewView(review) : null });
    } catch (error) {
      const response = routeErrorResponse(c, error, playerReviewReadErrors, errorResponse);
      if (response) return response;
      throw error;
    }
  });

  app.put("/v1/me/reviews/:targetType/:targetId", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const target = parseReviewTarget(c);
    if (!target.success) return errorResponse(c, 422, "INVALID_REVIEW_TARGET", "The review target is invalid");
    const parsed = playerReviewUpsertRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The review content does not match contract v1");
    const { contractVersion: _contractVersion, ...reviewInput } = parsed.data;
    try {
      const review = await services(c.env).upsertReview({ ...target.data, ...reviewInput, rating: reviewInput.rating as 1 | 2 | 3 | 4 | 5 }, playerAuth(access.player!), idempotencyKey);
      return c.json({ contractVersion: "1", review: playerReviewView(review) });
    } catch (error) {
      const response = routeErrorResponse(c, error, playerReviewUpsertErrors, errorResponse);
      if (response) return response;
      throw error;
    }
  });

  app.post("/v1/me/reviews/:reviewId/withdraw", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const reviewId = c.req.param("reviewId");
    if (!isUuid(reviewId)) return errorResponse(c, 422, "INVALID_REVIEW_ID", "The review ID is invalid");
    const parsed = playerReviewWithdrawRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try {
      await services(c.env).withdrawReview({ reviewId }, playerAuth(access.player!), idempotencyKey);
      return c.json({ contractVersion: "1", review: null });
    } catch (error) {
      const response = routeErrorResponse(c, error, playerReviewWithdrawErrors, errorResponse);
      if (response) return response;
      throw error;
    }
  });

  app.get("/v1/public/reviews/summaries", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const targetType = reviewTargetTypeSchema.safeParse(c.req.query("targetType"));
    const targetIds = (c.req.query("targetIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const gameplayRevisionIds = (c.req.query("gameplayRevisionIds") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const uniqueTargets = targetType.success && targetType.data === "map"
      ? new Set(targetIds.map((targetId, index) => JSON.stringify([targetId, gameplayRevisionIds[index]]))).size === targetIds.length
      : new Set(targetIds).size === targetIds.length;
    const validIds = targetIds.length > 0 && targetIds.length <= 100 && uniqueTargets;
    const targets = targetType.success && targetType.data === "map" && gameplayRevisionIds.length === targetIds.length
      ? targetIds.map((targetId, index) => ({ targetType: "map", targetId, gameplayRevisionId: gameplayRevisionIds[index] }))
      : [];
    const targetsValid = targetType.success && (targetType.data === "map"
      ? targets.length === targetIds.length && targets.every((target) => reviewTargetSchema.safeParse(target).success)
      : targetIds.every((targetId) => reviewTargetSchema.safeParse({ targetType: "event", targetId }).success));
    if (!targetType.success || !validIds || !targetsValid || targetType.data === "event" && gameplayRevisionIds.length > 0) {
      return errorResponse(c, 422, "INVALID_REQUEST", "The review summary targets are invalid");
    }
    try {
      const items = await logServiceOperation(c, "review_public_summary_batch", () => services(c.env).getReviewSummaries(
        targetType.data === "map" ? { targetType: "map", targets: targets.map(({ targetId, gameplayRevisionId }) => ({ targetId, gameplayRevisionId: gameplayRevisionId! })) } : { targetType: "event", targetIds },
      ));
      return c.json({ contractVersion: "1", targetType: targetType.data, items });
    } catch (error) {
      const response = routeErrorResponse(c, error, publicReviewErrors, errorResponse);
      if (response) return response;
      throw error;
    }
  });

  app.get("/v1/public/reviews/:targetType/:targetId/summary", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const target = parseReviewTarget(c);
    if (!target.success) return errorResponse(c, 422, "INVALID_REVIEW_TARGET", "The review target is invalid");
    try {
      const summary = await logServiceOperation(c, "review_public_summary", () => services(c.env).getReviewSummary(target.data));
      return c.json({ contractVersion: "1", summary });
    } catch (error) {
      const response = routeErrorResponse(c, error, publicReviewErrors, errorResponse);
      if (response) return response;
      throw error;
    }
  });

  app.get("/v1/public/reviews/:targetType/:targetId/comments", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const target = parseReviewTarget(c);
    const page = parsePublicReviewPage(c);
    if (!target.success || !page) return errorResponse(c, 422, "INVALID_REQUEST", "The review comment request is invalid");
    try {
      const comments = await logServiceOperation(c, "review_public_comments", () => services(c.env).listPublicReviewComments({ ...target.data, ...page }));
      return c.json({ contractVersion: "1", ...comments });
    } catch (error) {
      const response = routeErrorResponse(c, error, publicReviewErrors, errorResponse);
      if (response) return response;
      throw error;
    }
  });
};
