import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useAdminAsyncData } from "../../composables/useAdminAsyncData";

describe("admin page async data", () => {
  it("shows the in-tab result immediately and revalidates on remount", async () => {
    let load = vi.fn(async () => "first result");
    const Page = defineComponent({
      setup() {
        const displayed = ref("");
        useAdminAsyncData("reentry-test", () => load(), {
          onData: (value) => { displayed.value = value; },
        });
        return () => h("p", displayed.value);
      },
    });

    const firstPage = await mountSuspended(Page);
    await flushPromises();
    expect(firstPage.text()).toBe("first result");
    expect(load).toHaveBeenCalledTimes(1);
    firstPage.unmount();

    let resolveRefresh!: (value: string) => void;
    load = vi.fn(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    const returningPage = await mountSuspended(Page);
    expect(returningPage.text()).toBe("first result");
    expect(load).toHaveBeenCalledTimes(1);

    resolveRefresh("revalidated result");
    await flushPromises();
    expect(returningPage.text()).toBe("revalidated result");
    returningPage.unmount();
  });

  it("restores the cached result when a mounted page returns to a previous key", async () => {
    let aRequestCount = 0;
    let resolveARefresh!: (value: string) => void;
    const load = vi.fn((key: string) => {
      if (key === "a") {
        aRequestCount += 1;
        if (aRequestCount === 1) return Promise.resolve("A cached result");
        return new Promise<string>((resolve) => { resolveARefresh = resolve; });
      }
      return Promise.resolve("B cached result");
    });
    const selectedKey = ref("a");
    const Page = defineComponent({
      setup() {
        const displayed = ref("");
        useAdminAsyncData("key-switch-test", () => load(selectedKey.value), {
          cacheKey: selectedKey,
          onData: (value) => { displayed.value = value; },
        });
        return () => h("div", [
          h("button", { id: "select-a", onClick: () => { selectedKey.value = "a"; } }, "A"),
          h("button", { id: "select-b", onClick: () => { selectedKey.value = "b"; } }, "B"),
          h("p", displayed.value),
        ]);
      },
    });

    const wrapper = await mountSuspended(Page);
    await flushPromises();
    expect(wrapper.text()).toContain("A cached result");

    await wrapper.get("#select-b").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("B cached result");

    await wrapper.get("#select-a").trigger("click");
    await nextTick();
    expect(wrapper.text()).toContain("A cached result");
    expect(load).toHaveBeenCalledTimes(3);

    resolveARefresh("A revalidated result");
    await flushPromises();
    expect(wrapper.text()).toContain("A revalidated result");
    wrapper.unmount();
  });

  it("still fetches a fresh key after the previous load failed", async () => {
    let attempts = 0;
    const load = vi.fn((key: string) => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error("network down"));
      return Promise.resolve(key === "a" ? "A recovered result" : "B result");
    });
    const selectedKey = ref("a");
    const Page = defineComponent({
      setup() {
        const displayed = ref("");
        const failed = ref(false);
        useAdminAsyncData("failed-load-test", () => load(selectedKey.value), {
          cacheKey: selectedKey,
          onData: (value) => { displayed.value = value; failed.value = false; },
          onError: () => { failed.value = true; },
        });
        return () => h("div", [
          h("button", { id: "select-b", onClick: () => { selectedKey.value = "b"; } }, "B"),
          h("p", displayed.value || (failed.value ? "load failed" : "empty")),
        ]);
      },
    });

    const wrapper = await mountSuspended(Page);
    await flushPromises();
    expect(wrapper.text()).toContain("load failed");
    expect(load).toHaveBeenCalledTimes(1);

    await wrapper.get("#select-b").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("B result");
    expect(load).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it("does not cache a response that resolves after its key moved on", async () => {
    const selectedKey = ref("a");
    const received: string[] = [];
    let bFetches = 0;
    const load = vi.fn(async (key: string) => {
      if (key !== "b") return `${key} result`;
      bFetches += 1;
      // The review list's empty-page auto-decrement moves the key on before this resolves.
      if (bFetches === 1) selectedKey.value = "c";
      return bFetches === 1 ? "stale b result" : "fresh b result";
    });
    const Page = defineComponent({
      setup() {
        const displayed = ref("");
        useAdminAsyncData("stale-key-test", () => load(selectedKey.value), {
          cacheKey: selectedKey,
          onData: (value) => { received.push(value); displayed.value = value; },
        });
        return () => h("div", [
          h("button", { id: "select-b", onClick: () => { selectedKey.value = "b"; } }, "B"),
          h("p", displayed.value),
        ]);
      },
    });

    const wrapper = await mountSuspended(Page);
    await flushPromises();
    expect(received).toEqual(["a result"]);

    await wrapper.get("#select-b").trigger("click");
    await flushPromises();
    expect(received).not.toContain("stale b result");
    expect(wrapper.text()).toContain("c result");

    await wrapper.get("#select-b").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("fresh b result");
    expect(received).not.toContain("stale b result");
    wrapper.unmount();
  });
});
