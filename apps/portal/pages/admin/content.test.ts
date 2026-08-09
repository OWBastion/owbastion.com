import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import ContentPage from "./content.vue";

const stubs = {
  AdminWorkspace: { props: ["title"], template: "<main><h1>{{ title }}</h1><slot name='actions' /><slot /></main>" },
  UButton: {
    props: ["label", "icon", "to", "target", "rel"],
    template: "<a v-if='to' :href='to' :target='target' :rel='rel'>{{ label }}</a><button v-else type='button'>{{ label }}</button>",
  },
};

describe("admin content entry", () => {
  it("launches the same-origin Studio workspace in a new browsing context", async () => {
    const wrapper = await mountSuspended(ContentPage, { global: { stubs } });
    const launch = wrapper.get("a[href=\"/api/studio/login?redirect=%2Fstudio\"]");

    expect(launch.attributes("target")).toBe("_blank");
    expect(launch.attributes("rel")).toBe("noopener");
    expect(wrapper.text()).toContain("当前管理页面会保持可用");
    expect(wrapper.find("nuxt-studio").exists()).toBe(false);
    expect(wrapper.find(".studio-editor-frame").exists()).toBe(false);
  });
});
