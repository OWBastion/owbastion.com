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

const mountEditor = () => mountSuspended(AdminPlayerIdentityEditor, {
  props: { open: true, player },
  global: {
    stubs: {
      AdminResponsiveDialog: { props: ["open"], template: '<div v-if="open"><slot name="body" /><slot name="footer" /></div>' },
      UFormField: { props: ["label", "error"], template: '<label>{{ label }}<slot /><span v-if="error">{{ error }}</span></label>' },
      UInput: { props: ["modelValue"], emits: ["update:modelValue"], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
      UButton: { props: ["label", "disabled"], template: '<button :disabled="disabled">{{ label }}</button>' },
      PlayerBattleTag: { props: ["playerName", "playerId"], template: '<span>{{ playerName }}#{{ playerId }}</span>' },
    },
  },
});

describe("AdminPlayerIdentityEditor", () => {
  it("edits the name and number, previews the full BattleTag, and emits both", async () => {
    const wrapper = await mountEditor();
    const [nameInput, idInput] = wrapper.findAll("input");
    expect(idInput.element.value).toBe("51705");
    expect(wrapper.text()).toContain("下一次 Bastion 构建同步后");

    await nameInput.setValue("新名称");
    await idInput.setValue("2222");
    expect(wrapper.get("output").text()).toContain("新名称#2222");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")).toEqual([["新名称", "2222"]]);
  });

  it("allows a number-only change and blocks an invalid number", async () => {
    const wrapper = await mountEditor();
    const idInput = wrapper.findAll("input")[1];

    await idInput.setValue("12a");
    expect(wrapper.text()).toContain("1–10 位数字");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")).toBeUndefined();

    await idInput.setValue("2222");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")).toEqual([["旧名称", "2222"]]);
  });
});
