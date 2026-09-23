import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import AdminResponsiveDialog from "./AdminResponsiveDialog.vue";

const media = vi.hoisted(() => ({ desktop: true }));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useMediaQuery: () => ({ __v_isRef: true, value: media.desktop }),
}));

const ModalStub = {
  name: "UModal",
  props: ["open", "title", "description", "dismissible", "ui"],
  emits: ["update:open"],
  template: '<section role="dialog" :aria-label="title"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /><button aria-label="关闭" @click="$emit(\'update:open\', false)">关闭</button></section>',
};

const DrawerStub = {
  name: "UDrawer",
  props: ["open", "title", "description", "dismissible", "ui"],
  emits: ["update:open"],
  template: '<section role="dialog" :aria-label="title"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /><button aria-label="关闭" @click="$emit(\'update:open\', false)">关闭</button></section>',
};

function mountDialog(desktop: boolean) {
  media.desktop = desktop;
  const onUpdate = vi.fn();
  const wrapper = mount(AdminResponsiveDialog, {
    props: { open: true, title: "编辑群配置", description: "group-1", size: "lg", "onUpdate:open": onUpdate },
    slots: { body: "<div>表单内容</div>", footer: "<button>保存</button>" },
    global: { stubs: { UModal: ModalStub, UDrawer: DrawerStub } },
  });
  return { wrapper, onUpdate };
}

describe("AdminResponsiveDialog", () => {
  it.each([
    { desktop: true, selectedOverlay: ModalStub, otherOverlay: DrawerStub },
    { desktop: false, selectedOverlay: DrawerStub, otherOverlay: ModalStub },
  ])("renders the accessible overlay for the current viewport mode", async ({ desktop, selectedOverlay, otherOverlay }) => {
    const { wrapper, onUpdate } = mountDialog(desktop);
    await nextTick();

    expect(wrapper.findComponent(selectedOverlay).exists()).toBe(true);
    expect(wrapper.findComponent(otherOverlay).exists()).toBe(false);

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes("aria-label")).toBe("编辑群配置");
    expect(dialog.text()).toContain("group-1");
    expect(dialog.text()).toContain("表单内容");
    expect(dialog.text()).toContain("保存");
    await wrapper.get('button[aria-label="关闭"]').trigger("click");
    expect(onUpdate).toHaveBeenCalledWith(false);
    wrapper.unmount();
  });
});
