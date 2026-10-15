import type { AdminSeason, SeasonPhase } from "@owbastion/contracts";
import { seasonsOverlap } from "@owbastion/domain";

const DAY = 86_400_000;
const BEIJING_OFFSET = 8 * 3_600_000;
const inBeijing = (value: number) => new Date(value + BEIJING_OFFSET);

export const seasonPhaseLabel: Record<SeasonPhase, string> = { draft: "草稿", scheduled: "已排期", running: "进行中", ended: "已结束" };

export const seasonDateInput = (value: number) => inBeijing(value).toISOString().slice(0, 10);
export const seasonDateFromInput = (value: string, endOfDay = false) => Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`);
export const formatSeasonDate = (value: number) => { const date = inBeijing(value); return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`; };
export const formatSeasonShortDate = (value: number) => { const date = inBeijing(value); return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`; };
export const seasonWeeks = (season: { startsAt: number; endsAt: number }) => Math.max(1, Math.round((season.endsAt - season.startsAt) / (7 * DAY)));
export const daysLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / DAY));

export const seasonOverview = (seasons: AdminSeason[], now: number) => ({
  running: seasons.find((season) => season.phase === "running"),
  upcoming: seasons.filter((season) => season.startsAt > now && season.phase !== "ended").sort((a, b) => a.startsAt - b.startsAt)[0],
});

// Operational nudges: no season queued after the running one, a gap between
// them, or the next one still a draft shortly before its start.
export const seasonAlerts = (seasons: AdminSeason[], now: number) => {
  const { running, upcoming } = seasonOverview(seasons, now);
  if (!running) return [];
  if (!upcoming) return [`${running.name}结束后还没有安排下一个赛季`];
  const alerts: string[] = [];
  const gap = Math.round((upcoming.startsAt - running.endsAt) / DAY);
  if (gap > 1) alerts.push(`${running.name}结束到${upcoming.name}开始之间空了 ${gap} 天，期间排行榜只有全部时间`);
  if (upcoming.phase === "draft" && upcoming.startsAt - now < 60 * DAY) alerts.push(`${upcoming.name}还是草稿，${daysLeft(upcoming.startsAt, now)} 天后就到开始时间`);
  return alerts;
};

export const seasonTimeline = (seasons: AdminSeason[], now: number) => {
  if (!seasons.length) return null;
  const low = Math.min(...seasons.map((season) => season.startsAt)) - 7 * DAY;
  const high = Math.max(...seasons.map((season) => season.endsAt), now) + 7 * DAY;
  const percent = (value: number) => ((value - low) / (high - low)) * 100;
  const months: Array<{ label: string; left: number }> = [];
  const cursor = inBeijing(low);
  let month = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1) - BEIJING_OFFSET;
  while (month < high) {
    months.push({ label: `${inBeijing(month).getUTCMonth() + 1}月`, left: percent(month) });
    const next = inBeijing(month);
    month = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1) - BEIJING_OFFSET;
  }
  return {
    today: percent(now),
    months,
    blocks: seasons.map((season) => ({
      seasonId: season.seasonId,
      name: season.name,
      left: percent(season.startsAt),
      width: percent(season.endsAt) - percent(season.startsAt),
      tone: season.phase === "draft" ? "draft" : season.phase === "ended" ? "ended" : "active",
    })),
  };
};

export const seasonWriteIssue = (draft: { name: string; startsAt: number; endsAt: number }, others: AdminSeason[]) => {
  if (!draft.name.trim()) return "需要一个名称";
  if (draft.endsAt <= draft.startsAt) return "结束日期要晚于开始日期";
  const clash = others.find((season) => seasonsOverlap(season, draft));
  return clash ? `和${clash.name}（${formatSeasonShortDate(clash.startsAt)} – ${formatSeasonShortDate(clash.endsAt)}）时间重叠` : "";
};

export const seasonErrorMessages: Record<string, string> = {
  SEASON_NOT_FOUND: "这个赛季已不存在，请刷新后重试。",
  SEASON_RANGE_INVALID: "结束日期要晚于开始日期，已发布的赛季还需要在未来结束。",
  SEASON_OVERLAP: "赛季时间不能和其他赛季重叠。",
  SEASON_STARTED: "已经开始的赛季不能修改开始日期，也不能退回草稿。",
  SEASON_ENDED: "已结束的赛季不能再修改。",
  SEASON_NOT_RUNNING: "只有进行中的赛季可以提前结束。",
};
