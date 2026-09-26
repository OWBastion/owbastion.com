import { describe, expect, it, vi } from "vitest";
import { useAdminApi } from "../../composables/useAdminApi";
import { usePortalApi } from "../../composables/usePortalApi";
import { installApiTestFetch } from "../utils/api-test-fetch";

describe("Portal API clients", () => {
  it("routes maintainer requests through the admin browser proxy", async () => {
    const admin = vi.fn().mockResolvedValue({ ok: true });
    const fetch = installApiTestFetch({ admin });

    await useAdminApi()("/v1/player-accounts?page=2", {
      method: "GET",
      headers: { "x-test": "admin" },
    });

    expect(fetch).toHaveBeenCalledWith("/api/admin/v1/player-accounts?page=2", expect.objectContaining({
      method: "GET",
      credentials: "include",
      retry: 0,
      timeout: 8_000,
      cache: "no-store",
      headers: expect.any(Headers),
    }));
    expect(admin).toHaveBeenCalledWith("/v1/player-accounts?page=2", {
      method: "GET",
      headers: { "x-test": "admin" },
    });
  });

  it("routes player requests through the player browser proxy", async () => {
    const portal = vi.fn().mockResolvedValue({ ok: true });
    const fetch = installApiTestFetch({ portal });

    await usePortalApi()("/v1/me/titles/equipped", {
      method: "PUT",
      body: { grantIds: ["grant-1"] },
    });

    expect(fetch).toHaveBeenCalledWith("/api/portal/v1/me/titles/equipped", expect.objectContaining({
      method: "PUT",
      body: { grantIds: ["grant-1"] },
      credentials: "include",
      retry: 0,
      timeout: 8_000,
      headers: expect.any(Headers),
    }));
    expect(portal).toHaveBeenCalledWith("/v1/me/titles/equipped", {
      method: "PUT",
      body: { grantIds: ["grant-1"] },
    });
  });
});
