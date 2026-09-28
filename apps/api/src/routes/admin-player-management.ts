import {
  adminManualTitleGrantBatchRequestSchema,
  adminManualTitleGrantRequestSchema,
  adminPlayerIdentityRequestSchema,
  adminPlayerStatusRequestSchema,
  adminTitleGrantBulkRequestSchema,
  adminTitleGrantRequestSchema,
  adminTitleGrantRestoreRequestSchema,
  adminTitleGrantRevokeRequestSchema,
} from "@owbastion/contracts";
import { maintainerRoute, type AdminRouteDependencies, type ApiApp } from "./route-contract";

export const registerAdminPlayerManagementRoutes = (app: ApiApp, dependencies: AdminRouteDependencies) => {
  const { requireMaintainer, errorResponse, errorGroup, adminMutation } = dependencies;

  app.get("/v1/admin/player-accounts", maintainerRoute(requireMaintainer, async (c, auth) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 25) || 25));
    const status = c.req.query("status");
    if (status && status !== "active" && status !== "banned") return errorResponse(c, 422, "INVALID_REQUEST", "The status is invalid");
    return c.json(await dependencies.services(c.env).listAdminPlayers({ query: c.req.query("query")?.trim() || undefined, status: status as "active" | "banned" | undefined, page, pageSize }, auth));
  }));

  app.get("/v1/admin/player-accounts/:playerAccountId", maintainerRoute(requireMaintainer, async (c, auth) => {
    try { return c.json(await dependencies.services(c.env).getAdminPlayer({ playerAccountId: c.req.param("playerAccountId")! }, auth)); }
    catch (error) { if (error instanceof Error && error.message === "PLAYER_NOT_FOUND") return errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist"); throw error; }
  }));

  app.put("/v1/admin/player-accounts/:playerAccountId/status", async (c) => {
    return adminMutation(c, {
      schema: adminPlayerStatusRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).setAdminPlayerStatus({ ...input, playerAccountId: c.req.param("playerAccountId") }, auth, key),
      errors: {
        ...errorGroup(404, "The player does not exist", "PLAYER_NOT_FOUND"),
      },
    });
  });

  app.put("/v1/admin/player-accounts/:playerAccountId/identity", async (c) => {
    return adminMutation(c, {
      schema: adminPlayerIdentityRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).updateAdminPlayerIdentity({ ...input, playerAccountId: c.req.param("playerAccountId") }, auth, key),
      errors: {
        ...errorGroup(404, "The player does not exist", "PLAYER_NOT_FOUND"),
        ...errorGroup(409, "The BattleTag is already used by another player", "PLAYER_BATTLETAG_CONFLICT"),
      },
    });
  });

  app.delete("/v1/admin/bindings/:bindingId", async (c) => {
    return adminMutation(c, {
      noContent: true,
      action: (_input, auth, key) => dependencies.services(c.env).removeAdminBinding({ bindingId: c.req.param("bindingId") }, auth, key),
      errors: {
        ...errorGroup(404, "The binding does not exist", "BINDING_NOT_FOUND"),
      },
    });
  });

  app.get("/v1/admin/title-grants", maintainerRoute(requireMaintainer, async (c, auth) => {
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? "20") || 20));
    const filter = c.req.query("filter")?.trim() || "all";
    if (filter !== "all" && filter !== "pending" && filter !== "completed") return errorResponse(c, 422, "INVALID_REQUEST", "The filter is invalid");
    return c.json(await dependencies.services(c.env).listHistoricalTitleGrants({ query: c.req.query("query")?.trim() || undefined, filter, page, pageSize }, auth));
  }));

  app.get("/v1/admin/title-grants/holder", maintainerRoute(requireMaintainer, async (c, auth) => {
    const holderName = c.req.query("holderName")?.trim() || "";
    if (!holderName) return errorResponse(c, 422, "INVALID_REQUEST", "holderName is required");
    const page = Math.max(1, Number(c.req.query("page") ?? "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query("pageSize") ?? "50") || 50));
    const grantStatus = c.req.query("grantStatus")?.trim() || "all";
    if (grantStatus !== "all" && grantStatus !== "unclaimed" && grantStatus !== "active" && grantStatus !== "revoked") return errorResponse(c, 422, "INVALID_REQUEST", "The grantStatus is invalid");
    try {
      return c.json(await dependencies.services(c.env).getHistoricalTitleHolder({ holderName, page, pageSize, grantStatus }, auth));
    } catch (error) {
      if (error instanceof Error && error.message === "HISTORICAL_HOLDER_NOT_FOUND") return errorResponse(c, 404, "HISTORICAL_HOLDER_NOT_FOUND", "The historical holder does not exist");
      throw error;
    }
  }));

  app.post("/v1/admin/title-grants", async (c) => {
    return adminMutation(c, {
      schema: adminTitleGrantRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).createAdminTitleGrant(input, auth, key),
      errors: {
        ...errorGroup(404, "The requested record does not exist", "HISTORICAL_TITLE_GRANT_NOT_FOUND", "PLAYER_NOT_FOUND"),
        ...errorGroup(409, "The historical title is already linked", "HISTORICAL_TITLE_GRANT_CLAIMED"),
        ...errorGroup(409, "The title grant cannot be created in its current state", "TITLE_GRANT_ADMINISTRATIVELY_REVOKED", "TITLE_GRANT_EVIDENCE_INVALIDATED", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });

  app.post("/v1/admin/title-grants/bulk", async (c) => {
    return adminMutation(c, {
      schema: adminTitleGrantBulkRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).createAdminTitleGrantBulk(input, auth, key),
      errors: {
        ...errorGroup(404, "The requested player does not exist", "PLAYER_NOT_FOUND"),
        ...errorGroup(409, "The title grant cannot be created in its current state", "TITLE_GRANT_ADMINISTRATIVELY_REVOKED", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });

  app.post("/v1/admin/title-grants/manual", async (c) => {
    return adminMutation(c, {
      schema: adminManualTitleGrantRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).createAdminManualTitleGrant(input, auth, key),
      errors: {
        ...errorGroup(404, "The requested player, title, or map does not exist", "PLAYER_NOT_FOUND", "TITLE_NOT_FOUND", "MAP_NOT_FOUND"),
        ...errorGroup(422, "The title, map, and gameplay revision combination is invalid", "GLOBAL_TITLE_CANNOT_HAVE_MAP", "MAP_TITLE_REQUIRES_MAP", "TITLE_MAP_REWARD_NOT_CONFIGURED", "GAMEPLAY_REVISION_NOT_FOUND", "GAMEPLAY_REVISION_INVALID"),
      },
    });
  });

  app.post("/v1/admin/title-grants/manual/batch", async (c) => {
    return adminMutation(c, {
      schema: adminManualTitleGrantBatchRequestSchema,
      action: (input, auth, key) => dependencies.services(c.env).createAdminManualTitleGrantBatch(input, auth, key),
      errors: {
        ...errorGroup(404, "The requested player, title, or map does not exist", "PLAYER_NOT_FOUND", "TITLE_NOT_FOUND", "MAP_NOT_FOUND"),
        ...errorGroup(422, "The title, map, gameplay revision, or batch size is invalid", "GLOBAL_TITLE_CANNOT_HAVE_MAP", "MAP_TITLE_REQUIRES_MAP", "TITLE_MAP_REWARD_NOT_CONFIGURED", "GAMEPLAY_REVISION_NOT_FOUND", "GAMEPLAY_REVISION_INVALID", "MANUAL_TITLE_GRANT_BATCH_TOO_LARGE"),
      },
    });
  });

  app.post("/v1/admin/title-grants/:grantId/revoke", async (c) => {
    return adminMutation(c, {
      schema: adminTitleGrantRevokeRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).revokeAdminTitleGrant({ grantId: c.req.param("grantId"), reason: input.reason }, auth, key),
      errors: {
        ...errorGroup(404, "The title grant does not exist", "TITLE_GRANT_NOT_FOUND"),
        ...errorGroup(409, "The title grant cannot be revoked in its current state", "TITLE_GRANT_NOT_ACTIVE", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });

  app.post("/v1/admin/title-grants/:grantId/restore", async (c) => {
    return adminMutation(c, {
      schema: adminTitleGrantRestoreRequestSchema,
      noContent: true,
      action: (input, auth, key) => dependencies.services(c.env).restoreAdminTitleGrant({ grantId: c.req.param("grantId"), reason: input.reason }, auth, key),
      errors: {
        ...errorGroup(404, "The title grant does not exist", "TITLE_GRANT_NOT_FOUND"),
        ...errorGroup(409, "The title grant cannot be restored in its current state", "TITLE_GRANT_NOT_ADMINISTRATIVELY_REVOKED", "TITLE_ALREADY_OWNED", "IDEMPOTENCY_CONFLICT"),
      },
    });
  });

};
