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
  pendingSubmissionCount: 2,
  updatedAt: 1700000000000,
  bindings: [{ bindingId: "binding-1", provider: "qq", groupOpenId: "group-1", memberOpenId: "member-1", createdAt: 0 }],
  recentCompletions: [{ completionId: "completion-1", challengeId: "challenge-1", titleKey: "TITLE_1", titleName: "测试称号", mapName: "花村", gameplayRevisionId: "revision-1", gameVersion: "2026.07.15", status: "active", sourceType: "manual", completedAt: 1700000000000 }],
  progression: { activeVerifiedRunCount: 2, recentVerifiedRuns: [{ runId: "run-1", mapName: "花村", gameplayRevisionId: "revision-1", gameVersion: "2026.07.15", difficulty: "困难", awardedXp: 120, acceptedAt: 1600000000000 }] },
  recentSubmissions: [{ submissionId: "submission-1", mapName: "成就挑战", status: "rejected", reason: "截图不完整", challenge: { family: "map", name: "花村 地狱", mapName: "花村", difficulty: "地狱", kind: "difficulty_completion" }, createdAt: 0, updatedAt: 1650000000000 }],
  titleGrants: [],
};

async function mountDetail(overrides: Partial<AdminPlayerDetailData> = {}) {
  const wrapper = await mountSuspended(AdminPlayerDetail, {
    props: { player: { ...player, ...overrides } },
    global: { stubs: { AdminPlayerTitles: { template: "<div>称号面板</div>" }, StatusBadge: { props: ["label"], template: "<span>{{ label }}</span>" } } },
  });
  await flushPromises();
  return wrapper;
}
const tab = (wrapper: Awaited<ReturnType<typeof mountDetail>>, label: string) => wrapper.findAll('[role="tab"]').find((item) => item.text() === label)!;

describe("AdminPlayerDetail", () => {
  it("summarises the player and flags pending reviews", async () => {
    const wrapper = await mountDetail();
    expect(wrapper.text()).toContain("测试玩家#1001");
    expect(wrapper.text()).toContain("2 次已核验通关");
    expect(wrapper.text()).toContain("有 2 条提交等待审核");
    expect(wrapper.text()).toContain("称号面板");
  });

  it("merges submissions, completions and runs into one concrete timeline", async () => {
    const wrapper = await mountDetail();
    await tab(wrapper, "动态").trigger("click");
    const items = wrapper.findAll(".timeline__item").map((item) => item.text());
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("获得称号：测试称号");
    expect(items[1]).toContain("花村 · 地狱 通关");
    expect(items[1]).toContain("原因：截图不完整");
    expect(items[1]).toContain("未通过");
    expect(items[2]).toContain("花村 · 困难 通关记录");
    expect(wrapper.text()).not.toContain("成就挑战");
  });

  it("shows account facts and emits actions", async () => {
    const wrapper = await mountDetail({ status: "banned" });
    expect(wrapper.text()).toContain("该玩家已被封禁");
    await tab(wrapper, "账号").trigger("click");
    expect(wrapper.text()).toContain("member-1");
    await wrapper.findAll("button").find((button) => button.text() === "解除绑定")!.trigger("click");
    expect(wrapper.emitted("unbind")).toEqual([["binding-1"]]);
    await wrapper.findAll("button").find((button) => button.text() === "解除封禁")!.trigger("click");
    expect(wrapper.emitted("setStatus")).toEqual([["active"]]);
  });
});
