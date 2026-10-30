import {
  adminInvitationOverviewQuerySchema,
  adminPlayerInvitationOverrideRequestSchema,
  adminPlayerInvitationPolicyRequestSchema,
  playerInvitationCreateRequestSchema,
  playerInvitationRedeemRequestSchema,
} from "@owbastion/contracts/player-invitation";
import { hasOnlyUniqueQueryNames, parsePagination } from "../query-params";
import { createPlayerWrite, isUuid, maintainerRoute, parseBody, routeErrorResponse, errorResponse, errorGroup, type AdminRouteDependencies, type ApiApp, type RouteErrorMap } from "./route-contract";
import type { TurnstileGuard } from "../turnstile";

type PlayerInvitationDependencies = AdminRouteDependencies & {
  allowPortal: (context: any) => void;
  requirePortalPlayer: (context: any) => Promise<{ error?: Response; sessionToken?: string }>;
  requireTurnstile: TurnstileGuard;
};

const writeErrors: RouteErrorMap = {
  UNAUTHENTICATED: { status: 401, message: "Authentication is required" },
  IDEMPOTENCY_CONFLICT: { status: 409, message: "The idempotency key was used with a different request" },
  PLAYER_INVITATION_CODE_INVALID: { status: 422, message: "The code must be 4 to 20 letters, digits, or inner hyphens" },
  PLAYER_INVITATION_CODE_RESERVED: { status: 422, message: "The code uses a reserved prefix" },
  PLAYER_INVITATION_CODE_TAKEN: { status: 409, message: "The code is already taken" },
  PLAYER_INVITATION_DISABLED: { status: 403, message: "Player invitations are not available" },
  PLAYER_INVITATION_NOT_ELIGIBLE: { status: 403, message: "The account does not meet the invitation requirements" },
  PLAYER_INVITATION_LIMIT_EXCEEDED: { status: 422, message: "The use limit or validity exceeds the current policy" },
  PLAYER_INVITATION_QUOTA_EXHAUSTED: { status: 409, message: "The registration quota for this period is used up" },
  PLAYER_INVITATION_NOT_FOUND: { status: 404, message: "The invitation does not exist" },
};

const redeemErrors: RouteErrorMap = {
  INVITE_INVALID: { status: 422, message: "The invitation cannot be used" },
  PLAYER_INVITATION_ACCOUNT_EXISTS: { status: 409, message: "The BattleTag is already registered" },
  PLAYER_INVITATION_LEGACY_CANDIDATE: { status: 409, message: "The BattleTag needs a maintainer to continue" },
};

export const registerPlayerInvitationRoutes = (app: ApiApp, dependencies: PlayerInvitationDependencies) => {
  const { services, allowPortal, requirePortalPlayer, requireTurnstile, requireMaintainer, adminMutation } = dependencies;
  const playerWrite = createPlayerWrite({ requirePortalPlayer }, writeErrors);
  const pageOf = (c: any, maxPageSize: number) => parsePagination(new URL(c.req.url).searchParams, maxPageSize);
  const invalidPage = (c: any) => errorResponse(c, 422, "INVALID_REQUEST", "The pagination is invalid");

  const playerRead = (read: (c: any, sessionToken: string, page: { page: number; pageSize: number }) => Promise<unknown>) => async (c: any) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    if (!hasOnlyUniqueQueryNames(new URL(c.req.url).searchParams, ["page", "pageSize"])) return invalidPage(c);
    const page = pageOf(c, 20);
    if (!page) return invalidPage(c);
    const result = await read(c, access.sessionToken!, page);
    return result ? c.json(result) : errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
  };

  app.get("/v1/me/invitations", playerRead((c, sessionToken, page) => services(c).getCurrentPlayerInvitations({ sessionToken, ...page })));
  app.get("/v1/me/invitations/redemptions", playerRead((c, sessionToken, page) => services(c).listCurrentPlayerInvitationRedemptions({ sessionToken, ...page })));
  app.post("/v1/me/invitations", playerWrite(playerInvitationCreateRequestSchema, (c, sessionToken, key, body) =>
    services(c).createCurrentPlayerInvitation({ sessionToken, code: body.code, maxUses: body.maxUses, validityDays: body.validityDays }, key), 201));
  app.post("/v1/me/invitations/:invitationId/revoke", (c) => isUuid(c.req.param("invitationId"))
    ? playerWrite(null, (context, sessionToken, key) => services(context.env).revokeCurrentPlayerInvitation({ sessionToken, invitationId: context.req.param("invitationId") }, key))(c)
    : errorResponse(c, 404, "PLAYER_INVITATION_NOT_FOUND", "The invitation does not exist"));

  app.post("/v1/public/player-invitations/redeem", async (c) => {
    allowPortal(c);
    const denied = await requireTurnstile(c);
    if (denied) return denied;
    const parsed = playerInvitationRedeemRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c).redeemPlayerInvitation(parsed.data), 201); }
    catch (error) {
      const response = routeErrorResponse(c, error, redeemErrors);
      if (response) return response;
      throw error;
    }
  });

  const adminPage = (c: any) => hasOnlyUniqueQueryNames(new URL(c.req.url).searchParams, ["page", "pageSize"]) ? pageOf(c, 50) : null;
  const notFound = errorGroup(404, "The invitation does not exist", "PLAYER_INVITATION_NOT_FOUND");
  const playerNotFound = errorGroup(404, "The player does not exist", "PLAYER_NOT_FOUND");

  app.get("/v1/admin/player-invitations/policy", maintainerRoute(requireMaintainer, async (c, auth) => c.json(await services(c).getAdminPlayerInvitationPolicy(auth))));
  app.put("/v1/admin/player-invitations/policy", (c) => adminMutation(c, {
    schema: adminPlayerInvitationPolicyRequestSchema,
    action: (input, auth, key) => services(c).setAdminPlayerInvitationPolicy({ policy: input.policy }, auth, key),
  }));
  app.get("/v1/admin/player-invitations/overrides", maintainerRoute(requireMaintainer, async (c, auth) => {
    const page = adminPage(c);
    return page ? c.json(await services(c).listAdminPlayerInvitationOverrides(page, auth)) : invalidPage(c);
  }));
  app.put("/v1/admin/player-invitations/overrides/:playerAccountId", (c) => adminMutation(c, {
    schema: adminPlayerInvitationOverrideRequestSchema,
    noContent: true,
    action: (input, auth, key) => services(c).setAdminPlayerInvitationOverride({ playerAccountId: c.req.param("playerAccountId"), override: input.override }, auth, key),
    errors: playerNotFound,
  }));
  app.delete("/v1/admin/player-invitations/overrides/:playerAccountId", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => services(c).clearAdminPlayerInvitationOverride({ playerAccountId: c.req.param("playerAccountId") }, auth, key),
  }));
  app.get("/v1/admin/player-invitations/audit", maintainerRoute(requireMaintainer, async (c, auth) => {
    const page = adminPage(c);
    return page ? c.json(await services(c).listAdminPlayerInvitationAudit(page, auth)) : invalidPage(c);
  }));
  app.get("/v1/admin/invitations", maintainerRoute(requireMaintainer, async (c, auth) => {
    const params = new URL(c.req.url).searchParams;
    if (!hasOnlyUniqueQueryNames(params, ["type", "status", "issuer", "from", "to", "page", "pageSize"])) return invalidPage(c);
    const parsed = adminInvitationOverviewQuerySchema.safeParse(c.req.query());
    return parsed.success ? c.json(await services(c).listAdminInvitations(parsed.data, auth)) : errorResponse(c, 422, "INVALID_REQUEST", "The query does not match contract v1");
  }));
  app.get("/v1/admin/player-invitations/:invitationId", maintainerRoute(requireMaintainer, async (c, auth) => {
    const page = adminPage(c);
    if (!page) return invalidPage(c);
    const invitationId = c.req.param("invitationId") ?? "";
    if (!isUuid(invitationId)) return errorResponse(c, 404, "PLAYER_INVITATION_NOT_FOUND", "The invitation does not exist");
    try { return c.json(await services(c).getAdminPlayerInvitation({ invitationId, ...page }, auth)); }
    catch (error) {
      const response = routeErrorResponse(c, error, { PLAYER_INVITATION_NOT_FOUND: { status: 404, message: "The invitation does not exist" } });
      if (response) return response;
      throw error;
    }
  }));
  app.post("/v1/admin/player-invitations/:invitationId/revoke", (c) => adminMutation(c, {
    noContent: true,
    before: () => isUuid(c.req.param("invitationId")) ? undefined : errorResponse(c, 404, "PLAYER_INVITATION_NOT_FOUND", "The invitation does not exist"),
    action: (_input, auth, key) => services(c).revokeAdminPlayerInvitation({ invitationId: c.req.param("invitationId") }, auth, key),
    errors: notFound,
  }));
};
