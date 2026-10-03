import { mountSuspended } from "@nuxt/test-utils/runtime";
import { afterEach, describe, expect, it, vi } from "vitest";
import EvidenceViewer from "./EvidenceViewer.vue";

// happy-dom has no layout: give the viewport a size and the screenshot a natural size so fit/zoom are computable.
const sizeViewport = (width: number, height: number) => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
};
const loadImage = async (wrapper: Awaited<ReturnType<typeof mountSuspended<typeof EvidenceViewer>>>, width: number, height: number) => {
  const image = wrapper.get("img");
  Object.defineProperty(image.element, "naturalWidth", { configurable: true, value: width });
  Object.defineProperty(image.element, "naturalHeight", { configurable: true, value: height });
  await image.trigger("load");
};
const zoomLabel = (wrapper: { get: (selector: string) => { text: () => string } }) => wrapper.get('[aria-label="缩放比例"]').text();
const button = (wrapper: { get: (selector: string) => { trigger: (event: string) => Promise<void> } }, label: string) => wrapper.get(`button[aria-label="${label}"]`);

afterEach(() => { vi.restoreAllMocks(); });

describe("EvidenceViewer", () => {
  it("shows the screenshot with its description", async () => {
    const wrapper = await mountSuspended(EvidenceViewer, { props: { src: "https://evidence.example/a.png", alt: "玩家提交的挑战截图" } });
    expect(wrapper.get("img").attributes("src")).toBe("https://evidence.example/a.png");
    expect(wrapper.get("img").attributes("alt")).toBe("玩家提交的挑战截图");
  });

  it("fits the screenshot first, then zooms to the original size, out, and back to fit", async () => {
    sizeViewport(800, 450);
    const wrapper = await mountSuspended(EvidenceViewer, { props: { src: "a.png", alt: "截图" } });
    await loadImage(wrapper, 1600, 900);
    expect(zoomLabel(wrapper)).toBe("50%");
    await button(wrapper, "原始大小（1）").trigger("click");
    expect(zoomLabel(wrapper)).toBe("100%");
    await button(wrapper, "缩小（-）").trigger("click");
    expect(zoomLabel(wrapper)).toBe("80%");
    await button(wrapper, "适应窗口（0）").trigger("click");
    expect(zoomLabel(wrapper)).toBe("50%");
  });

  it("never zooms out past the fitted size", async () => {
    sizeViewport(800, 450);
    const wrapper = await mountSuspended(EvidenceViewer, { props: { src: "a.png", alt: "截图" } });
    await loadImage(wrapper, 1600, 900);
    await button(wrapper, "缩小（-）").trigger("click");
    expect(zoomLabel(wrapper)).toBe("50%");
  });

  it("zooms with the keyboard while the viewer has focus", async () => {
    sizeViewport(800, 450);
    const wrapper = await mountSuspended(EvidenceViewer, { props: { src: "a.png", alt: "截图" } });
    await loadImage(wrapper, 1600, 900);
    const viewer = wrapper.get('[role="group"][aria-label^="截图。"]');
    await viewer.trigger("keydown", { key: "1" });
    expect(zoomLabel(wrapper)).toBe("100%");
    await viewer.trigger("keydown", { key: "0" });
    expect(zoomLabel(wrapper)).toBe("50%");
  });

  it("toggles between fit and the original size on double click", async () => {
    sizeViewport(800, 450);
    const wrapper = await mountSuspended(EvidenceViewer, { props: { src: "a.png", alt: "截图" } });
    await loadImage(wrapper, 1600, 900);
    const viewer = wrapper.get('[role="group"][aria-label^="截图。"]');
    await viewer.trigger("dblclick");
    expect(zoomLabel(wrapper)).toBe("100%");
    await viewer.trigger("dblclick");
    expect(zoomLabel(wrapper)).toBe("50%");
  });

  it("reports a screenshot that cannot be loaded", async () => {
    const wrapper = await mountSuspended(EvidenceViewer, { props: { src: "missing.png", alt: "截图" } });
    await wrapper.get("img").trigger("error");
    expect(wrapper.emitted("error")).toHaveLength(1);
  });
});
