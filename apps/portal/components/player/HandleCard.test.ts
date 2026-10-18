import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import HandleCard from "./HandleCard.vue";

const idle = { contractVersion: "1" as const, handle: null, pending: null, rejected: null };
const portalApi = vi.fn(async (path: string, options?: { method?: string; body?: { handle: string } }) => {
  if (options?.method === "PUT") return { ...idle, pending: { requestId: "00000000-0000-4000-8000-000000000001", handle: options.body!.handle, requestedAt: 1 } };
  return idle;
});
mockNuxtImport("usePortalApi", () => () => portalApi);

const stubs = { UCard: { template: "<div><slot /></div>" } };

describe("player handle card", () => {
  it("requests a handle with an idempotency key and shows the pending review state", async () => {
    portalApi.mockClear();
    const wrapper = await mountSuspended(HandleCard, { props: { publicProfile: true }, global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("未设置");

    await wrapper.get("input").setValue("堡主一号");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(portalApi).toHaveBeenCalledWith("/v1/me/handle", expect.objectContaining({
      method: "PUT",
      headers: expect.objectContaining({ "Idempotency-Key": expect.any(String) }),
      body: { contractVersion: "1", handle: "堡主一号" },
    }));
    expect(wrapper.text()).toContain("堡主一号 · 审核中");
  });
});
