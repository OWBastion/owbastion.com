import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminSpatialCoordinatesInput from "./AdminSpatialCoordinatesInput.vue";

const sampleConfig = {
  bastionPositions: [[-121.979, 0.148, 110.507], [-93.733, -1.047, 110.1]],
  resetPosition: [-150.25, 0.83, 104.51],
  endPosition: [2.772, -6.5, -6.9],
  thirdPersonPosition: [-149.17, 0.83, 100.85],
  creditsPosition: [-170.8, 3.65, 96.45],
  control: null,
  portalPositions: [],
  springboardPositions: [],
  alternateStages: [],
};

const compositeConfig = {
  composition: {
    selectionCount: 2,
    firstStageSelection: { mode: "setup_detection", fallbackStageId: "base" },
    remainingStageSelection: "random_unique",
  },
  stages: [
    { stageId: "base", bastionPositions: [[1, 2, 3]], resetPosition: [4, 5, 6], endPosition: [7, 8, 9], thirdPersonPosition: [10, 11, 12], creditsPosition: [13, 14, 15], control: null, portalPositions: [], springboardPositions: [] },
    { stageId: "icebreaker", setupDetection: { position: [20, 21, 22], radius: 30 }, bastionPositions: [[10, 11, 12]], resetPosition: [13, 14, 15], endPosition: [16, 17, 18], thirdPersonPosition: [19, 20, 21], creditsPosition: [22, 23, 24], control: null, portalPositions: [], springboardPositions: [] },
    { stageId: "laboratory", setupDetection: { position: [40, 41, 42], radius: 30 }, bastionPositions: [[30, 31, 32]], resetPosition: [33, 34, 35], endPosition: [36, 37, 38], thirdPersonPosition: [39, 40, 41], creditsPosition: [42, 43, 44], control: null, portalPositions: [], springboardPositions: [] },
  ],
};

const sampleVectorText = `
Global.bastionPosition[0] = Vector(-121.979, 0.148, 110.507);
Global.bastionPosition[1] = Vector(-93.733, -1.047, 110.100);
Global.endPosition = Vector(2.772, -6.500, -6.900);
Global.heroRingPosition = Vector(-149.170, 0.830, 100.850);
Global.resetPosition = Vector(-150.250, 0.830, 104.510);
Global.creditsPosition = Vector(-170.800, 3.650, 96.450);
`;

const sampleControlText = `
${sampleVectorText}
Modify Global Variable(portalPosition, Append To Array, Vector(10, 20, 30));
Modify Global Variable(controlCenterPosition, Append To Array, Vector(40, 50, 60));
Modify Global Variable(controlRespawnPosition, Append To Array, Vector(70, 80, 90));
Global.controlRespawnAxis = Axis.Z;
Global.controlRespawnAxisThreshold = 30;
`;

const sharedRouteConfig = {
  resetPosition: [1, 2, 3],
  endPosition: [4, 5, 6],
  thirdPersonPosition: [7, 8, 9],
  creditsPosition: [10, 11, 12],
  control: { respawnAxis: "x", respawnAxisThreshold: 40 },
};

const stageSource = `
Global.bastionPosition[0] = Vector(13, 14, 15);
Modify Global Variable(controlCenterPosition, Append To Array, Vector(16, 17, 18));
Modify Global Variable(controlRespawnPosition, Append To Array, Vector(19, 20, 21));
Modify Global Variable(portalPosition, Append To Array, Vector(22, 23, 24));
`;

describe("AdminSpatialCoordinatesInput", () => {
  it("formats an existing spatial configuration and displays recognition summary", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: {
        modelValue: sampleConfig,
        revisionKey: "revision:map.test:initial",
      },
    });

    const textarea = wrapper.get("textarea");
    expect((textarea.element as HTMLTextAreaElement).value).toContain("Global.bastionPosition[0] = Vector(-121.979, 0.148, 110.507);");
    expect(wrapper.text()).toContain("已识别 6 个点位");
    expect(wrapper.text()).toContain("Bastion 出生点 2");
    expect(wrapper.text()).toContain("重置点 1");
    expect(wrapper.text()).toContain("核心点位");
    expect(wrapper.text()).toContain("-121.979");
  });

  it("keeps JSON out of the per-route coordinate paste field", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: { modelValue: null, revisionKey: "revision:map.composite:new" },
    });
    await wrapper.get("textarea").setValue(JSON.stringify(compositeConfig));
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("只接受当前路线或阶段的 Raw Workshop 点位代码");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("updates modelValue and displays point summary when valid Vector text is pasted", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: {
        modelValue: null,
        revisionKey: "revision:map.test:new",
      },
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue(sampleVectorText);

    expect(wrapper.text()).toContain("已识别 6 个点位");
    expect(wrapper.emitted("valid")).toEqual([[true], [true]]);
    expect(wrapper.emitted("update:modelValue")).toHaveLength(1);
    expect(wrapper.emitted("update:modelValue")![0]![0]).toMatchObject({
      bastionPositions: [[-121.979, 0.148, 110.507], [-93.733, -1.047, 110.1]],
      resetPosition: [-150.25, 0.83, 104.51],
      endPosition: [2.772, -6.5, -6.9],
      thirdPersonPosition: [-149.17, 0.83, 100.85],
      creditsPosition: [-170.8, 3.65, 96.45],
    });
  });

  it("displays error message and emits invalid status when incomplete vectors are entered", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: {
        modelValue: null,
        revisionKey: "revision:map.test:new",
      },
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("Global.bastionPosition[0] = Vector(1, 2, 3);");

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("缺少必需点位");
    expect(wrapper.emitted("valid")).toEqual([[true], [false]]);
  });

  it("clears configuration when textarea is emptied", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: {
        modelValue: sampleConfig,
        revisionKey: "revision:map.test:initial",
      },
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue("");

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.emitted("valid")).toEqual([[true], [true]]);
    expect(wrapper.emitted("update:modelValue")).toEqual([[null]]);
  });

  it("renders mechanic and control sections when control positions are provided", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: {
        modelValue: null,
        revisionKey: "revision:map.test:control",
      },
    });

    const textarea = wrapper.get("textarea");
    await textarea.setValue(sampleControlText);

    expect(wrapper.text()).toContain("传送与跳板");
    expect(wrapper.text()).toContain("占领机制");
    expect(wrapper.text()).toContain("占领中心点");
    expect(wrapper.text()).toContain("占领重生点");
    expect(wrapper.text()).toContain("重生轴：Z 轴");
  });

  it("keeps shared route points out of stage coordinate imports", async () => {
    const routeWrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: { modelValue: sharedRouteConfig, revisionKey: "revision:map.composite:route", scope: "composite-route" },
    });
    expect(routeWrapper.text()).toContain("全路线共享点位代码");
    expect(routeWrapper.text()).toContain("全路线共享点位");
    expect(routeWrapper.text()).toContain("已识别 4 个点位");
    expect(routeWrapper.text()).toContain("重生轴：X 轴");
    expect((routeWrapper.get("textarea").element as HTMLTextAreaElement).value).toContain("Global.controlRespawnAxis = 0;");

    const stageWrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: { modelValue: null, revisionKey: "revision:map.composite:stage", scope: "composite-stage" },
    });
    await stageWrapper.get("textarea").setValue(stageSource);
    const imported = stageWrapper.emitted("update:modelValue")?.at(-1)?.[0] as Record<string, unknown>;
    expect(stageWrapper.text()).toContain("阶段专属点位代码");
    expect(stageWrapper.text()).toContain("已识别 4 个点位");
    expect(imported).toMatchObject({
      bastionPositions: [[13, 14, 15]],
      control: { centerPositions: [[16, 17, 18]], respawnPositions: [[19, 20, 21]] },
      portalPositions: [[22, 23, 24]],
    });
    expect(imported).not.toHaveProperty("endPosition");
  });

  it("toggles coordinate details when collapse/expand button is clicked", async () => {
    const wrapper = await mountSuspended(AdminSpatialCoordinatesInput, {
      props: {
        modelValue: sampleConfig,
        revisionKey: "revision:map.test:initial",
      },
    });

    expect(wrapper.text()).toContain("-121.979");
    const toggleButton = wrapper.findAll("button").find((btn) => btn.text().includes("收起坐标明细"));
    expect(toggleButton).toBeDefined();

    await toggleButton?.trigger("click");
    expect(wrapper.text()).not.toContain("-121.979");
    expect(wrapper.text()).toContain("展开坐标明细");

    const expandButton = wrapper.findAll("button").find((btn) => btn.text().includes("展开坐标明细"));
    await expandButton?.trigger("click");
    expect(wrapper.text()).toContain("-121.979");
  });
});
