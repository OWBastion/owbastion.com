import {
  adminVerifiedRunConflictResolutionRequestSchema,
  adminVerifiedRunCorrectionRequestSchema,
  adminVerifiedRunStateRequestSchema,
} from "@owbastion/contracts";
import { hasOnlyUniqueQueryNames } from "../query-params";
import { isUuid, maintainerRoute, type AdminRouteDependencies, type ApiApp } from "./route-contract";

const adminVerifiedRunQuery = (request: Request) => {
  const params = new URL(request.url).searchParams;
  const allowed = ["playerAccountId", "mapId", "gameplayRevisionId", "difficulty", "status", "unresolvedConflictsOnly", "acceptanceSource", "matchCode", "from", "to", "page", "pageSize"];
  if (!hasOnlyUniqueQueryNames(params, allowed)) return null;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  const playerAccountId = params.get("playerAccountId")?.trim() || undefined;
  const mapId = params.get("mapId")?.trim() || undefined;
  const gameplayRevisionId = params.get("gameplayRevisionId")?.trim() || undefined;
  const difficulty = params.get("difficulty")?.trim() || undefined;
  const status = params.get("status")?.trim() || undefined;
  const unresolvedConflictsOnly = params.get("unresolvedConflictsOnly");
  const acceptanceSource = params.get("acceptanceSource")?.trim() || undefined;
  const matchCode = params.get("matchCode")?.trim() || undefined;
  const fromValue = params.get("from");
  const toValue = params.get("to");
  const from = fromValue === null ? undefined : Number(fromValue);
  const to = toValue === null ? undefined : Number(toValue);
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) return null;
  if (playerAccountId && !isUuid(playerAccountId)) return null;
  if (mapId && mapId.length > 256) return null;
  if (gameplayRevisionId && gameplayRevisionId.length > 256) return null;
  if (difficulty && !["简单", "一般", "困难", "专家", "传奇", "地狱"].includes(difficulty)) return null;
  if (status && !["active", "invalidated"].includes(status)) return null;
  if (unresolvedConflictsOnly !== null && unresolvedConflictsOnly !== "true") return null;
  if (acceptanceSource && !["submission_automatic", "submission_review"].includes(acceptanceSource)) return null;
  if (matchCode && !/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/.test(matchCode)) return null;
  if (from !== undefined && (!Number.isInteger(from) || from < 0)) return null;
  if (to !== undefined && (!Number.isInteger(to) || to < 0)) return null;
  if (from !== undefined && to !== undefined && from > to) return null;
  return {
    page,
    pageSize,
    ...(playerAccountId ? { playerAccountId } : {}),
    ...(mapId ? { mapId } : {}),
    ...(gameplayRevisionId ? { gameplayRevisionId } : {}),
    ...(difficulty ? { difficulty: difficulty as "简单" | "一般" | "困难" | "专家" | "传奇" | "地狱" } : {}),
    ...(status ? { status: status as "active" | "invalidated" } : {}),
    ...(unresolvedConflictsOnly === "true" ? { unresolvedConflictsOnly: true } : {}),
    ...(acceptanceSource ? { acceptanceSource: acceptanceSource as "submission_automatic" | "submission_review" } : {}),
    ...(matchCode ? { matchCode } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
};

export const registerAdminVerifiedRunRoutes = (app: ApiApp, dependencies: AdminRouteDependencies) => {
  const { services, requireMaintainer, errorResponse, errorGroup, adminMutation } = dependencies;

  app.get("/v1/admin/verified-runs", maintainerRoute(requireMaintainer, async (c, auth) => {
    const query = adminVerifiedRunQuery(c.req.raw);
    if (!query) return errorResponse(c, 422, "INVALID_REQUEST", "The verified run query is invalid");
    return c.json(await services(c.env).listAdminVerifiedRuns(query, auth));
  }));

  app.get("/v1/admin/verified-runs/:verifiedRunId", maintainerRoute(requireMaintainer, async (c, auth) => {
    const verifiedRunId = c.req.param("verifiedRunId")!;
    if (!isUuid(verifiedRunId)) return errorResponse(c, 422, "INVALID_VERIFIED_RUN_ID", "The verified run ID is invalid");
    try {
      return c.json(await services(c.env).getAdminVerifiedRun({ verifiedRunId }, auth));
    } catch (error) {
      const code = error instanceof Error ? error.message : "VERIFIED_RUN_LOOKUP_FAILED";
      if (["VERIFIED_RUN_NOT_FOUND", "VERIFIED_RUN_SUBMISSION_NOT_FOUND"].includes(code)) return errorResponse(c, 404, code, "The verified run does not exist");
      throw error;
    }
  }));

  app.post("/v1/admin/verified-runs/:verifiedRunId/state", async (c) => {
    const verifiedRunId = c.req.param("verifiedRunId");
    return adminMutation(c, {
      schema: adminVerifiedRunStateRequestSchema,
      before: () => isUuid(verifiedRunId)
        ? undefined
        : errorResponse(c, 422, "INVALID_VERIFIED_RUN_ID", "The verified run ID is invalid"),
      action: (input, auth, key) => services(c.env).transitionAdminVerifiedRun({ ...input, verifiedRunId }, auth, key),
      errors: {
        ...errorGroup(404, "The verified run does not exist", "VERIFIED_RUN_NOT_FOUND"),
        ...errorGroup(409, "Another active run already uses this match code", "VERIFIED_RUN_MATCH_CODE_CONFLICT"),
      },
    });
  });

  app.post("/v1/admin/verified-runs/:verifiedRunId/conflicts/:submissionId", async (c) => {
    const verifiedRunId = c.req.param("verifiedRunId");
    const submissionId = c.req.param("submissionId");
    return adminMutation(c, {
      schema: adminVerifiedRunConflictResolutionRequestSchema,
      before: () => !isUuid(verifiedRunId)
        ? errorResponse(c, 422, "INVALID_VERIFIED_RUN_ID", "The verified run ID is invalid")
        : !isUuid(submissionId)
          ? errorResponse(c, 422, "INVALID_SUBMISSION_ID", "The submission ID is invalid")
          : undefined,
      action: (input, auth, key) => services(c.env).resolveAdminVerifiedRunConflict({ ...input, verifiedRunId, submissionId }, auth, key),
      errors: {
        ...errorGroup(404, "The verified run does not exist", "VERIFIED_RUN_NOT_FOUND"),
        ...errorGroup(404, "The Verified Run conflict does not exist", "VERIFIED_RUN_CONFLICT_NOT_FOUND"),
      },
    });
  });

  app.post("/v1/admin/verified-runs/:verifiedRunId/corrections", async (c) => {
    const verifiedRunId = c.req.param("verifiedRunId");
    return adminMutation(c, {
      schema: adminVerifiedRunCorrectionRequestSchema,
      before: () => isUuid(verifiedRunId)
        ? undefined
        : errorResponse(c, 422, "INVALID_VERIFIED_RUN_ID", "The verified run ID is invalid"),
      action: (input, auth, key) => services(c.env).correctAdminVerifiedRun({ ...input, verifiedRunId }, auth, key),
      errors: {
        ...errorGroup(404, "The verified run does not exist", "VERIFIED_RUN_NOT_FOUND"),
        ...errorGroup(409, "The verified run changed or conflicts with another active match code", "VERIFIED_RUN_MATCH_CODE_CONFLICT", "VERIFIED_RUN_CORRECTION_CONFLICT"),
        ...errorGroup(422, "The corrected gameplay facts are invalid", "VERIFIED_RUN_REVISION_MAP_MISMATCH", "VERIFIED_RUN_MAP_VARIANT_INVALID", "VERIFIED_RUN_COMPLETION_DURATION_INVALID", "VERIFIED_RUN_DIFFICULTY_INVALID", "VERIFIED_RUN_SETTLEMENT_VALUE_INVALID", "VERIFIED_RUN_MAP_FACTOR_INVALID", "VERIFIED_RUN_EVENT_COUNTER_INVALID", "MATCH_CODE_INVALID"),
      },
    });
  });
};
