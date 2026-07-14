import { describe, expect, it, vi } from "vitest";
import { confirmPortalSession } from "./confirmPortalSession";

describe("confirmPortalSession", () => {
  it("succeeds as soon as the browser session is available", async () => {
    const refresh = vi.fn().mockResolvedValue({ player: "ready" });

    await expect(confirmPortalSession(refresh)).resolves.toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unavailable session", async () => {
    const refresh = vi.fn().mockResolvedValue(null);

    await expect(confirmPortalSession(refresh)).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("retries a transient request failure", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ player: "ready" });
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(confirmPortalSession(refresh, { wait })).resolves.toBe(true);
    expect(wait).toHaveBeenCalledWith(750);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops after the configured number of failures", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("network"));
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(confirmPortalSession(refresh, { attempts: 2, wait })).resolves.toBe(false);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
