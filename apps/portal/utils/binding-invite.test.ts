import { describe, expect, it } from "vitest";
import { bindingInviteCopyText } from "./binding-invite";

describe("binding invitation links", () => {
  it("puts the one-time invitation code in the administrator link", () => {
    const text = bindingInviteCopyText("ABCDEFGHIJKL", "https://owbastion.com");
    expect(text).toContain("https://owbastion.com/bind?code=ABCDEFGHIJKL");
    expect(text).not.toContain("playerName");
    expect(text).not.toContain("playerId");
  });
});
