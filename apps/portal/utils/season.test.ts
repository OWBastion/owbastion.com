import { describe, expect, it } from "vitest";
import type { AdminSeason } from "@owbastion/contracts";
import { seasonAlerts, seasonDateFromInput, seasonDateInput, seasonTimeline, seasonWriteIssue } from "./season";

const DAY = 86_400_000;
const now = Date.parse("2026-10-15T12:00:00+08:00");
const season = (id: string, startsAt: number, endsAt: number, phase: AdminSeason["phase"], name = id): AdminSeason => ({
  seasonId: id, name, startsAt, endsAt, status: phase === "draft" ? "draft" : phase === "ended" ? "archived" : "active", public: true, phase, playerCount: 0, createdAt: 0, updatedAt: 0,
});

describe("season helpers", () => {
  it("converts date inputs in Beijing time with an inclusive end of day", () => {
    expect(seasonDateInput(Date.parse("2026-10-15T23:30:00+08:00"))).toBe("2026-10-15");
    expect(seasonDateFromInput("2026-10-15")).toBe(Date.parse("2026-10-15T00:00:00+08:00"));
    expect(seasonDateFromInput("2026-10-15", true)).toBe(Date.parse("2026-10-15T23:59:59.999+08:00"));
    expect(seasonDateInput(seasonDateFromInput("2026-10-15", true))).toBe("2026-10-15");
  });

  it("flags a missing next season, a gap, and a late draft", () => {
    const running = season("a", now - 30 * DAY, now + 10 * DAY, "running", "第二赛季");
    expect(seasonAlerts([running], now)).toEqual(["第二赛季结束后还没有安排下一个赛季"]);
    const draft = season("b", now + 20 * DAY, now + 60 * DAY, "draft", "第三赛季");
    expect(seasonAlerts([running, draft], now)).toEqual([
      "第二赛季结束到第三赛季开始之间空了 10 天，期间排行榜只有全部时间",
      "第三赛季还是草稿，20 天后就到开始时间",
    ]);
    expect(seasonAlerts([running, season("c", running.endsAt + 1, now + 60 * DAY, "scheduled")], now)).toEqual([]);
    expect(seasonAlerts([season("d", now - 60 * DAY, now - 30 * DAY, "ended")], now)).toEqual([]);
  });

  it("validates names, ranges, and overlaps before saving", () => {
    const other = season("a", now, now + 10 * DAY, "scheduled", "第二赛季");
    expect(seasonWriteIssue({ name: " ", startsAt: 1, endsAt: 2 }, [])).toBe("需要一个名称");
    expect(seasonWriteIssue({ name: "x", startsAt: 2, endsAt: 2 }, [])).toBe("结束日期要晚于开始日期");
    expect(seasonWriteIssue({ name: "x", startsAt: now + 10 * DAY, endsAt: now + 20 * DAY }, [other])).toContain("第二赛季");
    expect(seasonWriteIssue({ name: "x", startsAt: now + 10 * DAY + 1, endsAt: now + 20 * DAY }, [other])).toBe("");
  });

  it("places timeline blocks and today inside the visible range", () => {
    const timeline = seasonTimeline([season("a", now - 30 * DAY, now + 30 * DAY, "running")], now)!;
    expect(timeline.blocks[0]!.left).toBeGreaterThan(0);
    expect(timeline.blocks[0]!.left + timeline.blocks[0]!.width).toBeLessThan(100);
    expect(timeline.today).toBeGreaterThan(timeline.blocks[0]!.left);
    expect(timeline.months.length).toBeGreaterThan(1);
    expect(seasonTimeline([], now)).toBeNull();
  });
});
