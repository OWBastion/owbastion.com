import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { AdminPlayerDetail as AdminPlayerDetailData } from "~/composables/useAdminApi";
import AdminPlayerDetail from "./AdminPlayerDetail.vue";

const player: AdminPlayerDetailData = {
  playerAccountId: "account-1",
  playerId: "1001",
  playerName: "测试玩家",
  status: "active",
  bindingCount: 1,
  createdAt: 0,
  updatedAt: 1700000000000,
  bindings: [{ bindingId: "binding-1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", createdAt: 0 }],
  recentCompletions: [{ completionId: "completion-1", challengeId: "challenge-1", titleKey: "TITLE_1", titleName: "测试称号", mapName: "花村", gameplayRevisionId: "revision-1", gameVersion: "2026.07.15", status: "active", sourceType: "manual", completedAt: 1700000000000 }],
  progression: { activeVerifiedRunCount: 2, recentVerifiedRuns: [{ runId: "run-1", mapName: "花村", gameplayRevisionId: "revision-1", gameVersion: "2026.07.15", difficulty: "困难", awardedXp: 120, acceptedAt: 1700000000000 }] },
  recentSubmissions: [{ submissionId: "submission-1", mapName: "花村", challenge: null, status: "needs_review", createdAt: 0, updatedAt: 0 }],
  titleGrants: [],
};

async function mountDetail() {
  const wrapper = await mountSuspended(AdminPlayerDetail, {
    props: { player },
    global: {
      stubs: {
        AdminPlayerTitles: { template: "<div>称号</div>" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("AdminPlayerDetail", () => {
  it("shows the player identity, recent submissions, and title section", async () => {
    const wrapper = await mountDetail();

    expect(wrapper.text()).toContain("测试玩家#1001");
    expect(wrapper.text()).toContain("最近提交");
    expect(wrapper.text()).toContain("最近挑战完成");
    expect(wrapper.text()).toContain("测试称号");
    expect(wrapper.text()).toContain("管理员授予");
    expect(wrapper.text()).toContain("通关进度");
    expect(wrapper.text()).toContain("2 次已核验通关");
    expect(wrapper.text()).toContain("花村 · 困难");
    expect(wrapper.text()).toContain("称号");
  });

  it("shows account facts, bindings, and available actions", async () => {
    const wrapper = await mountDetail();

    expect(wrapper.text()).toContain("平台账号 ID");
    expect(wrapper.text()).toContain("QQ 绑定");
    expect(wrapper.findAll("button").some((button) => button.text().includes("解绑"))).toBe(true);
  });
});
