export type OcrMatchInput = {
  challengeType: string;
  targetMapName: string;
  targetDifficulty: string | null;
  targetPlayerName: string | null;
  mapName?: string | null;
  difficulty?: string | null;
  challengeCompleted?: boolean | null;
  player?: string | null;
  mapVariant?: string | null;
  requiredMapVariant?: string | null;
  titleName?: string | null;
  achievementTitles?: string[];
  achievementPanelText?: string | null;
};

export type OcrMatch = {
  map: boolean;
  difficulty: boolean;
  completed: boolean;
  player: boolean;
  variant: boolean;
  achievement: boolean;
  skipped: Array<"map" | "difficulty">;
};

const normalized = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

const matchesMapVariant = (recognized: string | null | undefined, required: string | null | undefined) => {
  const recognizedVariant = normalized(recognized);
  const requiredVariant = normalized(required);
  return requiredVariant ? recognizedVariant === requiredVariant : recognizedVariant === "";
};

const difficultyLevels = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;

const normalizedDifficulty = (value: string | null | undefined) => {
  const label = normalized(value);
  return label.startsWith("地狱:") || label.startsWith("地狱：") ? "地狱" : label === "普通" ? "一般" : label;
};

export const difficultyRank = (value: string | null | undefined) => difficultyLevels.indexOf(normalizedDifficulty(value) as typeof difficultyLevels[number]);

export const difficultyCovers = (actual: string | null | undefined, target: string | null | undefined) => {
  const actualIndex = difficultyRank(actual);
  const targetIndex = difficultyRank(target);
  return actualIndex >= 0 && targetIndex >= 0 ? actualIndex >= targetIndex : normalizedDifficulty(actual) === normalizedDifficulty(target);
};

const panelContainsCheckedTitle = (panelText: string | null | undefined, titleName: string | null | undefined) => {
  const panel = normalized(panelText);
  const title = normalized(titleName);
  if (!panel || !title) return false;
  let offset = 0;
  while (offset < panel.length) {
    const index = panel.indexOf(title, offset);
    if (index < 0) return false;
    const suffix = panel.slice(index + title.length);
    if (/^[\s:：\-—]*[✓✔√☑]/u.test(suffix)) return true;
    offset = index + title.length;
  }
  return false;
};

export const matchAchievementEvidence = (titleName: string | null | undefined, achievementTitles: string[] = [], achievementPanelText?: string | null) => {
  const expected = normalized(titleName);
  if (!expected) return true;
  if (achievementTitles.some((title) => normalized(title) === expected)) return true;
  return panelContainsCheckedTitle(achievementPanelText, titleName);
};

export const matchOcrResult = (input: OcrMatchInput): OcrMatch => {
  const isTitleChallenge = input.challengeType === "title_achievement";
  const isMapTitleChallenge = input.challengeType === "map_title_achievement";
  const match = {
    map: isTitleChallenge ? true : normalized(input.mapName) === normalized(input.targetMapName),
    difficulty: isTitleChallenge || !input.targetDifficulty ? true : difficultyCovers(input.difficulty, input.targetDifficulty),
    completed: input.challengeCompleted === true,
    player: normalized(input.player).split("#")[0] === normalized(input.targetPlayerName).split("#")[0],
    variant: isTitleChallenge
      ? true
      : matchesMapVariant(input.mapVariant, input.requiredMapVariant),
    achievement: isTitleChallenge ? matchAchievementEvidence(input.titleName, input.achievementTitles, input.achievementPanelText) : true,
  };
  return { ...match, skipped: isTitleChallenge ? ["map", "difficulty"] : isMapTitleChallenge && !input.targetDifficulty ? ["difficulty"] : [] };
};
