// @vitest-environment happy-dom

import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";

import {
  useStudioLoading,
  type StudioLoadingState,
} from "../../composables/useStudioLoading";

const studioElementName = "nuxt-studio";

if (!customElements.get(studioElementName)) {
  customElements.define(studioElementName, class extends HTMLElement {});
}

const removeStudioElements = () => {
  document
    .querySelectorAll(studioElementName)
    .forEach((element) => element.remove());
};

const createHarness = (timeoutMs?: number) =>
  defineComponent({
    setup() {
      const { state } = useStudioLoading({ timeoutMs });
      return { state };
    },
    template: "<output>{{ state }}</output>",
  });

describe("useStudioLoading", () => {
  afterEach(() => {
    removeStudioElements();
  });

  it("waits for the native Studio element before clearing the loading state", async () => {
    const wrapper = mount(createHarness(1000));

    expect(wrapper.text()).toBe("loading");

    document.body.append(document.createElement(studioElementName));
    await flushPromises();
    await nextTick();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(wrapper.text()).toBe("ready");

    wrapper.unmount();
  });

  it("fails closed when Studio never mounts", async () => {
    const wrapper = mount(createHarness(10));

    await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
    await nextTick();

    expect(wrapper.text()).toBe("unavailable" satisfies StudioLoadingState);

    wrapper.unmount();
  });
});
