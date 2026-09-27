import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
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
});
