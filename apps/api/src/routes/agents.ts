import { hasOnlyUniqueQueryNames, parsePagination } from "../query-params";
import type { ErrorStatus, ApiApp, ServiceAccessor } from "./route-contract";

type AgentRouteDependencies = {
  services: ServiceAccessor;
  errorResponse: (c: any, status: ErrorStatus, code: string, message: string) => Response;
  publicCacheKey: (request: Request, query?: Record<string, string>) => Request;
  hasNoQuery: (request: Request) => boolean;
  logServiceOperation: <T>(c: any, operation: string, action: () => Promise<T>) => Promise<T>;
  cachePublicResponse: (c: any, options: {
    operation: string;
    cacheKey: Request;
    eligible: boolean;
    identityIndependent?: boolean;
    response: () => Promise<Response> | Response;
  }) => Promise<Response>;
  bearerTokenMatches: (authorization: string | undefined, secret: string) => boolean;
};

const agentPage = (request: Request) => parsePagination(new URL(request.url).searchParams, 100);

export const registerAgentRoutes = (app: ApiApp, dependencies: AgentRouteDependencies) => {
  const { services, errorResponse, publicCacheKey, hasNoQuery, logServiceOperation, cachePublicResponse, bearerTokenMatches } = dependencies;
  const allowAgents = (c: any) => {
    const token = c.env.BASTION_BUILD_TOKEN;
    return Boolean(token && bearerTokenMatches(c.req.header("authorization"), token));
  };
  const setAgentsCache = (c: any, includePlayerIds: boolean, cacheable: boolean) => {
    const enabled = c.env.PUBLIC_HTTP_CACHE_ENABLED !== "false";
    c.header("Cache-Control", !includePlayerIds && cacheable && enabled ? "public, max-age=300, s-maxage=300" : "private, no-store");
    c.header("Vary", "Authorization");
  };
  const hideAgentPlayerIds = <T extends { items: Array<{ playerId: string }> }>(response: T, includePlayerIds: boolean) => includePlayerIds
    ? response
    : { ...response, items: response.items.map(({ playerId: _playerId, ...item }) => item) };

  app.get("/v1/agents/events", async (c) => {
    const includePlayerIds = allowAgents(c);
    const page = agentPage(c.req.raw);
    const status = c.req.query("status");
    if (!page || (status && !["development", "implemented", "removed"].includes(status))) return errorResponse(c, 422, "INVALID_REQUEST", "The event status is invalid");
    const cacheable = !includePlayerIds && hasOnlyUniqueQueryNames(new URL(c.req.url).searchParams, ["page", "pageSize"])
      && !c.req.query("q") && !c.req.query("category") && !c.req.query("rarity") && !status;
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, {
      operation: "agents_events",
      cacheKey: publicCacheKey(c.req.raw, { page: String(page.page), pageSize: String(page.pageSize) }),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => c.json({ ...await logServiceOperation(c, "agents_list_events", () => services(c.env).listAgentEvents({ ...page, query: c.req.query("q")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined, status: status as "development" | "implemented" | "removed" | undefined })) }),
    });
  });
  app.get("/v1/agents/events/:eventId", async (c) => {
    const includePlayerIds = allowAgents(c);
    const status = c.req.query("status");
    if (status && !["development", "implemented", "removed"].includes(status)) return errorResponse(c, 422, "INVALID_REQUEST", "The event status is invalid");
    const cacheable = !includePlayerIds && hasNoQuery(c.req.raw);
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, {
      operation: "agents_event",
      cacheKey: publicCacheKey(c.req.raw),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => {
        const event = await logServiceOperation(c, "agents_get_event", () => services(c.env).getAgentEvent({ eventId: c.req.param("eventId"), status: status as "development" | "implemented" | "removed" | undefined }));
        return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist");
      },
    });
  });
  app.get("/v1/agents/maps", async (c) => {
    const includePlayerIds = allowAgents(c);
    const page = agentPage(c.req.raw);
    if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid");
    const cacheable = !includePlayerIds && hasOnlyUniqueQueryNames(new URL(c.req.url).searchParams, ["page", "pageSize"])
      && !c.req.query("q") && !c.req.query("mechanic");
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, {
      operation: "agents_maps",
      cacheKey: publicCacheKey(c.req.raw, { page: String(page.page), pageSize: String(page.pageSize) }),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => c.json(await logServiceOperation(c, "agents_list_maps", () => services(c.env).listAgentMaps({ ...page, query: c.req.query("q")?.trim() || undefined, mechanic: c.req.query("mechanic")?.trim() || undefined }))),
    });
  });
  app.get("/v1/agents/maps/:mapId", async (c) => {
    const includePlayerIds = allowAgents(c);
    const cacheable = !includePlayerIds && hasNoQuery(c.req.raw);
    setAgentsCache(c, includePlayerIds, cacheable);
    return cachePublicResponse(c, {
      operation: "agents_map",
      cacheKey: publicCacheKey(c.req.raw),
      eligible: cacheable,
      identityIndependent: true,
      response: async () => {
        const map = await logServiceOperation(c, "agents_get_map", () => services(c.env).getAgentMap({ mapId: c.req.param("mapId") }));
        return map ? c.json({ contractVersion: "1", item: map }) : errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
      },
    });
  });
  app.get("/v1/agents/achievements", async (c) => {
    allowAgents(c);
    const page = agentPage(c.req.raw);
    const status = c.req.query("status");
    if (!page || (status && status !== "active" && status !== "sunsetting")) return errorResponse(c, 422, "INVALID_REQUEST", "The request parameters are invalid");
    return c.json(await logServiceOperation(c, "agents_list_achievements", () => services(c.env).listAgentAchievements({ ...page, query: c.req.query("q")?.trim() || undefined, status: status as "active" | "sunsetting" | undefined, mapId: c.req.query("mapId")?.trim() || undefined })));
  });
  app.get("/v1/agents/achievements/:achievementId", async (c) => {
    allowAgents(c);
    const achievement = await logServiceOperation(c, "agents_get_achievement", () => services(c.env).getAgentAchievement({ challengeId: c.req.param("achievementId"), mapId: c.req.query("mapId")?.trim() || undefined, gameplayRevisionId: c.req.query("gameplayRevisionId")?.trim() || undefined }));
    return achievement ? c.json({ contractVersion: "1", item: achievement }) : errorResponse(c, 404, "ACHIEVEMENT_NOT_FOUND", "The achievement does not exist");
  });
  app.get("/v1/agents/titles", async (c) => {
    allowAgents(c);
    const page = agentPage(c.req.raw);
    const scope = c.req.query("scope");
    if (!page || (scope && scope !== "global" && scope !== "map")) return errorResponse(c, 422, "INVALID_REQUEST", "The request parameters are invalid");
    return c.json(await logServiceOperation(c, "agents_list_titles", () => services(c.env).listAgentTitles({ ...page, query: c.req.query("q")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, scope: scope as "global" | "map" | undefined, mapId: c.req.query("mapId")?.trim() || undefined })));
  });
  app.get("/v1/agents/titles/:titleKey", async (c) => {
    allowAgents(c);
    const title = await logServiceOperation(c, "agents_get_title", () => services(c.env).getAgentTitle({ titleKey: c.req.param("titleKey") }));
    return title ? c.json({ contractVersion: "1", item: title }) : errorResponse(c, 404, "TITLE_NOT_FOUND", "The title does not exist");
  });
  app.get("/v1/agents/player-title-grants", async (c) => {
    const includePlayerIds = allowAgents(c);
    const page = agentPage(c.req.raw);
    if (!page) return errorResponse(c, 422, "INVALID_REQUEST", "The pagination parameters are invalid");
    setAgentsCache(c, includePlayerIds, true);
    return c.json(hideAgentPlayerIds(await logServiceOperation(c, "agents_list_player_title_grants", () => services(c.env).listAgentPlayerTitleGrants(page)), includePlayerIds));
  });
  app.get("/v1/agents/map-title-holders", async (c) => {
    const includePlayerIds = allowAgents(c);
    const page = agentPage(c.req.raw);
    const mapId = c.req.query("mapId")?.trim();
    if (!page || !mapId) return errorResponse(c, 422, "INVALID_REQUEST", "The mapId and pagination parameters are required");
    setAgentsCache(c, includePlayerIds, true);
    if (!(await services(c.env).getAgentMap({ mapId }))) return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
    try {
      return c.json(hideAgentPlayerIds(await logServiceOperation(c, "agents_list_map_title_holders", () => services(c.env).listAgentMapTitleHolders({ ...page, mapId })), includePlayerIds));
    } catch (error) {
      const code = error instanceof Error ? error.message : "AGENT_MAP_TITLE_PROJECTION_FAILED";
      if (code === "AGENT_MAP_TITLE_PROJECTION_UNAVAILABLE") {
        c.header("Cache-Control", "private, no-store");
        return errorResponse(c, 503, code, "The map title-holder projection is temporarily unavailable");
      }
      if (code === "AGENT_MAP_NOT_FOUND") return errorResponse(c, 404, "MAP_NOT_FOUND", "The map does not exist");
      throw error;
    }
  });
  app.get("/v1/agents/search", async (c) => {
    allowAgents(c);
    const page = agentPage(c.req.raw);
    const query = c.req.query("q")?.trim();
    const kind = c.req.query("kind");
    const status = c.req.query("status");
    if (!page || !query || (kind && !["event", "map", "achievement", "title"].includes(kind)) || (status && !["development", "implemented", "removed"].includes(status))) return errorResponse(c, 422, "INVALID_REQUEST", "The search parameters are invalid");
    return c.json(await logServiceOperation(c, "agents_search", () => services(c.env).searchAgentContent({ ...page, query, kind: kind as "event" | "map" | "achievement" | "title" | undefined, status: status as "development" | "implemented" | "removed" | undefined })));
  });
};
