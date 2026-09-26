const catalogPaths = {
  maps: "/v1/maps",
  mapChallenges: "/v1/challenges?family=map",
  achievements: "/v1/public/achievements",
  events: "/v1/events",
} as const;

export type PublicCatalogName = keyof typeof catalogPaths;

export const getPublicCatalog = cachedFunction(
  async (name: PublicCatalogName) => {
    const config = useRuntimeConfig();
    const response = await fetch(new URL(catalogPaths[name], config.public.apiBaseUrl), {
      headers: { accept: "application/json", "user-agent": "OWBastion-Portal/1.0" },
    });
    const payload = await response.json().catch(() => null) as { error?: { code?: string; message?: string; requestId?: string } } | null;

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: payload?.error?.message ?? "无法读取公开目录，请稍后重试。",
        data: payload,
      });
    }

    return payload;
  },
  { name: "public-catalog", maxAge: 300 },
);

export { catalogPaths };
