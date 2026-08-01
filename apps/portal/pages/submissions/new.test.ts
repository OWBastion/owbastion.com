import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it, vi } from "vitest";
import NewSubmissionPage from "./new.vue";

const portalApi = vi.fn(async (path: string) => {
  if (path === "/v1/me") {
    return { playerId: "1001", playerName: "测试玩家" };
  }
  return {};
});

mockNuxtImport("usePortalApi", () => () => portalApi);

describe("new submission page privacy statement", () => {
  it("renders a restrained screenshot privacy notice", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/submissions/new",
    });

    const text = wrapper.text();
    expect(text).toContain("截图仅用于核对与改进识别服务，你的隐私会得到严格保护");
    expect(text).toContain("截图将用于改进识别服务，不会用于其他用途");
    expect(text).toContain("识别处理在独立环境完成，不经过任何第三方");
    expect(text).toContain("数据不会对外公开，识别服务仅用于本项目");
  });

  it("does not use internal model-training or OCR wording on the player page", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/submissions/new",
    });

    const text = wrapper.text();
    expect(text).not.toContain("模型训练");
    expect(text).not.toContain("OCR");
  });
});
