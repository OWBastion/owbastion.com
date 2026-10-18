// Stored lifecycle for every challenge entity; scheduled/sunsetting/ended are
// derived from the window and announced retirement version, never stored.
export type ChallengeLifecycle = "draft" | "active" | "archived";
export type AchievementStatus = ChallengeLifecycle;
// The single status a row presents: stored lifecycle combined with the window.
export type DerivedStatus = "draft" | "scheduled" | "active" | "sunsetting" | "ended";

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

// GET /v1/achievements still returns achievement/catalog families alongside map
// challenges, but the map page only consumes the map family.
export type AdminAchievement = MapAchievement;
export type AdminMap = { mapId: string; mapName: string };
export type StandaloneModeOption = { mode: string; mapIds: string[] };
export type StatusTone = "default" | "info" | "success" | "warning" | "error";

export const isMap = (item: AdminAchievement): item is MapAchievement => item.family === "map";
export const itemIdentity = (item: AdminAchievement) => `${item.mapId}:${item.challengeId}:${item.gameplayRevisionId}`;
export const DEFAULT_EVIDENCE_RULE = "上传包含结算画面、称号条件与玩家信息的完整截图。";

export const DIFFICULTY_OPTIONS = ["简单", "一般", "困难", "专家", "传奇", "地狱"] as const;

// One coherent status per challenge row: an active challenge before its start
// shows 未开放, one with an announced retiredVersion shows 即将结束, and a
// lapsed window, archived lifecycle or ended title shows 已结束.
export const challengeDisplayStatus = (item: { status: ChallengeLifecycle; startsAt?: number | null; endsAt?: number | null; retiredVersion?: string | null }, timestamp = Date.now()): DerivedStatus => {
  if (item.status === "draft") return "draft";
  if (item.status === "archived") return "ended";
  if (item.endsAt != null && item.endsAt <= timestamp) return "ended";
  if (item.startsAt != null && item.startsAt > timestamp) return "scheduled";
  return item.retiredVersion ? "sunsetting" : "active";
};

export const achievementStatusLabel = (status: DerivedStatus) =>
  status === "draft" ? "草稿"
    : status === "scheduled" ? "未开放"
      : status === "active" ? "已开放"
        : status === "sunsetting" ? "即将结束"
          : "已结束";

export const achievementStatusTone = (status: DerivedStatus): StatusTone =>
  status === "active" ? "success"
    : status === "scheduled" || status === "draft" ? "info"
      : status === "sunsetting" ? "warning"
        : "default";
