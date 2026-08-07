import { mountSuspended } from "@nuxt/test-utils/runtime";
import { flushPromises } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { AdminPlayerDetail } from "~/composables/useAdminApi";
import AdminPlayerDetail from "./AdminPlayerDetail.vue";

const player: AdminPlayerDetail = {
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
        AdminPlayerTitles: { template: "<div data-testid='titles' />" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("AdminPlayerDetail", () => {
  it("identifies the player directly without decorative eyebrow/kicker layers", async () => {
    const wrapper = await mountDetail();

    expect(wrapper.text()).toContain("测试玩家#1001");
    expect(wrapper.find(".card-kicker").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("Activity");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("平台玩家");
    expect(wrapper.find(".detail-card--activity h3").text()).toBe("最近提交");
  });

  it("consolidates duplicated summary/detail facts while keeping scan counts and actions", async () => {
    const wrapper = await mountDetail();

    // Scan counts stay in the overview strip; the update timestamp lives only in the detail grid.
    expect(wrapper.find(".identity-card__metrics").text()).toContain("有效称号");
    expect(wrapper.find(".identity-card__metrics").text()).toContain("最近提交");
    expect(wrapper.find(".identity-card__metrics").text()).toContain("QQ 绑定");
    expect(wrapper.text().match(/最近更新/g)?.length).toBe(1);

    // The account ID is a detail fact, not repeated inline next to the battle tag.
    expect(wrapper.text()).not.toContain("账号 ID ·");
    expect(wrapper.text().match(/平台账号 ID/g)?.length).toBe(1);

    // QQ binding: one scan count plus the actionable records — no extra heading badge.
    expect(wrapper.find(".bindings-inline__heading").text()).toBe("QQ 绑定");
    expect(wrapper.findAll("button").some((button) => button.text().includes("解绑"))).toBe(true);

    // The recent-submissions list is self-evident next to its rows; no repeated count badge.
    expect(wrapper.find(".detail-card--activity").text()).not.toContain("条");
  });
});
