import type { OwnedTitle } from "~/types/title";
import { findOwnedTitle } from "./achievement-status";

export type MapProgressMap = {
  mapId: string;
  mapName: string;
  defaultGameplayRevisionId?: string | null;
};

export type MapProgressChallenge = {
  challengeId: string;
  mapId: string;
  gameplayRevisionId: string;
  titleKey?: string;
  name: string;
  status: "active" | "sunsetting";
};

export type MapProgressRow = {
  map: MapProgressMap;
  gameplayRevisionId: string | null;
  challenges: MapProgressChallenge[];
  earnedChallenges: MapProgressChallenge[];
};

export function buildMapProgressRows(input: {
  maps: MapProgressMap[];
  challenges: MapProgressChallenge[];
  titles: OwnedTitle[];
}): MapProgressRow[] {
  const rows = input.maps.map((map): MapProgressRow => {
    const gameplayRevisionId = map.defaultGameplayRevisionId ?? null;
    const challenges = input.challenges.filter((challenge) =>
      challenge.mapId === map.mapId
      && challenge.gameplayRevisionId === gameplayRevisionId
      && Boolean(challenge.titleKey),
    );
    const earnedChallenges = challenges.filter((challenge) => Boolean(findOwnedTitle(input.titles, {
      titleKey: challenge.titleKey!,
      mapId: map.mapId,
      gameplayRevisionId: gameplayRevisionId ?? "",
    })));
    return { map, gameplayRevisionId, challenges, earnedChallenges };
  });

  const rank = (row: MapProgressRow) => {
    if (!row.challenges.length) return 2;
    if (row.earnedChallenges.length === row.challenges.length) return 3;
    if (row.earnedChallenges.length) return 1;
    return 0;
  };
  return rows.sort((left, right) => rank(left) - rank(right) || left.map.mapName.localeCompare(right.map.mapName, "zh-CN") || left.map.mapId.localeCompare(right.map.mapId));
}
