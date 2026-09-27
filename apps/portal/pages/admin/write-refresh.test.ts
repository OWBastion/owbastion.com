import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useAdminAsyncData } from "../../composables/useAdminAsyncData";

const refreshAsyncData = vi.fn<() => Promise<void>>();
const reportedErrors = vi.fn();

mockNuxtImport("useAsyncData", () => () => ({
  refresh: refreshAsyncData,
  pending: ref(false),
}));

describe("admin write revalidation", () => {
  it("keeps a committed write successful when revalidation rejects", async () => {
    refreshAsyncData.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("GET failed"));

    const Page = defineComponent({
      setup() {
        const outcome = ref("");
        const adminData = useAdminAsyncData("write-refresh-test", async () => "unused", {
          onError: reportedErrors,
        });
        const save = async () => {
          outcome.value = "Write committed";
          await adminData.refresh();
        };
        return () => h("div", [
          h("button", { id: "save", onClick: save }, "Save"),
          h("p", outcome.value),
        ]);
      },
    });

    const wrapper = await mountSuspended(Page);
    await flushPromises();
    await wrapper.get("#save").trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Write committed");
    expect(reportedErrors).toHaveBeenCalledWith(expect.objectContaining({ message: "GET failed" }));
    expect(refreshAsyncData).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });
});
