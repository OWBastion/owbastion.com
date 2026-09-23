import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminSpatialConfigInput from "./AdminSpatialConfigInput.vue";

const spatial = (offset: number) => ({
  bastionPositions: [[offset, offset + 1, offset + 2]],
  resetPosition: [offset + 3, offset + 4, offset + 5],
  endPosition: [offset + 6, offset + 7, offset + 8],
  thirdPersonPosition: [offset + 9, offset + 10, offset + 11],
  creditsPosition: [offset + 12, offset + 13, offset + 14],
  control: null,
  portalPositions: [],
  springboardPositions: [],
});

const legacyConfig = {
  ...spatial(1),
  alternateStages: [{ stageId: "ruins", setupDetection: { position: [20, 21, 22], radius: 30 }, ...spatial(20) }],
};

const compositeConfig = {
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
    remainingStageSelection: "random_unique",
  },
  stages: [
    { stageId: "base", ...spatial(1) },
    { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, ...spatial(20) },
    { stageId: "laboratory", setupDetection: { position: [40, 41, 42], radius: 30 }, ...spatial(40) },
  ],
};

const stubs = {
  UFormField: { props: ["label"], template: '<div class="field"><label>{{ label }}</label><slot /></div>' },
  USelect: {
    props: ["modelValue", "items", "disabled", "ariaLabel"],
    emits: ["update:modelValue"],
    template: '<select :aria-label="ariaLabel" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  },
  UTextarea: {
    props: ["modelValue", "disabled", "rows", "ariaLabel"],
    emits: ["update:modelValue"],
    template: '<textarea :aria-label="ariaLabel" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  AdminSpatialCoordinatesInput: { props: ["modelValue"], emits: ["update:modelValue", "valid"], template: '<div data-testid="coordinates-input" />' },
  AdminCompositeSpatialConfigInput: { props: ["modelValue"], emits: ["update:modelValue", "valid"], template: '<div data-testid="composite-input" />' },
};

const editorStubs = {
  UFormField: stubs.UFormField,
  USelect: stubs.USelect,
  UTextarea: stubs.UTextarea,
  UInput: {
    props: ["modelValue", "type", "disabled", "ariaLabel", "min", "max", "step"],
    emits: ["update:modelValue"],
    template: '<input :aria-label="ariaLabel" :value="modelValue" :type="type || \'text\'" :disabled="disabled" @input="$emit(\'update:modelValue\', type === \'number\' && $event.target.value !== \'\' ? Number($event.target.value) : $event.target.value)" />',
  },
  UButton: { props: ["label", "disabled"], emits: ["click"], template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>' },
  UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
  UAlert: { props: ["title"], template: '<p role="alert">{{ title }}</p>' },
  UIcon: { props: ["name"], template: "<span aria-hidden=\"true\" />" },
};

const workshopText = `
Global.bastionPosition[0] = Vector(101, 102, 103);
Global.endPosition = Vector(104, 105, 106);
Global.heroRingPosition = Vector(107, 108, 109);
Global.resetPosition = Vector(110, 111, 112);
Global.creditsPosition = Vector(113, 114, 115);
`;

describe("AdminSpatialConfigInput", () => {
  it("switches between static and composite modes with the current contract shape", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: null, revisionKey: "revision:map.test:new" },
      global: { stubs },
    });

    await wrapper.get('select[aria-label="路线类型"]').setValue("composite");
    const composite = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as Record<string, unknown>;
    expect(composite).toMatchObject({
      composition: { selectionCount: 2, firstStageSelection: { mode: "random" }, remainingStageSelection: "random_unique" },
      stages: [{ stageId: "stage-1" }, { stageId: "stage-2" }],
    });
    expect(wrapper.find('[data-testid="composite-input"]').exists()).toBe(true);

    await wrapper.get('select[aria-label="路线类型"]').setValue("single");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toBeNull();
    expect(wrapper.find('[data-testid="coordinates-input"]').exists()).toBe(true);
  });

  it("keeps legacy alternate-stage editing in the advanced JSON importer", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: legacyConfig, revisionKey: "revision:map.test:legacy" },
      global: { stubs },
    });

    const json = wrapper.get('textarea[aria-label="空间配置 JSON"]');
    await json.setValue(JSON.stringify(legacyConfig));
    const saved = wrapper.emitted("update:modelValue")?.at(-1)?.[0];
    expect(saved).toEqual(legacyConfig);
    expect(agentSpatialConfigSchema.safeParse(saved).success).toBe(true);
    expect(wrapper.find('[data-testid="coordinates-input"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("高级：导入完整空间配置 JSON");

    await wrapper.get('select[aria-label="路线类型"]').setValue("composite");
    await wrapper.get('select[aria-label="路线类型"]').setValue("single");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual(legacyConfig);
  });

  it("blocks incomplete JSON before it can become the saved spatial configuration", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: null, revisionKey: "revision:map.test:new" },
      global: { stubs },
    });

    await wrapper.get('textarea[aria-label="空间配置 JSON"]').setValue(JSON.stringify({ bastionPositions: [[1, 2, 3]] }));
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);
  });

  it("imports a composite JSON document into the structured form and validates the saved contract", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: null, revisionKey: "revision:map.test:new" },
      global: { stubs },
    });

    await wrapper.get('textarea[aria-label="空间配置 JSON"]').setValue(JSON.stringify(compositeConfig));
    const saved = wrapper.emitted("update:modelValue")?.at(-1)?.[0];
    expect(saved).toEqual(compositeConfig);
    expect(agentSpatialConfigSchema.safeParse(saved).success).toBe(true);
    expect((wrapper.get('select[aria-label="路线类型"]').element as HTMLSelectElement).value).toBe("composite");
  });

  it("builds a three-stage setup-detected route from the structured form without JSON", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: null, revisionKey: "revision:map.antarctic_peninsula:new" },
      global: { stubs: editorStubs },
    });

    await wrapper.get('select[aria-label="路线类型"]').setValue("composite");
    const addStageButton = wrapper.findAll("button").find((button) => button.text().includes("添加阶段"));
    await addStageButton?.trigger("click");

    await wrapper.get('select[aria-label="首阶段选择"]').setValue("setup_detection");
    for (const [index, stageId] of [[1, "stage-2"], [2, "stage-3"]] as const) {
      const fields = [
        ["检测位置 X", String(index * 10)],
        ["检测位置 Y", String(index * 10 + 1)],
        ["检测位置 Z", String(index * 10 + 2)],
        ["检测半径", "30"],
      ] as const;
      for (const [field, value] of fields) {
        await wrapper.get(`input[aria-label="${stageId} ${field}"]`).setValue(value);
      }
    }

    const stageTextareas = wrapper.findAll("textarea").slice(0, 3);
    expect(stageTextareas).toHaveLength(3);
    for (const textarea of stageTextareas) await textarea.setValue(workshopText);

    const serialized = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as typeof compositeConfig | undefined;
    expect(serialized).toMatchObject({
      composition: { selectionCount: 2, firstStageSelection: { mode: "setup_detection", fallbackStageId: "stage-1" }, remainingStageSelection: "random_unique" },
      stages: [
        { stageId: "stage-1", bastionPositions: [[101, 102, 103]] },
        { stageId: "stage-2", setupDetection: { position: [10, 11, 12], radius: 30 }, bastionPositions: [[101, 102, 103]] },
        { stageId: "stage-3", setupDetection: { position: [20, 21, 22], radius: 30 }, bastionPositions: [[101, 102, 103]] },
      ],
    });
    expect(agentSpatialConfigSchema.safeParse(serialized).success).toBe(true);
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(true);
  });

  it("applies Workshop paste to the active composite stage and preserves the rest of the contract", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: compositeConfig, revisionKey: "revision:map.test:composite" },
      global: { stubs: editorStubs },
    });

    const stageTextareas = wrapper.findAll("textarea").slice(0, compositeConfig.stages.length);
    await stageTextareas[0]!.setValue(workshopText);

    const saved = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as typeof compositeConfig;
    expect(saved.composition).toEqual(compositeConfig.composition);
    expect(saved.stages[0]).toMatchObject({
      stageId: "base",
      bastionPositions: [[101, 102, 103]],
      resetPosition: [110, 111, 112],
      endPosition: [104, 105, 106],
    });
    expect(saved.stages[0]).not.toHaveProperty("setupDetection");
    expect(saved.stages[1]).toEqual(compositeConfig.stages[1]);
    expect(saved.stages[2]).toEqual(compositeConfig.stages[2]);
    expect(saved).not.toHaveProperty("bastionPositions");
    expect(agentSpatialConfigSchema.safeParse(saved).success).toBe(true);
  });
});
