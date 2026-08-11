export type AchievementStatus = "scheduled" | "active" | "sunsetting" | "retired";

export type TitleAchievement = {
  challengeId: string;
  family: "achievement";
  type: "title_achievement";
  titleKey: string;
  titleName: string;
  icon: string;
  iconUrl?: string | null;
  category: string;
  categoryOverride: string | null;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  scope?: "global" | "map";
  mapIds?: string[];
  mapVariant?: "classic";
};

export type MapAchievement = {
  challengeId: string;
  family: "map";
  gameplayRevisionId: string;
  type: "map_completion";
  kind?: "difficulty_completion" | "pioneer" | "classic_completion" | "map_title_achievement";
  titleKey?: string;
  name: string;
  mapId: string;
  mapName: string;
  difficulty?: string;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  status: AchievementStatus;
  gameVersion: string;
  introducedVersion: string;
  retiredVersion: string | null;
  mapVariant?: "classic";
  mapTitleRule?: { ruleId: string; kind: string; displayKind: "fixed" | "map_pioneer" | "map_name_suffix"; slot: "pioneer" | "conqueror" | "dominator" | null; dynamic: boolean };
};

export type CatalogTitle = {
  challengeId: string;
  family: "title_catalog";
  type: "title_catalog";
  titleKey: string;
  titleName: string;
  icon: string;
  iconUrl?: string | null;
  category: string;
  categoryOverride?: string | null;
  condition: string;
  evidenceRule?: string;
  submissionMode?: "manual" | "automatic";
  startsAt?: number | null;
  endsAt?: number | null;
  retiredVersion?: string | null;
  availability: "active" | "retired";
  scope: "global" | "map";
  displayKind: "fixed" | "map_pioneer" | "map_name_suffix";
  color?: { kind: "heroColor"; index: number } | { kind: "rgb"; value: [number, number, number] } | { kind: "palette"; name: "orange" | "red" | "purple" | "gold" | "blue" } | null;
  status: AchievementStatus;
  gameVersion: string;
  hasChallenge: false;
};

export type AdminAchievement = TitleAchievement | MapAchievement | CatalogTitle;
export type AdminMap = { mapId: string; mapName: string };
export type StatusTone = "default" | "info" | "success" | "warning" | "error";

export const isTitle = (item: AdminAchievement): item is TitleAchievement | CatalogTitle => item.family === "achievement" || item.family === "title_catalog";
export const isChallengeTitle = (item: AdminAchievement): item is TitleAchievement => item.family === "achievement";
export const isMap = (item: AdminAchievement): item is MapAchievement => item.family === "map";
export const isCatalog = (item: AdminAchievement): item is CatalogTitle => item.family === "title_catalog";
export const isDeveloperOnly = (item: CatalogTitle) => item.category === "开发保留";
export const itemIdentity = (item: AdminAchievement) => isMap(item) ? `${item.mapId}:${item.challengeId}:${item.gameplayRevisionId}` : item.challengeId;
export const itemName = (item: AdminAchievement) => isTitle(item) ? item.titleName : item.name;
export const DEFAULT_EVIDENCE_RULE = "上传包含结算画面、称号条件与玩家信息的完整截图。";

/** Canonical player/admin lifecycle labels for challenge-like entities. */
export const achievementStatusLabel = (status: AchievementStatus) =>
  status === "scheduled" ? "未开放"
    : status === "active" ? "已开放"
      : status === "sunsetting" ? "即将结束"
        : "已下线";

export const achievementStatusTone = (status: AchievementStatus): StatusTone =>
  status === "active" ? "success"
    : status === "scheduled" ? "info"
      : status === "sunsetting" ? "warning"
        : "default";
