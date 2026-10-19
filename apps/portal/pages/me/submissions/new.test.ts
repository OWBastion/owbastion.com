import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewSubmissionPage from "./new.vue";

const submit = vi.fn();
const navigate = vi.hoisted(() => vi.fn());
const upload = { loading: ref(false), phaseLabel: ref(""), error: ref(""), submit };
mockNuxtImport("useSubmissionUpload", () => () => upload);
mockNuxtImport("navigateTo", () => navigate);

const pasteFile = (file: File) => {
  const event = new Event("paste") as Event & { clipboardData: unknown };
  event.clipboardData = { files: [file] };
  document.dispatchEvent(event);
};
const image = (type: string, size = 1024) => new File([new Uint8Array(size)], "shot", { type });
const submitButton = (wrapper: Awaited<ReturnType<typeof mountSuspended>>) => wrapper.find("button[type=submit]");

beforeEach(() => {
  URL.createObjectURL = () => "blob:preview";
  submit.mockReset();
  navigate.mockReset();
  upload.error.value = "";
});

describe("new submission", () => {
  it("uploads a pasted screenshot and opens the resulting submission", async () => {
    submit.mockResolvedValue({ submissionId: "sub/1", status: "processing" });
    const wrapper = await mountSuspended(NewSubmissionPage, { attachTo: document.body });
    const file = image("image/png");

    pasteFile(file);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(submit).toHaveBeenCalledWith(file);
    expect(navigate).toHaveBeenCalledWith("/me/submissions/sub%2F1");
    wrapper.unmount();
  });

  it("refuses a file over 10MB before anything is uploaded", async () => {
    const file = image("image/png", 10 * 1024 * 1024 + 1);
    const wrapper = await mountSuspended(NewSubmissionPage, { attachTo: document.body });

    pasteFile(file);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const button = submitButton(wrapper);
    expect(!button.exists() || button.attributes("disabled") !== undefined).toBe(true);
    expect(submit).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("stays on the page when the upload fails, so the player can retry", async () => {
    submit.mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ submissionId: "s2", status: "processing" });
    const wrapper = await mountSuspended(NewSubmissionPage, { attachTo: document.body });

    pasteFile(image("image/png"));
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(navigate).not.toHaveBeenCalled();

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(navigate).toHaveBeenCalledWith("/me/submissions/s2");
    wrapper.unmount();
  });
});
