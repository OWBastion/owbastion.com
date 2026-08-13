import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminMapRevisionEditor from "./AdminMapRevisionEditor.vue";

const revision = {
  revisionId: "revision:map.test:r2",
  mapId: "map.test",
  lifecycle: "preparing" as const,
  mapVariant: null,
  copiedFromRevisionId: "revision:map.test:initial",
  resetReason: null,
  gameVersion: "26.0812.1",
  spatialConfig: null,
  isDefault: false,
  isSelectable: false,
  challengeAssignments: [],
  createdAt: 1,
  updatedAt: 1,
};

describe("AdminMapRevisionEditor", () => {
  it("allows the administrator to edit the game version and atomically selects the displaced default lifecycle", async () => {
    const wrapper = await mountSuspended(AdminMapRevisionEditor, {
      props: {
        revision,
        replacedDefaultRevision: { ...revision, revisionId: "revision:map.test:initial", lifecycle: "default", copiedFromRevisionId: null, isDefault: true, gameVersion: "26.0715.1" },
        challengeCatalog: [],
      },
      global: {
        stubs: {
          StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
          UFormField: { template: "<label><slot /></label>" },
          USelect: {
            props: ["modelValue", "items", "disabled"],
            emits: ["update:modelValue"],
            template: "<select :value=\"modelValue\" :disabled=\"disabled\" @change=\"$emit('update:modelValue', $event.target.value)\"><option v-for=\"item in items\" :key=\"String(item.value)\" :value=\"item.value\">{{ item.label }}</option></select>",
          },
          UInput: { props: ["modelValue", "readonly"], emits: ["update:modelValue"], template: "<input :value=\"modelValue\" :readonly=\"readonly\" @input=\"$emit('update:modelValue', $event.target.value)\" />" },
          UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: "<textarea :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />" },
          UCheckbox: { template: "<input type=\"checkbox\" />" },
          UButton: { props: ["disabled"], template: "<button :disabled=\"disabled\"><slot /></button>" },
        },
      },
    });

    const versionInput = wrapper.findAll("input")[0]!;
    expect((versionInput.element as HTMLInputElement).value).toBe("26.0812.1");
    await versionInput.setValue("2026.08.13");

    await wrapper.findAll("select")[0]!.setValue("default");
    await wrapper.findAll("select")[2]!.setValue("historical");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("save")).toEqual([[
      {
        contractVersion: "1",
        lifecycle: "default",
        replacedDefaultLifecycle: "historical",
        gameVersion: "2026.08.13",
        mapVariant: null,
        spatialConfig: null,
        challengeAssignments: [],
      },
    ]]);
  });
});
