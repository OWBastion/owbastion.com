import { normalizePlayerHandle } from "@owbastion/domain";
import { playerHandleRequestSchema } from "@owbastion/contracts";
import { createPlayerWrite, maintainerRoute, type AdminRouteDependencies, type ApiApp, type RouteErrorMap } from "./route-contract";

type PlayerHandleDependencies = AdminRouteDependencies & {
  allowPortal: (context: any) => void;
  requirePortalPlayer: (context: any) => Promise<{ error?: Response; sessionToken?: string }>;
  logServiceOperation: (context: any, operation: string, action: () => Promise<unknown>) => Promise<unknown>;
};

const writeErrors: RouteErrorMap = {
  UNAUTHENTICATED: { status: 401, message: "Authentication is required" },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "The idempotency key was used with a different request" },
  HANDLE_INVALID_CHARACTERS: { status: 422, message: "The ID may only contain letters, digits, and Chinese characters" },
  HANDLE_INVALID_LENGTH: { status: 422, message: "The ID must be 2 to 9 characters long" },
  HANDLE_ALL_DIGITS: { status: 422, message: "The ID cannot be all digits" },
  HANDLE_RESERVED: { status: 422, message: "The ID contains a reserved term" },
  HANDLE_TAKEN: { status: 409, message: "The ID is already taken" },
  HANDLE_UNCHANGED: { status: 409, message: "The ID is already your current ID" },
  HANDLE_REQUEST_NOT_FOUND: { status: 404, message: "The ID request does not exist" },
};

export const registerPlayerHandleRoutes = (app: ApiApp, dependencies: PlayerHandleDependencies) => {
  const { services, allowPortal, errorResponse, requirePortalPlayer, logServiceOperation, requireMaintainer, errorGroup, adminMutation } = dependencies;

  const playerWrite = createPlayerWrite({ requirePortalPlayer, errorResponse }, writeErrors);

  app.get("/v1/me/handle", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const state = await services(c.env).getCurrentPlayerHandle({ sessionToken: access.sessionToken! });
    return state ? c.json(state) : errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
  });

  app.put("/v1/me/handle", playerWrite(playerHandleRequestSchema, (c, sessionToken, key, body) => services(c.env).requestCurrentPlayerHandle({ sessionToken, handle: body.handle }, key)));

  app.delete("/v1/me/handle/request", playerWrite(null, (c, sessionToken, key) => services(c.env).withdrawCurrentPlayerHandleRequest({ sessionToken }, key)));

  app.get("/v1/admin/player-handles", maintainerRoute(requireMaintainer, async (c, auth) => {
    const status = c.req.query("status") ?? "pending";
    if (status !== "pending" && status !== "active") return errorResponse(c, 422, "INVALID_REQUEST", "The status is invalid");
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
    return c.json(await services(c.env).listAdminPlayerHandles({ status, page, pageSize }, auth));
  }));

  const decisionErrors = errorGroup(404, "The ID request does not exist", "HANDLE_REQUEST_NOT_FOUND");
  app.post("/v1/admin/player-handles/:handleId/approve", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => services(c.env).approveAdminPlayerHandleRequest({ handleId: c.req.param("handleId") }, auth, key),
    errors: decisionErrors,
  }));
  app.post("/v1/admin/player-handles/:handleId/reject", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => services(c.env).rejectAdminPlayerHandleRequest({ handleId: c.req.param("handleId") }, auth, key),
    errors: decisionErrors,
  }));
  app.delete("/v1/admin/player-accounts/:playerAccountId/handle", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => services(c.env).clearAdminPlayerHandle({ playerAccountId: c.req.param("playerAccountId") }, auth, key),
    errors: errorGroup(404, "The player has no ID", "HANDLE_NOT_FOUND"),
  }));

  // Public profile by handle: unknown, pending-only, cleared, and non-public
  // Players are all the same 404.
  app.get("/v1/public/players/:handle", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const profile = await logServiceOperation(c, "public_player_profile", () => services(c.env).getPublicPlayerByHandle({ handle: normalizePlayerHandle(c.req.param("handle")) }));
    return profile ? c.json(profile) : errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist");
  });
};
