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
  it("renders verified screenshot privacy facts", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/submissions/new",
    });

    const text = wrapper.text();
    expect(text).toContain("截图用途");
    expect(text).toContain("截图仅用于挑战核对与截图识别");
    expect(text).toContain("提交截图不会对外公开");
    expect(text).toContain("原始识别结果仅平台内部使用");
    expect(text).not.toContain("默认 F9");
    expect(text).toContain("优先使用游戏内截图，避免裁剪或二次压缩。");
  });

  it("does not use internal model-training or OCR wording on the player page", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/submissions/new",
    });

    const text = wrapper.text();
    expect(text).not.toContain("模型训练");
    expect(text).not.toContain("OCR");
    expect(text).not.toContain("第三方");
  });
});
