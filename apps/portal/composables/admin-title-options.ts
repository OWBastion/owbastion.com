import type { Map as CatalogMap, Title } from "@owbastion/contracts";

type AdminApi = <T>(path: string) => Promise<T>;

export type AdminTitleOption = Pick<Title, "titleKey" | "label" | "category" | "availability" | "scope" | "mapId" | "slot"> & {
  mapName?: string;
  value: string;
};

export async function loadAdminTitleOptions(api: AdminApi): Promise<AdminTitleOption[]> {
  const { items: maps } = await api<{ items: Array<Pick<CatalogMap, "mapId" | "mapName">> }>("/v1/maps");
  const mapNames = new Map(maps.map(({ mapId, mapName }) => [mapId, mapName]));
  const responses = await Promise.all([
    api<{ items: Title[] }>("/v1/titles"),
    ...maps.map(({ mapId }) => api<{ items: Title[] }>(`/v1/titles?mapId=${encodeURIComponent(mapId)}`)),
  ]);
  const options = responses.flatMap(({ items }) => items).map((title) => ({
    ...title,
    mapName: title.mapId ? mapNames.get(title.mapId) : undefined,
    value: `${title.titleKey}:${title.mapId ?? ""}`,
  }));
  return [...new Map(options.map((title) => [title.value, title])).values()];
}
