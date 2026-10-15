// Stored lifecycle for every challenge entity; scheduled/sunsetting/ended are
// derived from the window and announced retirement version, never stored.
export type ChallengeLifecycle = "draft" | "active" | "archived";
export type TitleLifecycle = "draft" | "active" | "retired";
// Derived obtainability computed by the API for title catalog rows.
export type TitleAvailability = "scheduled" | "active" | "sunsetting" | "ended";
export type AchievementStatus = ChallengeLifecycle;
// The single status a row presents: stored lifecycle combined with the window.
export type DerivedStatus = "draft" | "scheduled" | "active" | "sunsetting" | "ended" | "retired";

export type AchievementProgressRule = {
  type: "required_maps_completed";
  // Omitted with a mode: every map of that standalone mode.
  mapIds?: string[];
  difficultyAtLeast?: string;
  mode?: string;
};

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
  gameVersion: string | null;
  introducedVersion: string | null;
  retiredVersion: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  scope?: "global" | "map";
  mapIds?: string[];
  mapVariant?: "classic";
  progressRule?: AchievementProgressRule | null;
};

export const DIFFICULTY_OPTIONS = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;

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
  gameVersion: string | null;
  introducedVersion: string;
  retiredVersion: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
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
  condition: string;
  lifecycle: TitleLifecycle;
  publicVisibility: boolean;
  availability: TitleAvailability;
  scope: "global" | "map";
  displayKind: "fixed" | "map_pioneer" | "map_name_suffix";
  color?: { kind: "heroColor"; index: number } | { kind: "rgb"; value: [number, number, number] } | { kind: "palette"; name: "orange" | "red" | "purple" | "gold" | "blue" } | null;
  gameVersion: string | null;
  hasChallenge: boolean;
};

export type AdminAchievement = TitleAchievement | MapAchievement | CatalogTitle;
export type AdminMap = { mapId: string; mapName: string };
export type StandaloneModeOption = { mode: string; mapIds: string[] };
export type StatusTone = "default" | "info" | "success" | "warning" | "error";

export const isTitle = (item: AdminAchievement): item is TitleAchievement | CatalogTitle => item.family === "achievement" || item.family === "title_catalog";
export const isChallengeTitle = (item: AdminAchievement): item is TitleAchievement => item.family === "achievement";
export const isMap = (item: AdminAchievement): item is MapAchievement => item.family === "map";
export const isCatalog = (item: AdminAchievement): item is CatalogTitle => item.family === "title_catalog";
export const isDeveloperOnly = (item: CatalogTitle) => item.category === "开发保留";
export const itemIdentity = (item: AdminAchievement) => isMap(item) ? `${item.mapId}:${item.challengeId}:${item.gameplayRevisionId}` : item.challengeId;
export const DEFAULT_EVIDENCE_RULE = "上传包含结算画面、称号条件与玩家信息的完整截图。";

// One coherent status per challenge row: an active challenge before its start
// shows 未开放, one with an announced retiredVersion shows 即将结束, and a
// lapsed window or archived lifecycle shows 已下线.
export const challengeDisplayStatus = (item: { status: ChallengeLifecycle; startsAt?: number | null; endsAt?: number | null; retiredVersion?: string | null }, timestamp = Date.now()): DerivedStatus => {
  if (item.status === "draft") return "draft";
  if (item.status === "archived") return "ended";
  if (item.endsAt != null && item.endsAt <= timestamp) return "ended";
  if (item.startsAt != null && item.startsAt > timestamp) return "scheduled";
  return item.retiredVersion ? "sunsetting" : "active";
};

// A title row presents its lifecycle unless it is active, in which case the
// derived obtainability decides: active with no completable path is 已下线,
// not 已启用.
export const catalogTitleDisplayStatus = (item: CatalogTitle): DerivedStatus =>
  item.lifecycle === "draft" ? "draft" : item.lifecycle === "retired" ? "retired" : item.availability;

export const achievementStatusLabel = (status: DerivedStatus) =>
  status === "draft" ? "草稿"
    : status === "scheduled" ? "未开放"
      : status === "active" ? "已开放"
        : status === "sunsetting" ? "即将结束"
          : status === "retired" ? "已退休"
            : "已下线";

export const achievementStatusTone = (status: DerivedStatus): StatusTone =>
  status === "active" ? "success"
    : status === "scheduled" || status === "draft" ? "info"
      : status === "sunsetting" ? "warning"
        : "default";
