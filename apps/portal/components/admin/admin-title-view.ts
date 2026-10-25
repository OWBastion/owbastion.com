import { reactive } from "vue";
import type { AdminTitleChallenge, AdminTitleSummary } from "./admin-title-types";
import { challengeDisplayStatus, compareAttention, inStatusView } from "./admin-achievement-types";

export type TitleView = "attention" | "ended" | "developer" | "all";
export type TitleSort = "attention" | "category_label" | "label";

export const sortTitles = (titles: AdminTitleSummary[], mode: TitleSort) => {
  const byLabel = (a: AdminTitleSummary, b: AdminTitleSummary) => a.label.localeCompare(b.label, "zh-CN");
  const byCategory = (a: AdminTitleSummary, b: AdminTitleSummary) => a.category.localeCompare(b.category, "zh-CN") || byLabel(a, b);
  return [...titles].sort(mode === "label" ? byLabel : mode === "attention" ? (a, b) => compareAttention(a.status, b.status) || byCategory(a, b) : byCategory);
};

export const inTitleView = (title: AdminTitleSummary, view: TitleView) => view === "all"
  || (view === "developer" ? title.developerOnly : !title.developerOnly && inStatusView(title.status, view));

export const titleViewTabs = (titles: AdminTitleSummary[]) => {
  const count = (view: TitleView) => titles.filter((title) => inTitleView(title, view)).length;
  return [
    { label: `关注 ${count("attention")}`, value: "attention" },
    { label: `已结束 ${count("ended")}`, value: "ended" },
    { label: `开发保留 ${count("developer")}`, value: "developer" },
    { label: `全部 ${count("all")}`, value: "all" },
  ];
};

/** Ended challenges fold away while the title still has an open path. */
export function useEndedChallengeFold(challengesOf: (title: AdminTitleSummary) => AdminTitleChallenge[]) {
  const shown = reactive(new Set<string>());
  const endedCount = (title: AdminTitleSummary) => challengesOf(title).filter((challenge) => challengeDisplayStatus(challenge) === "ended").length;
  const canFold = (title: AdminTitleSummary) => endedCount(title) > 0 && endedCount(title) < challengesOf(title).length;
  return {
    canFold,
    visible: (title: AdminTitleSummary) => canFold(title) && !shown.has(title.titleKey)
      ? challengesOf(title).filter((challenge) => challengeDisplayStatus(challenge) !== "ended")
      : challengesOf(title),
    toggleLabel: (title: AdminTitleSummary) => shown.has(title.titleKey) ? "收起已结束" : `显示已结束 ${endedCount(title)} 条`,
    toggle: (title: AdminTitleSummary) => { if (!shown.delete(title.titleKey)) shown.add(title.titleKey); },
  };
}
