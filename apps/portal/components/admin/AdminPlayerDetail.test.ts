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
  recentSubmissions: [{ submissionId: "submission-1", mapName: "花村", challenge: null, status: "ready_for_review", createdAt: 0, updatedAt: 0 }],
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
    expect(wrapper.text()).toContain("称号");
  });

  it("shows account facts, bindings, and available actions", async () => {
    const wrapper = await mountDetail();

    expect(wrapper.text()).toContain("平台账号 ID");
    expect(wrapper.text()).toContain("QQ 绑定");
    expect(wrapper.findAll("button").some((button) => button.text().includes("解绑"))).toBe(true);
  });
});
