import type { OwnedTitle } from "~/types/title";

export type AchievementState = "equipped" | "obtained" | "none";

export function achievementState(title: OwnedTitle | undefined): AchievementState {
  if (!title) return "none";
  return title.equipped ? "equipped" : "obtained";
}

export function findOwnedTitle(titles: OwnedTitle[] | undefined, match: { titleKey: string; mapId?: string; gameplayRevisionId?: string }) {
  return titles?.find((title) => title.titleKey === match.titleKey
    && (match.mapId === undefined
      ? title.scope === "global"
      : title.scope === "map" && title.mapId === match.mapId && title.gameplayRevisionId === match.gameplayRevisionId));
}
