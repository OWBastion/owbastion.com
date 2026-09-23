import { mountSuspended } from "@nuxt/test-utils/runtime";
import { describe, expect, it } from "vitest";
import PlayerIdentityCard from "./PlayerIdentityCard.vue";

describe("PlayerIdentityCard", () => {
  it("renders the player's battle tag identity", async () => {
    const wrapper = await mountSuspended(PlayerIdentityCard, {
      props: { playerName: "测试玩家", playerId: "1001" },
    });

    expect(wrapper.text()).toContain("战网 ID");
    expect(wrapper.text()).toContain("测试玩家");
  });
});
