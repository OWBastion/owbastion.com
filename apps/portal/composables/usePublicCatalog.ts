export type PublicCatalogName = "maps" | "mapChallenges" | "achievements" | "events" | "activeChallenges";

export const usePublicCatalog = <T>(name: PublicCatalogName) =>
  $fetch<T>(`/api/public-catalog/${name}`, { retry: 0, timeout: 8_000 });
