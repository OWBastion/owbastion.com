import { mountSuspended, mockNuxtImport } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import VerifiedRunsPage from "./index.vue";

const run = {
  runId: "00000000-0000-4000-8000-000000000001",
  playerAccountId: "00000000-0000-4000-8000-000000000002",
  playerId: "1234",
  playerName: "Tester",
  sourceSubmissionId: "00000000-0000-4000-8000-000000000003",
  mapId: "map.test",
  mapName: "测试地图",
  gameplayRevisionId: "revision:map.test:initial",
  gameplayRevisionLifecycle: "default" as const,
  mapVariant: null,
  difficulty: "困难" as const,
  gameVersion: "26.0810.1",
  matchCode: "1234-5678-9012",
  completionDurationSeconds: 600,
  deaths: 1,
  skips: 0,
  eventCounters: {},
  acceptanceSource: "submission_review" as const,
  acceptedAt: 1,
  status: "active" as const,
  invalidatedAt: null,
  invalidatedBy: null,
  invalidationReason: null,
  xpRuleVersion: "v1" as const,
  xpInputSnapshot: { ruleVersion: "v1" as const, baseDifficultyXp: 225, mapFactor: 1, performanceBonus: 11, performanceBonusReasons: ["no_skips" as const], challengeBonus: 0 },
  awardedXp: 236,
  conflictCount: 1,
};
const detail = {
  contractVersion: "1" as const,
  run,
  projection: { mapId: "map.test", gameplayRevisionId: "revision:map.test:initial", totalXp: 236, verifiedRunCount: 1, difficultyStats: [], lowestDeaths: 1, fewestSkips: 0, highestSingleRunXp: 236, highestCompletedDifficulty: "困难" as const },
  sourceSubmission: { submissionId: run.sourceSubmissionId, status: "approved", challengeId: "", challenge: null, mapName: "测试地图", difficulty: "困难", playerAccountId: run.playerAccountId, playerName: run.playerName, createdAt: 1, updatedAt: 2, ocrStatus: "matched" as const, ocrAttempt: 1, ocrErrorCode: null, ocr: null, evidenceUrl: null },
  lifecycle: [{ transition: "accepted" as const, actorType: "service" as const, actorId: "submission_review", reason: null, createdAt: 1 }],
  corrections: [],
  conflicts: [],
};
const route = reactive({ query: {} as Record<string, string> });
const adminApi = vi.fn((path: string) => {
  if (path.startsWith("/v1/verified-runs?")) return Promise.resolve({ items: [run], total: 1 });
  if (path === `/v1/verified-runs/${run.runId}`) return Promise.resolve(detail);
  throw new Error(`Unexpected request: ${path}`);
});
mockNuxtImport("useRoute", () => () => route);
mockNuxtImport("useAdminApi", () => () => adminApi);
mockNuxtImport("useToast", () => () => ({ add: vi.fn() }));

const stubs = {
  StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" },
  NuxtLink: { props: ["to"], template: "<a :href=\"to\"><slot /></a>" },
  AdminResponsiveDialog: { template: "<div><slot name=\"body\" /><slot name=\"footer\" /></div>" },
  USelect: {
    props: ["modelValue", "items"],
    emits: ["update:modelValue"],
    template: `<select :value="JSON.stringify(modelValue)" @change="$emit('update:modelValue', JSON.parse($event.target.value))"><option v-for="item in items" :key="JSON.stringify(item.value)" :value="JSON.stringify(item.value)">{{ item.label }}</option></select>`,
  },
};

describe("admin verified runs page", () => {
  it("loads a document-flow admin list, filters by run code, and opens maintainer detail", async () => {
    adminApi.mockClear();
    route.query = {};
    const wrapper = await mountSuspended(VerifiedRunsPage, { attachTo: document.body, global: { stubs } });
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith("/v1/verified-runs?page=1&pageSize=20");
    expect(wrapper.find('input[aria-label="按通关码筛选"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("测试地图");
    expect(wrapper.text()).toContain("1234-5678-9012");

    await wrapper.find('input[aria-label="按通关码筛选"]').setValue("1234-5678-9012");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith("/v1/verified-runs?page=1&pageSize=20&matchCode=1234-5678-9012");

    await wrapper.findAll("button").find((button) => button.text() === "详情")!.trigger("click");
    await flushPromises();
    expect(adminApi).toHaveBeenCalledWith(`/v1/verified-runs/${run.runId}`);
    expect(wrapper.text()).toContain("经验规则与地图档案");
    wrapper.unmount();
  });

  it("opens with player and unresolved-conflict filters from a deep link", async () => {
    adminApi.mockClear();
    route.query = { playerAccountId: run.playerAccountId, unresolvedConflictsOnly: "true" };
    const wrapper = await mountSuspended(VerifiedRunsPage, { global: { stubs } });
    await flushPromises();

    expect(adminApi).toHaveBeenCalledWith(`/v1/verified-runs?page=1&pageSize=20&playerAccountId=${run.playerAccountId}&unresolvedConflictsOnly=true`);
    expect(wrapper.find('select[aria-label="筛选冲突状态"]').element.value).toBe("true");
    wrapper.unmount();
  });
});
