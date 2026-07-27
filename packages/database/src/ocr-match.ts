export type OcrMatchInput = {
  challengeType: string;
  targetMapName: string;
  targetDifficulty: string | null;
  targetPlayerName: string | null;
  mapName?: string | null;
  difficulty?: string | null;
  challengeCompleted?: boolean | null;
  player?: string | null;
  titleName?: string | null;
  achievementTitles?: string[];
};

export type OcrMatch = {
  map: boolean;
  difficulty: boolean;
  completed: boolean;
  player: boolean;
  title: boolean;
  skipped: Array<"map" | "difficulty">;
};

const normalized = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

export const matchOcrResult = (input: OcrMatchInput): OcrMatch => {
  const isTitleChallenge = input.challengeType === "title_achievement";
  const match = {
    map: isTitleChallenge || normalized(input.mapName) === normalized(input.targetMapName),
    difficulty: isTitleChallenge || normalized(input.difficulty) === normalized(input.targetDifficulty),
    completed: input.challengeCompleted === true,
    player: normalized(input.player).split("#")[0] === normalized(input.targetPlayerName).split("#")[0],
    title: !isTitleChallenge || (input.achievementTitles ?? []).some((title) => normalized(title) === normalized(input.titleName)),
  };
  return { ...match, skipped: isTitleChallenge ? ["map", "difficulty"] : [] };
};
