import { useIntervalFn, useNow } from "@vueuse/core";
import type { ActiveChallenge, ActiveChallengeListResponse } from "@owbastion/contracts";

// Featured timed challenges that are open now. A failed read shows nothing: this list only guides players.
export const useActiveChallenges = () => {
  const { data } = useAsyncData("active-challenges", async () => {
    try { return (await usePublicCatalog<ActiveChallengeListResponse>("activeChallenges")).items; }
    catch { return [] as ActiveChallenge[]; }
  }, { lazy: true, default: () => [] as ActiveChallenge[] });
  const { player } = useCurrentPlayer();
  const { items: titles, refresh: refreshTitles } = usePlayerTitles();
  if (import.meta.client) watch(player, (current) => { if (current) refreshTitles().catch(() => undefined); }, { immediate: true });

  const now = useNow({ scheduler: (update) => useIntervalFn(update, 60_000) });
  const owned = (item: ActiveChallenge) => {
    const own = titles.value.filter((title) => title.titleKey === item.titleKey);
    if (item.kind === "pioneer") return own.some((title) => title.mapId === item.mapId);
    return item.mapIds.length ? item.mapIds.every((mapId) => own.some((title) => title.mapId === mapId)) : own.length > 0;
  };
  // The API response is cached for minutes, so the client also drops items whose end time has passed.
  const items = computed(() => data.value.filter((item) => item.endsAt > now.value.getTime() && !owned(item)));
  const forMap = (mapId: string) => items.value.find((item) => item.kind === "pioneer" && item.mapId === mapId) ?? null;
  return { items, forMap, now };
};
