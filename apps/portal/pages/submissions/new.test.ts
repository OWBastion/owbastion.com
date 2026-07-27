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
  it("renders detailed OCR model training and privacy protection notice", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/submissions/new",
    });

    const text = wrapper.text();
    expect(text).toContain("截图仅用于挑战核对与模型训练，你的隐私会得到严格保护");
    expect(text).toContain("截图将用于模型训练，以提升该项目的识别能力");
    expect(text).toContain("模型训练在非云端且不经任何第三方介入的情况下完成");
    expect(text).toContain("训练数据不会对外公开访问，训练模型仅用于该项目的截图识别");
  });
});
