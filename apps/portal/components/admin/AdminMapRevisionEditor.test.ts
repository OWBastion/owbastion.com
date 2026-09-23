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
        challengeCatalog: [{
          challengeFamily: "map_challenge",
          challengeId: "challenge.map.test",
          label: "地狱通关",
          kind: "clear",
          status: "active",
          gameVersion: "26.0812.1",
        }, {
          challengeFamily: "map_title_rule",
          challengeId: "rule.conqueror",
          label: "CONQUEROR",
          kind: "conqueror",
          status: "active",
          gameVersion: "26.0812.1",
        }],
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
          AdminSpatialConfigInput: { props: ["modelValue"], emits: ["update:modelValue", "valid"], template: "<div />" },
          UCheckbox: { props: ["label", "modelValue"], emits: ["update:modelValue"], template: "<label><input type=\"checkbox\" :checked=\"modelValue\" @change=\"$emit('update:modelValue', $event.target.checked)\" />{{ label }}</label>" },
          UButton: { props: ["disabled"], template: "<button :disabled=\"disabled\"><slot /></button>" },
        },
      },
    });

    expect(wrapper.text()).not.toContain("版本修订配置");
    expect(wrapper.text()).toContain("地狱通关 · 地图挑战");
    expect(wrapper.text()).toContain("CONQUEROR · 地图称号规则");
    expect(wrapper.text()).toContain("决定哪些挑战和称号规则应用于此 Gameplay Revision");
    expect(wrapper.text()).not.toContain("单图挑战");
    expect(wrapper.text()).not.toContain("地图称号挑战");
    expect(wrapper.get("details").text()).toContain("空间配置");
    expect(wrapper.find("details[open]").exists()).toBe(true);

    const versionInput = wrapper.findAll("input")[0]!;
    expect((versionInput.element as HTMLInputElement).value).toBe("26.0812.1");
    await versionInput.setValue("2026.08.13");
    await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true);

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
        challengeAssignments: [{
          challengeFamily: "map_title_rule",
          challengeId: "rule.conqueror",
          enabled: true,
          condition: null,
          evidenceRule: null,
          submissionMode: null,
          slot: null,
        }],
      },
    ]]);
  });
});
