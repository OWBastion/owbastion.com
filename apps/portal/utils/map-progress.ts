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
    const catalog = input.challenges.filter((challenge) =>
      challenge.mapId === map.mapId
      && challenge.gameplayRevisionId === gameplayRevisionId
      && Boolean(challenge.titleKey),
    );
    // A title whose challenge left the open catalog (a closed Pioneer window)
    // stays earned: list it from the owned grant.
    const catalogKeys = new Set(catalog.map((challenge) => challenge.titleKey));
    const closed = gameplayRevisionId === null ? [] : input.titles
      .filter((title) => title.scope === "map" && title.mapId === map.mapId && title.gameplayRevisionId === gameplayRevisionId && !catalogKeys.has(title.titleKey))
      .map((title): MapProgressChallenge => ({ challengeId: `owned:${title.grantId}`, mapId: map.mapId, gameplayRevisionId, titleKey: title.titleKey, name: title.label, status: "active" }));
    const challenges = [...catalog, ...closed];
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
