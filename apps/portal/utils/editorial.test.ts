import { describe, expect, it } from "vitest";
import { formatRelativeCalendarDay } from "./editorial";

describe("formatRelativeCalendarDay", () => {
  const releasedAt = "2026-08-01T00:00:00.000Z";

  it("labels a release before the local calendar day as 天前", () => {
    expect(formatRelativeCalendarDay(releasedAt, {
      now: new Date("2026-08-04T09:00:00.000+08:00"),
      timeZone: "Asia/Shanghai",
    })).toBe("3 天前");
  });

  it("labels a release on the local calendar day as 就在今天", () => {
    expect(formatRelativeCalendarDay(releasedAt, {
      now: new Date("2026-08-01T23:30:00.000+08:00"),
      timeZone: "Asia/Shanghai",
    })).toBe("就在今天");
  });

  it("labels a release after the local calendar day as 天后", () => {
    expect(formatRelativeCalendarDay(releasedAt, {
      now: new Date("2026-07-30T18:00:00.000+08:00"),
      timeZone: "Asia/Shanghai",
    })).toBe("2 天后");
  });

  it("compares calendar days rather than elapsed 24-hour periods", () => {
    expect(formatRelativeCalendarDay(releasedAt, {
      now: new Date("2026-08-01T22:00:00.000+08:00"),
      timeZone: "Asia/Shanghai",
    })).toBe("就在今天");
    expect(formatRelativeCalendarDay(releasedAt, {
      now: new Date("2026-08-02T00:30:00.000+08:00"),
      timeZone: "Asia/Shanghai",
    })).toBe("1 天前");
  });

  it("uses the viewer timezone at a UTC day boundary", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(formatRelativeCalendarDay(releasedAt, {
      now,
      timeZone: "America/New_York",
    })).toBe("1 天后");
    expect(formatRelativeCalendarDay(releasedAt, {
      now,
      timeZone: "Asia/Shanghai",
    })).toBe("就在今天");
  });
});
