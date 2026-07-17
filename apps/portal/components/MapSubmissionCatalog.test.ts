import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import MapSubmissionCatalog from "./MapSubmissionCatalog.vue";

describe("MapSubmissionCatalog", () => {
  it("keeps a sunsetting challenge selectable while showing its planned end", async () => {
    const wrapper = await mountSuspended(MapSubmissionCatalog, {
      props: { maps: [{ mapId: "map-1", mapName: "测试地图", gameVersion: "26.0713.1", difficultyRating: null, mechanics: [], coverUrl: null, backgroundUrl: null }], challenges: [{ challengeId: "map-1.challenge", family: "map", type: "map_completion", kind: "difficulty_completion", name: "测试挑战", mapId: "map-1", mapName: "测试地图", gameVersion: "26.0713.1", status: "sunsetting", retiredVersion: "26.0713.2" }], selectedChallengeId: "" },
      global: { stubs: { USelect: { props: ["modelValue", "items"], emits: ["update:modelValue"], template: '<select aria-label="选择地图" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>' } } },
    });
    await wrapper.get('select[aria-label="选择地图"]').setValue("map-1");
    expect(wrapper.get(".eyebrow").text()).toBe("始终可提交");
    expect(wrapper.text()).toContain("即将结束");
    expect(wrapper.text()).toContain("26.0713.2");
    expect(wrapper.get(".objective-button").attributes("disabled")).toBeUndefined();
  });
});
