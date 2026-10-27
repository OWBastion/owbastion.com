import type { CurrentPlayerTitlesResponse, OwnedTitle, PlayerEquippedTitlesResponse, PlayerMapTitleWearResponse } from "@owbastion/contracts";

export type { OwnedTitle } from "~/types/title";

export function usePlayerTitles() {
  const items = useState<OwnedTitle[]>("player-titles", () => []);
  const allTitles = useState("player-all-titles", () => false);
  const wearMapTitles = useState("player-wear-map-titles", () => true);
  const api = usePortalApi();
  const refresh = async () => { const response = await api<CurrentPlayerTitlesResponse>("/v1/me/titles"); items.value = response.items; allTitles.value = response.allTitles; return items.value; };
  const refreshMapTitleWear = async () => { wearMapTitles.value = (await api<PlayerMapTitleWearResponse>("/v1/me/titles/map-wear")).wearMapTitles; };
  const replaceEquipped = async (grantIds: string[]) => {
    const result = await api<PlayerEquippedTitlesResponse>("/v1/me/titles/equipped", { method: "PUT", body: { grantIds }, headers: { "Idempotency-Key": crypto.randomUUID() } });
    const equipped = new Set(result.grantIds);
    items.value = items.value.map((title) => ({ ...title, equipped: equipped.has(title.grantId) }));
    return result.grantIds;
  };
  const updateMapTitleWear = async (wear: boolean) => {
    const result = await api<PlayerMapTitleWearResponse>("/v1/me/titles/map-wear", { method: "PUT", body: { wearMapTitles: wear }, headers: { "Idempotency-Key": crypto.randomUUID() } });
    wearMapTitles.value = result.wearMapTitles;
  };
  return { items, allTitles, wearMapTitles, refresh, refreshMapTitleWear, replaceEquipped, updateMapTitleWear };
}
