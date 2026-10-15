import type { SeasonPhase, SeasonStatus } from "@owbastion/contracts";

export type SeasonWindow = { startsAt: number; endsAt: number };

// A Season's window includes both ends. A draft never ranks; an active or
// archived Season ends at `endsAt` automatically, with no stored transition.
export const seasonPhase = (season: SeasonWindow & { status: SeasonStatus }, now: number): SeasonPhase => {
  if (season.status === "draft") return "draft";
  if (season.status === "archived" || season.endsAt < now) return "ended";
  return season.startsAt > now ? "scheduled" : "running";
};

export const seasonsOverlap = (a: SeasonWindow, b: SeasonWindow) => a.startsAt <= b.endsAt && a.endsAt >= b.startsAt;
