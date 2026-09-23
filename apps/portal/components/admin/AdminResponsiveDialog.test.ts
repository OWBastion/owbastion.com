import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";
import AdminResponsiveDialog from "./AdminResponsiveDialog.vue";

const media = vi.hoisted(() => ({ desktop: true }));

vi.mock("@vueuse/core", async (importOriginal) => ({
  ...await importOriginal<typeof import("@vueuse/core")>(),
  useMediaQuery: () => ({ __v_isRef: true, value: media.desktop }),
}));

const OverlayStub = {
  props: ["open", "title", "description", "dismissible", "ui"],
  emits: ["update:open"],
  template: '<section role="dialog" :aria-label="title"><h2>{{ title }}</h2><p>{{ description }}</p><slot name="body" /><slot name="footer" /><button aria-label="关闭" @click="$emit(\'update:open\', false)">关闭</button></section>',
};

function mountDialog() {
  const onUpdate = vi.fn();
  const wrapper = mount(AdminResponsiveDialog, {
    props: { open: true, title: "编辑群配置", description: "group-1", size: "lg", "onUpdate:open": onUpdate },
    slots: { body: "<div>表单内容</div>", footer: "<button>保存</button>" },
    global: { stubs: { UModal: OverlayStub, UDrawer: OverlayStub } },
  });
  return { wrapper, onUpdate };
}

describe("AdminResponsiveDialog", () => {
  it("keeps the dialog content and actions available across viewport modes", async () => {
    for (const desktop of [true, false]) {
      media.desktop = desktop;
      const { wrapper, onUpdate } = mountDialog();
      await nextTick();

      expect(wrapper.get('[role="dialog"]').text()).toContain("编辑群配置");
      expect(wrapper.get('[role="dialog"]').text()).toContain("group-1");
      expect(wrapper.get('[role="dialog"]').text()).toContain("表单内容");
      expect(wrapper.get('[role="dialog"]').text()).toContain("保存");
      await wrapper.get('button[aria-label="关闭"]').trigger("click");
      expect(onUpdate).toHaveBeenCalledWith(false);
      wrapper.unmount();
    }
  });
});
