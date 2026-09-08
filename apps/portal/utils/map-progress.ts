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

export type MapProgressTitle = {
  grantId: string;
  titleKey: string;
  scope: "global" | "map";
  mapId?: string;
  gameplayRevisionId?: string;
  mapName?: string;
  slot?: "pioneer" | "conqueror" | "dominator";
};

export type MapProgressProfile = {
  mapId: string;
  gameplayRevisionId?: string;
  totalXp: number;
  verifiedRunCount: number;
  lowestDeaths: number | null;
  fewestSkips: number | null;
  highestCompletedDifficulty: string | null;
  recentRuns: Array<{ acceptedAt: number }>;
};

export type MapProgressRow = {
  map: MapProgressMap;
  gameplayRevisionId: string | null;
  challenges: MapProgressChallenge[];
  earnedChallenges: MapProgressChallenge[];
  profile: MapProgressProfile | null;
};

export function buildMapProgressRows(input: {
  maps: MapProgressMap[];
  challenges: MapProgressChallenge[];
  titles: MapProgressTitle[];
  profiles: MapProgressProfile[];
}): MapProgressRow[] {
  const rows = input.maps.map((map): MapProgressRow => {
    const gameplayRevisionId = map.defaultGameplayRevisionId ?? null;
    const challenges = input.challenges.filter((challenge) =>
      challenge.mapId === map.mapId
      && challenge.gameplayRevisionId === gameplayRevisionId
      && Boolean(challenge.titleKey),
    );
    const earnedChallenges = challenges.filter((challenge) => input.titles.some((title) =>
      title.scope === "map"
      && title.mapId === map.mapId
      && title.gameplayRevisionId === gameplayRevisionId
      && title.titleKey === challenge.titleKey,
    ));
    const profile = input.profiles.find((candidate) =>
      candidate.mapId === map.mapId
      && candidate.gameplayRevisionId === gameplayRevisionId,
    ) ?? null;
    return { map, gameplayRevisionId, challenges, earnedChallenges, profile };
  });

  const rank = (row: MapProgressRow) => {
    if (!row.challenges.length) return 2;
    if (row.earnedChallenges.length === row.challenges.length) return 3;
    if (row.earnedChallenges.length) return 1;
    return 0;
  };
  return rows.sort((left, right) => rank(left) - rank(right) || left.map.mapName.localeCompare(right.map.mapName, "zh-CN") || left.map.mapId.localeCompare(right.map.mapId));
}
