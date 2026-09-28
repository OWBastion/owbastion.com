import {
  adminBindingClaimDecisionRequestSchema,
  adminBindingInviteBatchRequestSchema,
  adminBindingInviteRequestSchema,
  adminBindingInviteRevokeRequestSchema,
  bindingInviteRedeemRequestSchema,
} from "@owbastion/contracts";
import { maintainerRoute, parseBody, type AdminRouteDependencies, type ApiApp } from "./route-contract";

type BindingInviteRouteDependencies = AdminRouteDependencies & {
  allowPortal: (context: any) => void;
  sessionCookie: (request: Request, value: string, maxAge: number) => string;
};

export const registerBindingInviteRoutes = (app: ApiApp, dependencies: BindingInviteRouteDependencies) => {
  const { services, requireMaintainer, errorResponse, errorGroup, adminMutation, allowPortal, sessionCookie } = dependencies;

  app.post("/v1/public/binding-invites/redeem", async (c) => {
    allowPortal(c);
    const parsed = bindingInviteRedeemRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await services(c.env).redeemBindingInvite(parsed.data), 201); }
    catch (error) { if (error instanceof Error && error.message === "INVITE_INVALID") return errorResponse(c, 422, "INVITE_INVALID", "The invitation cannot be used"); throw error; }
  });

  app.get("/v1/public/binding-claims/:claimId", async (c) => {
    allowPortal(c);
    const claimId = c.req.param("claimId");
    const claimToken = c.req.header("x-claim-token");
    if (!/^[0-9a-f-]{36}$/.test(claimId) || !claimToken) return errorResponse(c, 422, "INVALID_CLAIM", "The binding claim is invalid");
    try { return c.json(await services(c.env).getBindingClaimStatus({ claimId, claimToken })); }
    catch (error) {
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_FOUND") return errorResponse(c, 404, "BINDING_CLAIM_NOT_FOUND", "The binding claim does not exist");
      if (error instanceof Error && error.message === "BINDING_CLAIM_FORBIDDEN") return errorResponse(c, 403, "BINDING_CLAIM_FORBIDDEN", "The binding claim token is invalid");
      throw error;
    }
  });

  app.post("/v1/public/binding-claims/:claimId/session", async (c) => {
    allowPortal(c);
    const claimId = c.req.param("claimId");
    const claimToken = c.req.header("x-claim-token");
    if (!/^[0-9a-f-]{36}$/.test(claimId) || !claimToken) return errorResponse(c, 422, "INVALID_CLAIM", "The binding claim is invalid");
    try {
      const result = await services(c.env).exchangeBindingClaimSession({ claimId, claimToken });
      c.header("Set-Cookie", sessionCookie(c.req.raw, result.sessionToken, 2592000));
      return c.json({ contractVersion: "1" as const, status: result.status });
    } catch (error) {
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_FOUND") return errorResponse(c, 404, "BINDING_CLAIM_NOT_FOUND", "The binding claim does not exist");
      if (error instanceof Error && error.message === "BINDING_CLAIM_FORBIDDEN") return errorResponse(c, 403, "BINDING_CLAIM_FORBIDDEN", "The binding claim token is invalid");
      if (error instanceof Error && error.message === "BINDING_CLAIM_NOT_COMPLETE") return errorResponse(c, 409, "BINDING_CLAIM_NOT_COMPLETE", "The binding claim is not complete");
      throw error;
    }
  });

  app.post("/v1/admin/binding-invites", (c) => adminMutation(c, {
    schema: adminBindingInviteRequestSchema,
    status: 201,
    action: (input, auth, key) => services(c.env).createAdminBindingInvite(input, auth, key),
    errors: errorGroup(409, "One or more historical titles are no longer unclaimed", "HISTORICAL_TITLE_GRANT_NOT_AVAILABLE"),
  }));

  app.post("/v1/admin/binding-invites/batch", (c) => adminMutation(c, {
    schema: adminBindingInviteBatchRequestSchema,
    status: 201,
    action: (input, auth, key) => services(c.env).createAdminBindingInviteBatch(input, auth, key),
    errors: errorGroup(409, "One or more historical titles are no longer unclaimed", "HISTORICAL_TITLE_GRANT_NOT_AVAILABLE"),
  }));

  app.get("/v1/admin/binding-invites", maintainerRoute(requireMaintainer, async (c, auth) => c.json(await services(c.env).listAdminBindingInvites(auth))));

  app.get("/v1/admin/bindings", maintainerRoute(requireMaintainer, async (c, auth) => c.json(await services(c.env).listAdminBindings(auth))));

  app.post("/v1/admin/binding-invites/:inviteId/historical-migration/retry", (c) => adminMutation(c, {
    noContent: true,
    action: (_input, auth, key) => services(c.env).retryHistoricalTitleMigration({ inviteId: c.req.param("inviteId") }, auth, key),
    errors: errorGroup(409, "The binding is not ready for historical title migration", "HISTORICAL_MIGRATION_NOT_READY"),
  }));

  app.get("/v1/admin/binding-invites/:inviteId/code", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await services(c.env).getAdminBindingInviteCode({ inviteId: c.req.param("inviteId")! }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "BINDING_INVITE_CODE_UNAVAILABLE") return errorResponse(c, 422, "BINDING_INVITE_CODE_UNAVAILABLE", "The invitation code cannot be retrieved"); throw error; }
  }));

  app.post("/v1/admin/binding-invites/:inviteId/revoke", (c) => adminMutation(c, {
    schema: adminBindingInviteRevokeRequestSchema,
    noContent: true,
    action: (input, auth, key) => services(c.env).revokeAdminBindingInvite({ ...input, inviteId: c.req.param("inviteId") }, auth, key),
    errors: errorGroup(422, "The invitation cannot be revoked", "BINDING_INVITE_NOT_REVOCABLE"),
  }));

  app.get("/v1/admin/binding-claims", maintainerRoute(requireMaintainer, async (c, auth) => c.json(await services(c.env).listAdminBindingClaims(auth))));

  app.post("/v1/admin/binding-claims/:claimId/decision", (c) => adminMutation(c, {
    schema: adminBindingClaimDecisionRequestSchema,
    noContent: true,
    action: (input, auth, key) => services(c.env).decideAdminBindingClaim({ ...input, claimId: c.req.param("claimId") }, auth, key),
    errors: errorGroup(422, "The claim cannot be reviewed", "BINDING_CLAIM_NOT_REVIEWABLE"),
  }));
};
