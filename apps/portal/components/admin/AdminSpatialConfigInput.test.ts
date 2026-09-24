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

const stageSpatial = (offset: number) => ({
  bastionPositions: [[offset, offset + 1, offset + 2]],
  control: { centerPositions: [], jumpPositions: [[offset + 3, offset + 4, offset + 5]], respawnPositions: [[offset + 6, offset + 7, offset + 8]] },
  portalPositions: [],
  springboardPositions: [],
});

const compositeConfig = {
  resetPosition: [1, 2, 3],
  endPosition: [4, 5, 6],
  thirdPersonPosition: [7, 8, 9],
  creditsPosition: [10, 11, 12],
  control: { respawnAxis: "z", respawnAxisThreshold: 40 },
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
    remainingStageSelection: "random_unique",
  },
  stages: [
    { stageId: "base", ...stageSpatial(1) },
    { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, ...stageSpatial(20) },
    { stageId: "laboratory", setupDetection: { position: [40, 41, 42], radius: 30 }, ...stageSpatial(40) },
  ],
};

const legacyCompositeConfig = {
  composition: compositeConfig.composition,
  stages: [
    { stageId: "base", ...spatial(1) },
    { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, ...spatial(20) },
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
  AdminLegacyCompositeSpatialConfigInput: { props: ["modelValue"], emits: ["update:modelValue", "valid"], template: '<div data-testid="legacy-composite-input" />' },
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
Global.endPosition = Vector(104, 105, 106);
Global.heroRingPosition = Vector(107, 108, 109);
Global.resetPosition = Vector(110, 111, 112);
Global.creditsPosition = Vector(113, 114, 115);
`;

const singleWorkshopText = `
Global.bastionPosition[0] = Vector(101, 102, 103);
Global.endPosition = Vector(104, 105, 106);
Global.heroRingPosition = Vector(107, 108, 109);
Global.resetPosition = Vector(110, 111, 112);
Global.creditsPosition = Vector(113, 114, 115);
`;

const stageWorkshopText = `
Global.bastionPosition[0] = Vector(101, 102, 103);
Modify Global Variable(controlJumpPosition, Append To Array, Vector(111, 112, 113));
Modify Global Variable(controlRespawnPosition, Append To Array, Vector(114, 115, 116));
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
      resetPosition: null,
      endPosition: null,
      thirdPersonPosition: null,
      creditsPosition: null,
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

  it("routes previously saved per-stage composite configs to the lossless legacy editor", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: legacyCompositeConfig, revisionKey: "revision:map.test:composite-legacy" },
      global: { stubs },
    });
    expect(wrapper.find('[data-testid="legacy-composite-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="composite-input"]').exists()).toBe(false);
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

    const coordinateTextareas = wrapper.findAll("textarea").filter((textarea) => !textarea.attributes("aria-label"));
    expect(coordinateTextareas).toHaveLength(4);
    await coordinateTextareas[0]!.setValue(`${workshopText}\nGlobal.controlRespawnAxis = 0;\nGlobal.controlRespawnAxisThreshold = 40;`);
    for (const textarea of coordinateTextareas.slice(1)) await textarea.setValue(stageWorkshopText);

    const serialized = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as typeof compositeConfig | undefined;
    expect(serialized).toMatchObject({
      composition: { selectionCount: 2, firstStageSelection: { mode: "setup_detection", fallbackStageId: "stage-1" }, remainingStageSelection: "random_unique" },
      resetPosition: [110, 111, 112],
      endPosition: [104, 105, 106],
      thirdPersonPosition: [107, 108, 109],
      creditsPosition: [113, 114, 115],
      control: { respawnAxis: "x", respawnAxisThreshold: 40 },
      stages: [
        { stageId: "stage-1", bastionPositions: [[101, 102, 103]], control: { centerPositions: [], jumpPositions: [[111, 112, 113]], respawnPositions: [[114, 115, 116]] } },
        { stageId: "stage-2", setupDetection: { position: [10, 11, 12], radius: 30 }, bastionPositions: [[101, 102, 103]] },
        { stageId: "stage-3", setupDetection: { position: [20, 21, 22], radius: 30 }, bastionPositions: [[101, 102, 103]] },
      ],
    });
    expect(agentSpatialConfigSchema.safeParse(serialized).success).toBe(true);
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(true);
  });

  it("refreshes the coordinate editor after a same-mode JSON import without resetting its own edits", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: spatial(1), revisionKey: "revision:map.test:single" },
      global: { stubs: editorStubs },
    });
    const coordinateTextarea = () => wrapper.findAll("textarea").find((textarea) => !textarea.attributes("aria-label"))!;
    expect((coordinateTextarea().element as HTMLTextAreaElement).value).toContain("Vector(1, 2, 3)");

    await wrapper.get('textarea[aria-label="空间配置 JSON"]').setValue(JSON.stringify(spatial(20)));
    expect((coordinateTextarea().element as HTMLTextAreaElement).value).toContain("Vector(20, 21, 22)");

    const workshopReplacement = singleWorkshopText.replace("Vector(101, 102, 103)", "Vector(201,202,203)");
    await coordinateTextarea().setValue(workshopReplacement);
    expect((coordinateTextarea().element as HTMLTextAreaElement).value).toBe(workshopReplacement);
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toMatchObject({ bastionPositions: [[201, 202, 203]] });
  });

  it("applies Workshop paste to the active composite stage and preserves the rest of the contract", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
      props: { modelValue: compositeConfig, revisionKey: "revision:map.test:composite" },
      global: { stubs: editorStubs },
    });

    const stageTextareas = wrapper.findAll("textarea").filter((textarea) => !textarea.attributes("aria-label")).slice(1);
    await stageTextareas[0]!.setValue(stageWorkshopText);

    const saved = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as typeof compositeConfig;
    expect(saved.composition).toEqual(compositeConfig.composition);
    expect(saved.stages[0]).toMatchObject({
      stageId: "base",
      bastionPositions: [[101, 102, 103]],
      control: { jumpPositions: [[111, 112, 113]], respawnPositions: [[114, 115, 116]] },
    });
    expect(saved.stages[0]).not.toHaveProperty("setupDetection");
    expect(saved.stages[1]).toEqual(compositeConfig.stages[1]);
    expect(saved.stages[2]).toEqual(compositeConfig.stages[2]);
    expect(saved).not.toHaveProperty("bastionPositions");
    expect(saved.resetPosition).toEqual(compositeConfig.resetPosition);
    expect(saved.stages[0]).not.toHaveProperty("endPosition");
    expect(agentSpatialConfigSchema.safeParse(saved).success).toBe(true);
  });
});
