import { normalizeGameMode } from "./gameplay-revision";
export type ChallengeCondition =
  | { type: "achievement_title"; titleKey: string }
  | { type: "map"; mapId: string }
  | { type: "completed" }
  | { type: "difficulty_at_least"; difficulty: string }
  | { type: "map_variant"; variant: "classic" }
  // Without mapIds the rule follows every map of its standalone mode.
  | { type: "required_maps_completed"; mapIds?: string[]; difficultyAtLeast?: string; mode?: string };

export type ChallengeProgressRule = Extract<ChallengeCondition, { type: "required_maps_completed" }>;

export const parseChallengeProgressRule = (value: unknown): ChallengeProgressRule | null => {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed) as unknown; } catch { return null; }
  }
  const condition = parseCondition(parsed);
  return condition?.type === "required_maps_completed" ? condition : null;
};

export type CanonicalChallengeConditions = {
  operator: "and" | "or";
  conditions: ChallengeCondition[];
};

export type ChallengeEvidence = {
  mapId?: string | null;
  difficulty?: string | null;
  completed?: boolean | null;
  mapVariant?: string | null;
  achievementTitles?: readonly string[];
  achievementPanelText?: string | null;
};

export type ChallengeConditionEvaluation = {
  supported: boolean;
  matched: boolean;
  requiredFields: string[];
};

const difficultyLevels = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;
const normalized = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

const parseCondition = (value: unknown): ChallengeCondition | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const condition = value as Record<string, unknown>;
  switch (condition.type) {
    case "achievement_title": return typeof condition.titleKey === "string" && condition.titleKey.trim() ? { type: condition.type, titleKey: condition.titleKey } : null;
    case "map": return typeof condition.mapId === "string" && condition.mapId.trim() ? { type: condition.type, mapId: condition.mapId } : null;
    case "completed": return { type: condition.type };
    case "difficulty_at_least": return typeof condition.difficulty === "string" && condition.difficulty.trim() ? { type: condition.type, difficulty: condition.difficulty } : null;
    case "map_variant": return condition.variant === "classic" ? { type: condition.type, variant: condition.variant } : null;
    case "required_maps_completed": {
      const mode = typeof condition.mode === "string" ? normalizeGameMode(condition.mode) : null;
      const mapIds = Array.isArray(condition.mapIds) ? [...new Set(condition.mapIds.filter((mapId): mapId is string => typeof mapId === "string" && Boolean(mapId.trim())))] : [];
      if (!mapIds.length && !mode) return null;
      return { type: condition.type, ...(mapIds.length ? { mapIds } : {}), ...(typeof condition.difficultyAtLeast === "string" && condition.difficultyAtLeast.trim() ? { difficultyAtLeast: condition.difficultyAtLeast } : {}), ...(mode ? { mode } : {}) };
    }
    default: return null;
  }
};

export const parseCanonicalChallengeConditions = (value: string | unknown): CanonicalChallengeConditions | null => {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) as unknown; } catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if ((record.operator !== "and" && record.operator !== "or") || !Array.isArray(record.conditions) || record.conditions.length === 0) return null;
  const conditions = record.conditions.map(parseCondition);
  if (conditions.some((condition) => condition === null)) return null;
  return { operator: record.operator, conditions: conditions as ChallengeCondition[] };
};

const matchesCheckedAchievementTitle = (panelText: string | null | undefined, titleName: string) => {
  const panel = normalized(panelText);
  const title = normalized(titleName);
  if (!panel || !title) return false;
  let offset = 0;
  while (offset < panel.length) {
    const index = panel.indexOf(title, offset);
    if (index < 0) return false;
    if (/^[\s:：\-—]*[✓✔√☑]/u.test(panel.slice(index + title.length))) return true;
    offset = index + title.length;
  }
  return false;
};

const matchesDifficulty = (actual: string | null | undefined, required: string) => {
  const normalizeDifficulty = (value: string | null | undefined) => {
    const label = normalized(value);
    return label.startsWith("地狱:") || label.startsWith("地狱：") ? "地狱" : label === "普通" ? "一般" : label;
  };
  const actualLabel = normalizeDifficulty(actual);
  const requiredLabel = normalizeDifficulty(required);
  const actualRank = difficultyLevels.indexOf(actualLabel as typeof difficultyLevels[number]);
  const requiredRank = difficultyLevels.indexOf(requiredLabel as typeof difficultyLevels[number]);
  return actualRank >= 0 && requiredRank >= 0 ? actualRank >= requiredRank : actualLabel !== "" && actualLabel === requiredLabel;
};

export const conditionFields: Record<ChallengeCondition["type"], string> = {
  achievement_title: "achievement_titles",
  map: "map_name",
  completed: "challenge_completed",
  difficulty_at_least: "difficulty",
  map_variant: "map_variant",
  required_maps_completed: "verified_runs",
};

export const difficultyAtLeastSatisfied = matchesDifficulty;

export const evaluateCanonicalChallengeConditions = (
  conditions: CanonicalChallengeConditions | null,
  evidence: ChallengeEvidence,
  titleNamesByKey: ReadonlyMap<string, string> = new Map(),
): ChallengeConditionEvaluation => {
  if (!conditions) return { supported: false, matched: false, requiredFields: [] };
  const results = conditions.conditions.map((condition) => {
    switch (condition.type) {
      case "achievement_title": {
        const titleName = titleNamesByKey.get(condition.titleKey);
        return Boolean(titleName && (
          evidence.achievementTitles?.some((title) => normalized(title) === normalized(titleName))
          || matchesCheckedAchievementTitle(evidence.achievementPanelText, titleName)
        ));
      }
      case "map": return evidence.mapId === condition.mapId;
      case "completed": return evidence.completed === true;
      case "difficulty_at_least": return matchesDifficulty(evidence.difficulty, condition.difficulty);
      case "map_variant": return evidence.mapVariant === condition.variant;
      case "required_maps_completed": return false;
    }
  });
  return {
    supported: true,
    matched: conditions.operator === "and" ? results.every(Boolean) : results.some(Boolean),
    requiredFields: [...new Set(conditions.conditions.map(({ type }) => conditionFields[type]))],
  };
};
