import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminPlayerIdentityEditor from "./AdminPlayerIdentityEditor.vue";

const player = {
  playerAccountId: "11111111-1111-4111-8111-111111111111",
  playerId: "51705",
  playerName: "旧名称",
  status: "active" as const,
  bindingCount: 0,
  updatedAt: 0,
  bindings: [],
  recentSubmissions: [],
  titleGrants: [],
};

describe("AdminPlayerIdentityEditor", () => {
  it("keeps the numeric player ID fixed and emits the edited name", async () => {
    const wrapper = await mountSuspended(AdminPlayerIdentityEditor, {
      props: { open: true, player },
      global: {
        stubs: {
          AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' },
          UFormField: { props: ["label"], template: '<label>{{ label }}<slot /></label>' },
          UInput: { props: ["modelValue", "readonly"], emits: ["update:modelValue"], template: '<input :value="modelValue" :readonly="readonly" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
        },
      },
    });

    const inputs = wrapper.findAll("input");
    expect(inputs[1].element.value).toBe("51705");
    expect(inputs[1].element.readOnly).toBe(true);
    await inputs[0].setValue("新名称");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")).toEqual([["新名称"]]);
  });
});
