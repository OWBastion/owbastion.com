import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import AdminResponsiveDialog from "./AdminResponsiveDialog.vue";

const media = vi.hoisted(() => ({ desktop: true }));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useMediaQuery: () => ({ __v_isRef: true, value: media.desktop }),
}));

const ModalStub = {
  props: ["open", "title", "description", "dismissible", "ui"],
  emits: ["update:open"],
  template: '<section data-overlay="modal"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /><button @click="$emit(\'update:open\', false)">关闭</button></section>',
};
const DrawerStub = {
  props: ["open", "title", "description", "dismissible", "direction", "ui"],
  emits: ["update:open"],
  template: '<section data-overlay="drawer"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /><button @click="$emit(\'update:open\', false)">关闭</button></section>',
};

function mountDialog() {
  const onUpdate = vi.fn();
  const wrapper = mount(AdminResponsiveDialog, {
    props: { open: true, title: "编辑群配置", description: "group-1", size: "lg", "onUpdate:open": onUpdate },
    slots: { body: "<div>表单内容</div>", footer: "<button>保存</button>" },
    global: { stubs: { UModal: ModalStub, UDrawer: DrawerStub } },
  });
  return { wrapper, onUpdate };
}

describe("AdminResponsiveDialog", () => {
  it("renders a scroll-constrained desktop modal and forwards title, slots, and close events", async () => {
    media.desktop = true;
    const { wrapper, onUpdate } = mountDialog();
    expect(wrapper.get('[data-overlay="modal"]').text()).toContain("编辑群配置");
    expect(wrapper.text()).toContain("表单内容");
    expect(wrapper.findComponent(ModalStub).props("ui").content).toContain("max-w-3xl");
    await wrapper.findAll("button").at(-1)!.trigger("click");
    expect(onUpdate).toHaveBeenCalledWith(false);
  });

  it("renders a bottom drawer below the desktop breakpoint", () => {
    media.desktop = false;
    const { wrapper } = mountDialog();
    expect(wrapper.get('[data-overlay="drawer"]').text()).toContain("group-1");
    expect(wrapper.findComponent(DrawerStub).props("direction")).toBe("bottom");
    expect(wrapper.findComponent(DrawerStub).props("ui").body).toContain("safe-area-inset-bottom");
  });
});
