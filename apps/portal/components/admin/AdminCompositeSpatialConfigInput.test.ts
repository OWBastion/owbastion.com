import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import { agentSpatialConfigSchema } from "@owbastion/contracts";
import AdminCompositeSpatialConfigInput from "./AdminCompositeSpatialConfigInput.vue";

const routeSpatial = () => ({
  resetPosition: [4, 5, 6],
  endPosition: [7, 8, 9],
  thirdPersonPosition: [10, 11, 12],
  creditsPosition: [13, 14, 15],
  control: null,
});

const spatial = (offset: number) => ({
  bastionPositions: [[offset, offset + 1, offset + 2]],
  control: null,
  portalPositions: [],
  springboardPositions: [],
});

const compositeConfig = () => ({
  ...routeSpatial(),
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "setup_detection" as const, fallbackStageId: "base" },
    remainingStageSelection: "random_unique" as const,
  },
  stages: [
    { stageId: "base", ...spatial(1) },
    { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, ...spatial(20) },
    { stageId: "laboratory", setupDetection: { position: [40, 41, 42], radius: 30 }, ...spatial(40) },
  ],
});

const stubs = {
  UFormField: { props: { label: String, required: Boolean }, template: '<div class="field"><label>{{ label }}<span v-if="required"> *</span></label><slot /></div>' },
  UInput: {
    props: ["modelValue", "type", "disabled", "ariaLabel", "min", "max", "step"],
    emits: ["update:modelValue"],
    template: '<input :aria-label="ariaLabel" :value="modelValue" :type="type || \'text\'" :disabled="disabled" :min="min" :max="max" :step="step" @input="$emit(\'update:modelValue\', type === \'number\' && $event.target.value !== \'\' ? Number($event.target.value) : $event.target.value)" />',
  },
  USelect: {
    props: ["modelValue", "items", "disabled", "ariaLabel"],
    emits: ["update:modelValue"],
    template: '<select :aria-label="ariaLabel" :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  },
  UButton: {
    props: ["label", "disabled"],
    emits: ["click"],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
  },
  UBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
  AdminSpatialCoordinatesInput: { props: ["modelValue"], emits: ["update:modelValue", "valid"], template: "<div />" },
};

async function mountEditor(modelValue = compositeConfig()) {
  return mountSuspended(AdminCompositeSpatialConfigInput, {
    props: { modelValue, revisionKey: "revision:map.antarctic_peninsula:preparing" },
    global: { stubs },
  });
}

function latestConfig(wrapper: Awaited<ReturnType<typeof mountEditor>>) {
  return wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ReturnType<typeof compositeConfig> | undefined;
}

async function acceptLatestConfig(wrapper: Awaited<ReturnType<typeof mountEditor>>) {
  const value = latestConfig(wrapper);
  if (value) await wrapper.setProps({ modelValue: value });
}

describe("AdminCompositeSpatialConfigInput", () => {
  it("adds, edits, and removes stages without exposing stage reordering", async () => {
    const wrapper = await mountEditor();
    await wrapper.findAll("button").find((button) => button.text().includes("添加阶段"))?.trigger("click");
    await acceptLatestConfig(wrapper);
    expect(latestConfig(wrapper)?.stages.map((stage) => stage.stageId)).toEqual(["base", "icebreaker", "laboratory", "stage-1"]);
    expect(wrapper.text()).not.toContain("上移");
    expect(wrapper.text()).not.toContain("下移");

    await wrapper.get('input[aria-label="阶段 ID stage-1"]').setValue("observatory");
    await acceptLatestConfig(wrapper);
    expect(latestConfig(wrapper)?.stages[3]?.stageId).toBe("observatory");

    await wrapper.findAll("button").filter((button) => button.text().includes("移除阶段"))[3]?.trigger("click");
    await acceptLatestConfig(wrapper);
    expect(latestConfig(wrapper)?.stages.map((stage) => stage.stageId)).toEqual(["base", "icebreaker", "laboratory"]);
  });

  it("surfaces duplicate IDs, missing fallback references, and impossible selection counts inline", async () => {
    const duplicateWrapper = await mountEditor();
    await duplicateWrapper.get('input[aria-label="阶段 ID base"]').setValue("icebreaker");
    await acceptLatestConfig(duplicateWrapper);
    expect(duplicateWrapper.text()).toContain("阶段 ID 重复");
    expect(duplicateWrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);

    const missingFallback = compositeConfig();
    missingFallback.composition.firstStageSelection.fallbackStageId = "missing";
    const fallbackWrapper = await mountEditor(missingFallback);
    expect(fallbackWrapper.text()).toContain("请选择一个已存在的回退阶段");
    expect(fallbackWrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);

    const countWrapper = await mountEditor();
    await countWrapper.get('input[aria-label="阶段选择数量"]').setValue("4");
    await acceptLatestConfig(countWrapper);
    expect(countWrapper.text()).toContain("不得超过阶段数量");
    expect(countWrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);
  });

  it("requires valid setup-detection coordinates and a positive radius for every detected stage", async () => {
    const incomplete = compositeConfig();
    delete (incomplete.stages[2] as typeof incomplete.stages[number] & { setupDetection?: unknown }).setupDetection;
    const wrapper = await mountEditor(incomplete);
    const requiredLabels = wrapper.findAll(".field label").map((label) => label.text());
    expect(requiredLabels).toContain("阶段 ID · base *");
    expect(requiredLabels).toContain("检测位置 *");
    expect(requiredLabels).toContain("检测半径 *");
    expect(wrapper.text()).toContain("此阶段需要设置检测位置和正半径");
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);

    await wrapper.get('input[aria-label="laboratory 检测位置 X"]').setValue("40");
    await acceptLatestConfig(wrapper);
    await wrapper.get('input[aria-label="laboratory 检测位置 Y"]').setValue("41");
    await acceptLatestConfig(wrapper);
    await wrapper.get('input[aria-label="laboratory 检测位置 Z"]').setValue("42");
    await acceptLatestConfig(wrapper);
    await wrapper.get('input[aria-label="laboratory 检测半径"]').setValue("30");
    await acceptLatestConfig(wrapper);

    expect(wrapper.text()).not.toContain("此阶段需要设置检测位置和正半径");
    expect((latestConfig(wrapper)?.stages[2] as Record<string, unknown> | undefined)?.setupDetection).toEqual({ position: [40, 41, 42], radius: 30 });
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(true);
  });

  it("serializes the Antarctic Peninsula setup to the shared composite map contract", async () => {
    const expected = compositeConfig();
    const wrapper = await mountEditor(expected);
    await wrapper.get('input[aria-label="阶段选择数量"]').setValue("3");
    await acceptLatestConfig(wrapper);

    const serialized = latestConfig(wrapper);
    expect(serialized).toEqual({ ...expected, composition: { ...expected.composition, selectionCount: 3 } });
    expect(agentSpatialConfigSchema.safeParse(serialized).success).toBe(true);
    expect(serialized).not.toHaveProperty("alternateStages");
    expect(serialized?.endPosition).toEqual([7, 8, 9]);
    expect(serialized?.stages[0]).not.toHaveProperty("endPosition");
  });

  it("keeps the respawn axis at route scope and stage control positions local", async () => {
    const config = {
      ...compositeConfig(),
      control: { respawnAxis: "x" as const, respawnAxisThreshold: 40 },
      stages: compositeConfig().stages.map((stage, index) => index === 0
        ? { ...stage, control: { centerPositions: [[1, 2, 3]], jumpPositions: [[4, 5, 6]], respawnPositions: [[7, 8, 9]] } }
        : stage),
    };
    const wrapper = await mountEditor(config);
    expect((wrapper.get('select[aria-label="全路线占领重生轴"]').element as HTMLSelectElement).value).toBe("x");
    expect(agentSpatialConfigSchema.safeParse(config).success).toBe(true);
    expect(config.stages[0]).not.toHaveProperty("respawnAxis");
  });

  it("shows route-level control validation beside the shared control settings", async () => {
    const config = {
      ...compositeConfig(),
      control: { respawnAxis: "x" as const, respawnAxisThreshold: -1 },
      stages: compositeConfig().stages.map((stage, index) => index === 0
        ? { ...stage, control: { centerPositions: [], jumpPositions: [[4, 5, 6]], respawnPositions: [[7, 8, 9]] } }
        : stage),
    };
    const wrapper = await mountEditor(config);
    expect(wrapper.text()).toContain("重生轴与阈值必须成对设置，且阶段中需要有占领重生点");
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);
  });

  it("shows the supported control jump and respawn cardinality", async () => {
    const config = {
      ...compositeConfig(),
      stages: compositeConfig().stages.map((stage, index) => index === 0
        ? { ...stage, control: { centerPositions: [], jumpPositions: [[1, 2, 3], [4, 5, 6]], respawnPositions: [[7, 8, 9]] } }
        : stage),
    };
    const wrapper = await mountEditor(config);

    expect(wrapper.text()).toContain("每阶段的阶段间传送点与占领重生点须成对配置，且最多一对。");
    expect(wrapper.emitted("valid")?.at(-1)?.[0]).toBe(false);
  });
});
