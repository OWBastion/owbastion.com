import { playerEquippedTitlesRequestSchema, playerMapTitleWearRequestSchema } from "@owbastion/contracts";
import type { PlatformServices } from "@owbastion/domain";
import { parseBody, type ApiApp, type RouteErrorMap } from "./route-contract";

const idempotencyConflict = { status: 409, message: "The idempotency key was used with a different request" } as const;
const unauthenticatedErrors: RouteErrorMap = { UNAUTHENTICATED: { status: 401, message: "Authentication is required" } };
export const equippedTitleErrors: RouteErrorMap = {
  EQUIPPED_TITLE_GRANT_INVALID: { status: 422, message: "The selected titles cannot be equipped" },
  EQUIPPED_TITLE_LIMIT_EXCEEDED: { status: 422, message: "The selected titles cannot be equipped" },
  IDEMPOTENCY_CONFLICT: idempotencyConflict,
};

type PlayerTitleRouteDependencies = {
  servicesFor: (context: any) => PlatformServices;
  allowPortal: (context: any) => void;
  errorResponse: (context: any, status: 401 | 422, code: string, message: string) => Response;
  portalSessionToken: (request: Request) => string | undefined;
  respondToMappedError: (context: any, error: unknown, errors: RouteErrorMap) => Response;
};

export const registerPlayerTitleRoutes = (app: ApiApp, dependencies: PlayerTitleRouteDependencies) => {
  const { servicesFor, allowPortal, errorResponse, portalSessionToken, respondToMappedError } = dependencies;

  app.get("/v1/me/titles", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const titles = await servicesFor(c).listCurrentPlayerTitles({ sessionToken });
    if (!titles) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json({ contractVersion: "1", ...titles });
  });

  app.put("/v1/me/titles/equipped", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = playerEquippedTitlesRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await servicesFor(c).replaceCurrentPlayerEquippedTitles({ ...parsed.data, sessionToken }, idempotencyKey)); }
    catch (error) {
      return respondToMappedError(c, error, { ...unauthenticatedErrors, ...equippedTitleErrors });
    }
  });

  app.get("/v1/me/titles/map-wear", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const sessionToken = portalSessionToken(c.req.raw);
    const wear = sessionToken ? await servicesFor(c).getCurrentPlayerMapTitleWear({ sessionToken }) : null;
    if (!wear) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    return c.json(wear);
  });

  app.put("/v1/me/titles/map-wear", async (c) => {
    allowPortal(c);
    const sessionToken = portalSessionToken(c.req.raw);
    if (!sessionToken) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = playerMapTitleWearRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await servicesFor(c).updateCurrentPlayerMapTitleWear({ ...parsed.data, sessionToken }, idempotencyKey)); }
    catch (error) { return respondToMappedError(c, error, { ...unauthenticatedErrors, IDEMPOTENCY_CONFLICT: idempotencyConflict }); }
  });
};
