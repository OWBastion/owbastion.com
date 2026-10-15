import { isUuid, type AdminRouteDependencies, type ApiApp } from "./route-contract";

type LeaderboardDependencies = Pick<AdminRouteDependencies, "services" | "errorResponse"> & {
  allowPortal: (context: any) => void;
  requirePortalPlayer: (context: any) => Promise<{ error?: Response; sessionToken?: string }>;
  logServiceOperation: (context: any, operation: string, action: () => Promise<unknown>) => Promise<unknown>;
};

const seasonQuery = (board: string, value: string | undefined) => {
  const seasonId = value?.trim() || undefined;
  return !seasonId || (board === "mastery" && isUuid(seasonId)) ? { seasonId } : null;
};

const pageNumber = (value: string | undefined, fallback: number) => Math.max(1, Number(value ?? fallback) || fallback);

export const registerLeaderboardRoutes = (app: ApiApp, dependencies: LeaderboardDependencies) => {
  const { services, allowPortal, errorResponse, requirePortalPlayer, logServiceOperation } = dependencies;

  app.get("/v1/public/leaderboard", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const board = c.req.query("board");
    const mapId = c.req.query("mapId")?.trim() || undefined;
    if (board !== "mastery" && board !== "achievement") return errorResponse(c, 422, "INVALID_REQUEST", "The leaderboard board is invalid");
    if (mapId && board !== "mastery") return errorResponse(c, 422, "INVALID_REQUEST", "Only the mastery board accepts a map scope");
    const season = seasonQuery(board, c.req.query("seasonId"));
    if (!season) return errorResponse(c, 422, "INVALID_REQUEST", "Only the mastery board accepts a valid season scope");
    const page = pageNumber(c.req.query("page"), 1);
    const pageSize = Math.min(50, pageNumber(c.req.query("pageSize"), 20));
    try {
      const leaderboard = await logServiceOperation(c, "leaderboard_page", () => services(c.env).getPublicLeaderboard({ board, mapId, ...season, page, pageSize }));
      return leaderboard ? c.json(leaderboard) : errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
    } catch (error) {
      if (error instanceof Error && error.message === "SEASON_NOT_FOUND") return errorResponse(c, 404, "SEASON_NOT_FOUND", "The season does not exist");
      throw error;
    }
  });

  app.get("/v1/public/seasons", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    return c.json(await logServiceOperation(c, "public_seasons", () => services(c.env).listPublicSeasons()));
  });

  app.get("/v1/public/leaderboard/players/:playerKey", async (c) => {
    allowPortal(c);
    c.header("Cache-Control", "private, no-store");
    const summary = await logServiceOperation(c, "leaderboard_player_summary", () => services(c.env).getPublicLeaderboardPlayer({ playerKey: c.req.param("playerKey") }));
    return summary ? c.json(summary) : errorResponse(c, 404, "PLAYER_NOT_FOUND", "The player does not exist");
  });

  app.get("/v1/me/leaderboard", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const board = c.req.query("board");
    const mapId = c.req.query("mapId")?.trim() || undefined;
    if (board !== "mastery" && board !== "achievement") return errorResponse(c, 422, "INVALID_REQUEST", "The leaderboard board is invalid");
    if (mapId && board !== "mastery") return errorResponse(c, 422, "INVALID_REQUEST", "Only the mastery board accepts a map scope");
    const season = seasonQuery(board, c.req.query("seasonId"));
    if (!season) return errorResponse(c, 422, "INVALID_REQUEST", "Only the mastery board accepts a valid season scope");
    try {
      const rank = await logServiceOperation(c, "leaderboard_own_rank", () => services(c.env).getCurrentPlayerLeaderboardRank({ sessionToken: access.sessionToken!, board, mapId, ...season }));
      return rank ? c.json(rank) : errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    } catch (error) {
      if (error instanceof Error && error.message === "MAP_NOT_FOUND") return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
      if (error instanceof Error && error.message === "SEASON_NOT_FOUND") return errorResponse(c, 404, "SEASON_NOT_FOUND", "The season does not exist");
      throw error;
    }
  });
};
