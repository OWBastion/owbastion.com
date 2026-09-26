import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminApi } from "./useAdminApi";

describe("useAdminApi", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("$fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  it("routes proxy-relative admin API paths through the portal proxy", async () => {
    const api = useAdminApi();
    await api("/v1/releases/overview");
    expect($fetch).toHaveBeenCalledWith("/api/admin/v1/releases/overview", expect.objectContaining({ cache: "no-store", credentials: "include", retry: 0, timeout: 8_000 }));
  });

  it("rejects paths that repeat the upstream admin prefix", async () => {
    const api = useAdminApi();
    await expect(api("/v1/admin/releases/overview")).rejects.toThrow("ADMIN_API_PATH_INCLUDES_ADMIN_PREFIX");
    expect($fetch).not.toHaveBeenCalled();
  });
});
