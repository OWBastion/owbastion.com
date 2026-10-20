import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { clearNuxtData } from "#app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SubmissionDetailPage from "./[submissionId].vue";

const api = vi.fn();
mockNuxtImport("usePortalApi", () => () => api);
mockNuxtImport("useRoute", () => () => ({ params: { submissionId: "sub-1" }, query: {} }));

const detail = (overrides: Record<string, unknown> = {}) => ({
  submissionId: "sub-1",
  status: "processing",
  mapName: "Map",
  manualReviewEligible: false,
  resubmissionRequired: false,
  evidenceUrl: null,
  ...overrides,
});
const detailReads = () => api.mock.calls.filter(([path, options]) => String(path).endsWith("/me/submissions/sub-1") && !options).length;
const mountPage = async () => {
  const wrapper = await mountSuspended(SubmissionDetailPage);
  await vi.advanceTimersByTimeAsync(0);
  return wrapper;
};
const buttonNamed = (wrapper: Awaited<ReturnType<typeof mountPage>>, name: RegExp) =>
  wrapper.findAll("button, a").find((element) => name.test(element.text() || element.attributes("aria-label") || ""));

beforeEach(() => {
  clearNuxtData();
  api.mockReset();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => vi.useRealTimers());

describe("submission detail", () => {
  it("follows a processing submission until it settles, then stops asking", async () => {
    api.mockResolvedValueOnce(detail()).mockResolvedValueOnce(detail()).mockResolvedValue(detail({ status: "completed" }));
    await mountPage();

    await vi.advanceTimersByTimeAsync(60_000);
    const settledReads = detailReads();
    expect(settledReads).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(detailReads()).toBe(settledReads);
  });

  it("gives up polling a submission that never settles and asks the player to reload", async () => {
    api.mockResolvedValue(detail());
    const wrapper = await mountPage();

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    const reads = detailReads();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(detailReads()).toBe(reads);

    expect(buttonNamed(wrapper, /刷新/)).toBeUndefined();
    expect(wrapper.text()).toContain("请稍后刷新页面");
  });

  it("shows the submission overview and, when a new screenshot is needed, resubmission tips", async () => {
    api.mockResolvedValue(detail({ status: "rejected", resubmissionRequired: true }));
    const wrapper = await mountPage();
    expect(wrapper.find('[aria-label="提交概览"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="重新提交建议"]').exists()).toBe(true);
  });

  it("omits resubmission tips when no new screenshot is needed", async () => {
    api.mockResolvedValue(detail({ status: "completed" }));
    expect((await mountPage()).find('[aria-label="重新提交建议"]').exists()).toBe(false);
  });

  it("does not offer manual review for an ineligible submission", async () => {
    api.mockResolvedValue(detail({ status: "rejected", manualReviewEligible: false }));
    expect(buttonNamed(await mountPage(), /人工/)).toBeUndefined();
  });

  it("offers manual review when the server says the submission is eligible", async () => {
    api.mockResolvedValue(detail({ status: "rejected", manualReviewEligible: true }));
    expect(buttonNamed(await mountPage(), /人工/)).toBeDefined();
  });

  it("requests manual review once and keeps the detail when the request fails, so it can be retried", async () => {
    const eligible = detail({ status: "rejected", manualReviewEligible: true, reason: "reason-from-server" });
    api.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (options?.method === "POST") throw Object.assign(new Error("down"), { statusCode: 503 });
      return eligible;
    });
    const wrapper = await mountPage();

    await buttonNamed(wrapper, /人工/)!.trigger("click");
    await vi.advanceTimersByTimeAsync(0);

    const posts = api.mock.calls.filter(([, options]) => options?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0]![0]).toBe("/v1/player/submissions/sub-1/manual-review");
    expect(wrapper.text()).toContain("reason-from-server");
    expect(buttonNamed(wrapper, /人工/)).toBeDefined();
  });

  it("shows the rejection reason the server provided", async () => {
    api.mockResolvedValue(detail({ status: "rejected", reason: "reason-from-server" }));
    expect((await mountPage()).text()).toContain("reason-from-server");
  });
});
