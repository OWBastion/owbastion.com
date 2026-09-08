import type { OwnedTitle } from "~/types/title";

export type { OwnedTitle } from "~/types/title";

export function usePlayerTitles() {
  const items = useState<OwnedTitle[]>("player-titles", () => []);
  const api = usePortalApi();
  const refresh = async () => { items.value = (await api<{ items: OwnedTitle[] }>("/v1/me/titles")).items; return items.value; };
  const replaceEquipped = async (grantIds: string[]) => {
    const result = await api<{ grantIds: string[] }>("/v1/me/titles/equipped", { method: "PUT", body: { grantIds }, headers: { "Idempotency-Key": crypto.randomUUID() } });
    const equipped = new Set(result.grantIds);
    items.value = items.value.map((title) => ({ ...title, equipped: equipped.has(title.grantId) }));
    return result.grantIds;
  };
  return { items, refresh, replaceEquipped };
}
