import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import { createAdminVerifiedRun } from "~/tests/fixtures/admin-verified-run";
import AdminVerifiedRunCorrectionForm from "./AdminVerifiedRunCorrectionForm.vue";

const run = createAdminVerifiedRun({ performanceBonus: 0.05, conflictCount: 0 });

const mountForm = () => mountSuspended(AdminVerifiedRunCorrectionForm, {
  props: { run, maps: [{ mapId: "map.test", mapName: "测试地图" }], events: [{ eventId: "event.alpha", name: "测试事件" }] },
  global: {
    stubs: {
      UAlert: true,
      UFormField: { props: ["label"], template: "<label><span>{{ label }}</span><slot /></label>" },
      UInput: { props: ["modelValue"], emits: ["update:modelValue"], template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
      USelect: true,
      UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: `<textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
      UButton: { props: ["label", "type"], emits: ["click"], template: `<button :type="type || 'button'" @click="$emit('click')">{{ label }}</button>` },
    },
  },
});

describe("AdminVerifiedRunCorrectionForm", () => {
  it("submits normalized facts without requiring a justification and preserves nullable settlement values", async () => {
    const wrapper = await mountForm();

    await wrapper.findAll("label").find((label) => label.text().includes("测试事件"))!.get("input").setValue("3");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("submit")).toEqual([[
      {
        changes: {
          mapId: "map.test",
          gameplayRevisionId: "revision:map.test:initial",
          difficulty: "困难",
          gameVersion: "26.0810.1",
          matchCode: "1234-5678-9012",
          completionDurationSeconds: 600,
          deaths: 1,
          skips: 0,
          eventCounters: { "event.alpha": 3 },
        },
      },
    ]]);
  });

  it("drops a removed event row from the emitted event counters", async () => {
    const wrapper = await mountForm();

    await wrapper.findAll("button").find((button) => button.text() === "移除")!.trigger("click");
    expect(wrapper.text()).not.toContain("测试事件");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.emitted("submit")![0]![0]).toMatchObject({ changes: { eventCounters: {} } });
  });
});
