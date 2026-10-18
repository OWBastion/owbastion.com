import type { DerivedStatus } from "./admin-achievement-types";

// Contract types for the merged 称号 page (issue #450). These mirror the
// admin title API responses: list = AdminTitleSummary, expansion =
// AdminTitleChallenge rows. The Portal reaches them as api("/v1/...").

export type AdminTitleAcquisition =
  | { kind: "challenges"; challengeCount: number; completableCount: number }
  | { kind: "map_rule"; ruleId: string; condition: string; scopeLabel: string }
  | { kind: "none" };

export type AdminTitleColor =
  | { kind: "heroColor"; index: number }
  | { kind: "rgb"; value: [number, number, number] }
  | { kind: "palette"; name: "orange" | "red" | "purple" | "gold" | "blue" }
  | null;

export type AdminTitleSummary = {
  titleKey: string;
  label: string;
  icon: string;
  iconUrl: string | null;
  category: string;
  scope: "global" | "map";
  displayKind: "fixed" | "map_pioneer" | "map_name_suffix";
  color: AdminTitleColor;
  publicVisibility: boolean;
  lifecycle: "draft" | "active" | "retired";
  gameVersion: string | null;
  developerOnly: boolean;
  status: DerivedStatus;
  acquisition: AdminTitleAcquisition;
};

export type AdminTitleProgressRule = {
  type: "required_maps_completed";
  mapIds?: string[];
  difficultyAtLeast?: string;
  mode?: string;
};

export type AdminTitleChallenge = {
  challengeId: string;
  titleKey: string;
  condition: string;
  evidenceRule: string;
  submissionMode: "manual" | "automatic";
  categoryOverride: string | null;
  status: "draft" | "active" | "archived";
  startsAt: number | null;
  endsAt: number | null;
  introducedVersion: string | null;
  retiredVersion: string | null;
  mapIds: string[];
  mapVariant?: "classic";
  progressRule?: AdminTitleProgressRule;
  replacedByChallengeId: string | null;
};

export type TitleCascadeRow = {
  challengeId: string;
  status: AdminTitleChallenge["status"];
  retiredVersion: string | null;
  startsAt: number | null;
  endsAt: number | null;
};

export type TitleRuleCascadeRow = {
  ruleId: string;
  status: string;
  retiredVersion: string | null;
};

export type AdminTitleUpdateResponse = {
  contractVersion: string;
  title: AdminTitleSummary;
  previousLifecycle: AdminTitleSummary["lifecycle"];
  cascaded: {
    challenges: TitleCascadeRow[];
    mapTitleRules: TitleRuleCascadeRow[];
  };
};

export type AdminChallengeLifecycleResponse = {
  contractVersion: string;
  challenge: AdminTitleChallenge;
  previous: {
    status: AdminTitleChallenge["status"];
    retiredVersion: string | null;
    startsAt: number | null;
    endsAt: number | null;
  };
};

export type AdminTitleSummaryListResponse = { contractVersion: string; items: AdminTitleSummary[] };
export type AdminTitleChallengeListResponse = { contractVersion: string; items: AdminTitleChallenge[] };

export const titleScopeLabel = (scope: AdminTitleSummary["scope"]) => scope === "map" ? "地图称号" : "全局称号";
export const titleDisplayKindLabel = (displayKind: AdminTitleSummary["displayKind"]) =>
  ({ fixed: "固定称号", map_pioneer: "地图名 + 开拓者", map_name_suffix: "地图名 + 后缀称号" })[displayKind];
export const titleColorLabel = (color: AdminTitleColor) =>
  color?.kind === "palette"
    ? ({ orange: "橙色", red: "红色", purple: "紫色", gold: "金色", blue: "蓝色" } as const)[color.name]
    : color?.kind === "rgb"
      ? `RGB ${color.value.join(", ")}`
      : color?.kind === "heroColor"
        ? `英雄色 ${color.index}`
        : "未设置";

export const titleAcquisitionLabel = (acquisition: AdminTitleAcquisition) =>
  acquisition.kind === "challenges"
    ? `${acquisition.challengeCount} 条挑战 · ${acquisition.completableCount} 条可完成`
    : acquisition.kind === "map_rule"
      ? "地图称号规则"
      : "无获取方式";

export const submissionModeLabel = (mode: AdminTitleChallenge["submissionMode"]) => mode === "automatic" ? "自动提交" : "手动提交";

const DAY = 24 * 60 * 60 * 1000;
const formatDay = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
export const challengeWindowLabel = (challenge: Pick<AdminTitleChallenge, "startsAt" | "endsAt">) => {
  if (challenge.startsAt && challenge.endsAt) return `${formatDay(challenge.startsAt)} 至 ${formatDay(challenge.endsAt)}`;
  if (challenge.startsAt) return `${formatDay(challenge.startsAt)} 起`;
  if (challenge.endsAt) return `至 ${formatDay(challenge.endsAt)}`;
  return "长期开放";
};
export { DAY as TITLE_DAY_MS };
