import type { AdminRouteDependencies, ApiApp } from "./route-contract";

type PublicCatalogDependencies = Pick<AdminRouteDependencies, "services" | "errorResponse"> & {
  allowPortal: (context: any) => void;
  requirePortalPlayer: (context: any) => Promise<{ error?: Response }>;
  logServiceOperation: (context: any, operation: string, action: () => Promise<unknown>) => Promise<unknown>;
  cachedCatalogResponse: (context: any, options: { operation: string; query?: Record<string, string>; eligible?: boolean; response: () => Promise<Response> | Response }) => Promise<Response>;
};

export const registerPublicCatalogRoutes = (app: ApiApp, dependencies: PublicCatalogDependencies) => {
  const { services, allowPortal, errorResponse, requirePortalPlayer, logServiceOperation, cachedCatalogResponse } = dependencies;

  app.get("/v1/public/achievements", async (c) => {
    allowPortal(c);
    return cachedCatalogResponse(c, {
      operation: "catalog_public_achievements",
      response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_achievements", () => services(c.env).listChallenges({ family: "achievement" })) }),
    });
  });

  app.get("/v1/challenges", async (c) => {
    const family = c.req.query("family");
    if (family && family !== "map" && family !== "achievement") return errorResponse(c, 422, "INVALID_REQUEST", "The challenge family is invalid");
    if (family === "map") {
      allowPortal(c);
      return cachedCatalogResponse(c, {
        operation: "catalog_map_challenges",
        query: { family: "map" },
        eligible: new URL(c.req.url).searchParams.getAll("family").length === 1 && new URL(c.req.url).searchParams.size === 1,
        response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_map_challenges", () => services(c.env).listChallenges({ family: "map" })) }),
      });
    }
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_challenges", () => services(c.env).listChallenges({ family: family as "map" | "achievement" | undefined })) });
  });

  app.get("/v1/titles", async (c) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    c.header("Cache-Control", "private, no-store");
    return c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_titles", () => services(c.env).listTitles({ mapId: c.req.query("mapId") || undefined })) });
  });

  app.get("/v1/maps", async (c) => {
    allowPortal(c);
    return cachedCatalogResponse(c, {
      operation: "catalog_maps",
      response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_maps", () => services(c.env).listMaps()) }),
    });
  });

  app.get("/v1/events", async (c) => {
    allowPortal(c); const status = c.req.query("status");
    if (status && status !== "implemented" && status !== "removed") return errorResponse(c, 422, "INVALID_REQUEST", "The event status is invalid");
    return cachedCatalogResponse(c, {
      operation: "catalog_events",
      response: async () => c.json({ contractVersion: "1", items: await logServiceOperation(c, "catalog_list_events", () => services(c.env).listRandomEvents({ query: c.req.query("query")?.trim() || undefined, category: c.req.query("category")?.trim() || undefined, rarity: c.req.query("rarity")?.trim() || undefined, status: status as "implemented" | "removed" | undefined })) }),
    });
  });
  app.get("/v1/events/:eventId", async (c) => {
    allowPortal(c);
    return cachedCatalogResponse(c, {
      operation: "catalog_event",
      response: async () => {
        const event = await logServiceOperation(c, "catalog_get_event", () => services(c.env).getRandomEvent({ eventId: c.req.param("eventId") }));
        return event ? c.json({ contractVersion: "1", item: event }) : errorResponse(c, 404, "EVENT_NOT_FOUND", "The event does not exist");
      },
    });
  });
};
