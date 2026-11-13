import { describe, expect, it } from "vitest";
import { remainingLabel } from "./active-challenge";

describe("remainingLabel", () => {
  const now = 1_000_000;
  it("counts minutes under an hour, hours under a day, otherwise days", () => {
    expect(remainingLabel(now + 30 * 60_000, now)).toBe("剩 30 分钟");
    expect(remainingLabel(now + 61 * 60_000, now)).toBe("剩 2 小时");
    expect(remainingLabel(now + 18 * 3_600_000, now)).toBe("剩 18 小时");
    expect(remainingLabel(now + 25 * 3_600_000, now)).toBe("剩 2 天");
  });
  it("never shows less than one minute", () => {
    expect(remainingLabel(now + 1, now)).toBe("剩 1 分钟");
  });
});
