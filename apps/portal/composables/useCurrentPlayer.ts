import type { CurrentPlayer, PortalApiError } from "./usePortalApi";

export type CurrentPlayerAuthStatus = "unknown" | "loading" | "authenticated" | "anonymous";
type RefreshOptions = { force?: boolean };

let refreshPromise: Promise<CurrentPlayer | null> | null = null;

export function useCurrentPlayer() {
  const player = useState<CurrentPlayer | null>("current-player", () => null);
  const status = useState<CurrentPlayerAuthStatus>("current-player-auth-status", () => "unknown");
  const api = usePortalApi();

  const refresh = async ({ force = false }: RefreshOptions = {}) => {
    if (!force && status.value === "authenticated") return player.value;
    if (!import.meta.server && refreshPromise) return refreshPromise;

    const previousStatus = status.value;
    status.value = "loading";
    const request = api<CurrentPlayer>("/v1/me")
      .then((nextPlayer) => {
        player.value = nextPlayer;
        status.value = "authenticated";
        return nextPlayer;
      })
      .catch((error) => {
        if ((error as PortalApiError).statusCode === 401) {
          player.value = null;
          status.value = "anonymous";
          return null;
        }
        status.value = previousStatus === "authenticated" ? "authenticated" : "unknown";
        throw error;
      })
      .finally(() => { if (!import.meta.server) refreshPromise = null; });
    if (import.meta.server) return request;
    refreshPromise = request;
    return request;
  };

  const loaded = computed(() => status.value === "authenticated" || status.value === "anonymous");

  const logout = async () => {
    await api("/v1/auth/logout", { method: "POST" });
    player.value = null;
    status.value = "anonymous";
  };

  return { player, status, loaded, refresh, logout };
}
