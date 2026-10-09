import { describe, expect, it } from "vitest";
import { editorialText, editorialToc, formatRelativeCalendarDay, readingMinutes } from "./editorial";

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

describe("editorial reading helpers", () => {
  it("collects the visible text of both content tree shapes", () => {
    expect(editorialText({ type: "root", children: [{ type: "element", children: [{ type: "text", value: "你好" }] }] }).trim()).toBe("你好");
    expect(editorialText({ type: "minimark", value: [["p", {}, "第一段"], ["ul", {}, ["li", {}, "项目"]]] })).toContain("第一段");
    expect(editorialText(null)).toBe("");
  });

  it("counts Chinese by character and other text by word, never below one minute", () => {
    expect(readingMinutes("短")).toBe(1);
    expect(readingMinutes("字".repeat(1200))).toBe(3);
    expect(readingMinutes("word ".repeat(440))).toBe(2);
  });

  it("flattens the h2 and h3 headings into a contents list", () => {
    const body = { toc: { links: [{ id: "a", text: "甲", depth: 2, children: [{ id: "a1", text: "甲一", depth: 3 }, { id: "a2", text: "甲二", depth: 4 }] }, { id: "b", text: "乙", depth: 2 }] } };
    expect(editorialToc(body)).toEqual([{ id: "a", text: "甲", depth: 2 }, { id: "a1", text: "甲一", depth: 3 }, { id: "b", text: "乙", depth: 2 }]);
    expect(editorialToc(undefined)).toEqual([]);
  });
});
