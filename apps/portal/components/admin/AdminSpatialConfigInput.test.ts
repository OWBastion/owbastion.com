import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import AdminSpatialConfigInput from "./AdminSpatialConfigInput.vue";

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

const sampleVectorText = `
Global.bastionPosition[0] = Vector(-121.979, 0.148, 110.507);
Global.bastionPosition[1] = Vector(-93.733, -1.047, 110.100);
Global.endPosition = Vector(2.772, -6.500, -6.900);
Global.heroRingPosition = Vector(-149.170, 0.830, 100.850);
Global.resetPosition = Vector(-150.250, 0.830, 104.510);
Global.creditsPosition = Vector(-170.800, 3.650, 96.450);
`;

describe("AdminSpatialConfigInput", () => {
  it("formats an existing spatial configuration and displays recognition summary", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
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
  });

  it("updates modelValue and displays point summary when valid Vector text is pasted", async () => {
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
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
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
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
    const wrapper = await mountSuspended(AdminSpatialConfigInput, {
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
});
