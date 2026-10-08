import { mockNuxtImport, mountSuspended } from "@nuxt/test-utils/runtime";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewSubmissionPage from "./new.vue";

const portalApi = vi.fn(async (path: string) => {
  if (path === "/v1/me") {
    return { playerId: "1001", playerName: "测试玩家" };
  }
  return {};
});

mockNuxtImport("usePortalApi", () => () => portalApi);

describe("new submission page privacy statement", () => {
  beforeEach(() => { URL.createObjectURL = vi.fn(() => "blob:preview"); });

  it("renders verified screenshot privacy facts", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/me/submissions/new",
    });

    const text = wrapper.text();
    expect(text).toContain("提交完成截图");
    expect(text).toContain("截图用途");
    expect(text).toContain("截图用于挑战核对、截图识别，以及改进截图识别模型");
    expect(text).toContain("提交截图不会对外公开");
    expect(text).toContain("原始识别结果仅平台内部使用");
    expect(text).not.toContain("默认 F9");
    expect(text).toContain("优先使用游戏内截图，避免裁剪或二次压缩。");
    expect(text).not.toContain("挑战提交");
    expect(text).not.toContain("上传一张完整截图");
    expect(text).not.toContain("请确保截图清晰");
  });

  it("does not use internal model-training or OCR wording on the player page", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, {
      route: "/me/submissions/new",
    });

    const text = wrapper.text();
    expect(text).not.toContain("模型训练");
    expect(text).not.toContain("OCR");
    expect(text).not.toContain("第三方");
  });

  it("accepts a pasted image and enables upload", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, { route: "/me/submissions/new" });
    const submit = () => wrapper.find("button[type=submit]");
    expect(submit().attributes("disabled")).toBeDefined();

    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { files: [new File(["x"], "image.png", { type: "image/png" })] } });
    document.dispatchEvent(event);
    await nextTick();

    expect(submit().attributes("disabled")).toBeUndefined();
  });

  it("rejects an unsupported pasted file before upload", async () => {
    const wrapper = await mountSuspended(NewSubmissionPage, { route: "/me/submissions/new" });
    const event = new Event("paste") as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", { value: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    document.dispatchEvent(event);
    await nextTick();

    expect(wrapper.text()).toContain("仅支持 JPEG、PNG 或 WebP 格式。");
    expect(wrapper.find("button[type=submit]").attributes("disabled")).toBeDefined();
  });
});
