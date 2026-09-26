export type PublicCatalogName = "maps" | "mapChallenges" | "achievements" | "events";

export const usePublicCatalog = <T>(name: PublicCatalogName) =>
  $fetch<T>(`/api/public-catalog/${name}`, { retry: 0, timeout: 8_000 });
