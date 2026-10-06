import type { PlayerChallengeProgress, PlayerChallengeProgressListResponse } from "~/composables/usePortalApi";

export function usePlayerChallengeProgress() {
  const items = useState<PlayerChallengeProgress[]>("player-challenge-progress", () => []);
  const api = usePortalApi();
  const refresh = async () => {
    const response = await api<PlayerChallengeProgressListResponse>("/v1/me/challenge-progress");
    items.value = response.items;
    return items.value;
  };
  return { items, refresh };
}
