import { defineComponent, h, nextTick, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { useTableColumnVisibility } from "~/composables/useTableColumnVisibility";

const originalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");

afterEach(() => {
  if (originalStorage) Object.defineProperty(window, "localStorage", originalStorage);
});

describe("table column visibility", () => {
  it("restores and saves preferences for an individual table key", async () => {
    const values = new Map<string, string>([["owbastion:admin-table-columns:players", JSON.stringify({ updatedAt: false })]]);
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    let visibility: Ref<Record<string, boolean>> | undefined;
    mount(defineComponent({
      setup() {
        visibility = useTableColumnVisibility("players");
        return () => h("div");
      },
    }));
    await nextTick();
    expect(visibility?.value).toEqual({ updatedAt: false });
    visibility!.value = { updatedAt: false, bindingCount: false };
    await nextTick();
    expect(values.get("owbastion:admin-table-columns:players")).toBe(JSON.stringify({ updatedAt: false, bindingCount: false }));
  });
});
