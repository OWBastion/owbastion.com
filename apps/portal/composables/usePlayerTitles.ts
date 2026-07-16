import type { OwnedTitle } from "~/types/title";

export type { OwnedTitle } from "~/types/title";

export function usePlayerTitles() {
  const items = useState<OwnedTitle[]>("player-titles", () => []);
  const api = usePortalApi();
  const refresh = async () => { items.value = (await api<{ items: OwnedTitle[] }>("/v1/me/titles")).items; return items.value; };
  return { items, refresh };
}
