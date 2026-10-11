import type { CurrentPlayerTitlesResponse, OwnedTitle, PlayerEquippedTitlesResponse } from "@owbastion/contracts";

export type { OwnedTitle } from "~/types/title";

export function usePlayerTitles() {
  const items = useState<OwnedTitle[]>("player-titles", () => []);
  const allTitles = useState("player-all-titles", () => false);
  const api = usePortalApi();
  const refresh = async () => { const response = await api<CurrentPlayerTitlesResponse>("/v1/me/titles"); items.value = response.items; allTitles.value = response.allTitles; return items.value; };
  const replaceEquipped = async (grantIds: string[]) => {
    const result = await api<PlayerEquippedTitlesResponse>("/v1/me/titles/equipped", { method: "PUT", body: { grantIds }, headers: { "Idempotency-Key": crypto.randomUUID() } });
    const equipped = new Set(result.grantIds);
    items.value = items.value.map((title) => ({ ...title, equipped: equipped.has(title.grantId) }));
    return result.grantIds;
  };
  return { items, allTitles, refresh, replaceEquipped };
}
