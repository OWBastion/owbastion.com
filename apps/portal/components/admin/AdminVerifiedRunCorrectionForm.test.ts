import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import type { AdminVerifiedRun } from "~/composables/useAdminApi";
import AdminVerifiedRunCorrectionForm from "./AdminVerifiedRunCorrectionForm.vue";

const run: AdminVerifiedRun = {
  runId: "00000000-0000-4000-8000-000000000001",
  playerAccountId: "00000000-0000-4000-8000-000000000002",
  playerId: "1234",
  playerName: "Tester",
  sourceSubmissionId: "00000000-0000-4000-8000-000000000003",
  mapId: "map.test",
  mapName: "测试地图",
  gameplayRevisionId: "revision:map.test:initial",
  gameplayRevisionLifecycle: "default",
  mapVariant: null,
  difficulty: "困难",
  gameVersion: "26.0810.1",
  matchCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 1,
  skips: 0,
  eventCounters: { "event.alpha": 2 },
  acceptanceSource: "submission_review",
  acceptedAt: 1,
  status: "active",
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
  xpRuleVersion: "v1",
  xpInputSnapshot: { ruleVersion: "v1", baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 0.05, performanceBonusReasons: ["no_skips"], challengeBonus: 0 },
  awardedXp: 236,
  conflictCount: 0,
};

describe("AdminVerifiedRunCorrectionForm", () => {
  it("submits normalized facts without requiring a justification and preserves nullable settlement values", async () => {
    const wrapper = await mountSuspended(AdminVerifiedRunCorrectionForm, {
      props: { run },
      global: {
        stubs: {
          UAlert: true,
          UFormField: { props: ["label"], template: "<label><span>{{ label }}</span><slot /></label>" },
          UInput: { props: ["modelValue"], emits: ["update:modelValue"], template: `<input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
          USelect: true,
          UTextarea: { props: ["modelValue"], emits: ["update:modelValue"], template: `<textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />` },
          UButton: { props: ["label", "type"], template: `<button :type="type || 'button'">{{ label }}</button>` },
        },
      },
    });

    const textareas = wrapper.findAll("textarea");
    await textareas[0]!.setValue('{"event.alpha":3}');
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
});
