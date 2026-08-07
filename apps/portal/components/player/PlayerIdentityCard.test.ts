import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import PlayerIdentityCard from "./PlayerIdentityCard.vue";

describe("PlayerIdentityCard", () => {
  it("renders the battle tag identity without a standalone binding-status region", async () => {
    const wrapper = await mountSuspended(PlayerIdentityCard, {
      props: { playerName: "测试玩家", playerId: "1001" },
    });

    expect(wrapper.text()).toContain("战网 ID");
    expect(wrapper.text()).toContain("测试玩家");
    // The authenticated player-center state already proves the QQ binding;
    // the card must not repeat it in a dedicated identity-status block.
    expect(wrapper.find(".identity-status").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("已绑定");
    expect(wrapper.text()).not.toContain("QQ 绑定");
  });
});
