import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const setup = async (api: ReturnType<typeof vi.fn>) => {
  const states = new Map<string, ReturnType<typeof ref>>();
  vi.stubGlobal("useState", (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(init()));
    return states.get(key);
  });
  vi.stubGlobal("computed", (getter: () => unknown) => ({ get value() { return getter(); } }));
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { apiBaseUrl: "http://localhost:8787" } }));
  vi.stubGlobal("$fetch", api);
  vi.stubGlobal("usePortalApi", () => api);
  vi.resetModules();
  return (await import("./useCurrentPlayer")).useCurrentPlayer;
};

describe("useCurrentPlayer", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("deduplicates concurrent session checks", async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const api = vi.fn(() => new Promise((done) => { resolve = done; }));
    const useCurrentPlayer = await setup(api);
    const first = useCurrentPlayer();
    const second = useCurrentPlayer();

    const firstRefresh = first.refresh();
    const secondRefresh = second.refresh();
    expect(api).toHaveBeenCalledTimes(1);

    resolve({ contractVersion: "1", player: { playerId: "p1", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] });
    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toHaveLength(2);
    expect(first.status.value).toBe("authenticated");
  });

  it("preserves an authenticated player on a transient refresh error", async () => {
    const player = { contractVersion: "1", player: { playerId: "p1", playerName: "Player", bindingStatus: "bound", isAdmin: false }, recentSubmissions: [] };
    const api = vi.fn().mockResolvedValueOnce(player).mockRejectedValueOnce(Object.assign(new Error("network"), { statusCode: 503 }));
    const useCurrentPlayer = await setup(api);
    const auth = useCurrentPlayer();

    await auth.refresh();
    await expect(auth.refresh({ force: true })).rejects.toThrow("network");
    expect(auth.status.value).toBe("authenticated");
    expect(auth.player.value).toEqual(player);
  });
});
