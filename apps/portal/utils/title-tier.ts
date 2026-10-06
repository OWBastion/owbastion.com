import type { OwnedTitle } from "~/types/title";

export type TitleTier = "dominator" | "conqueror" | "pioneer" | "general";

// Map titles carry a slot; every other title is general. Terminology: the slot
// is a classification, written as "开拓者槽位", never as a rank or 段位.
export const titleTier = (title: Pick<OwnedTitle, "slot">): TitleTier => title.slot ?? "general";

export const titleTierLabel: Record<TitleTier, string> = {
  dominator: "主宰槽位",
  conqueror: "征服者槽位",
  pioneer: "开拓者槽位",
  general: "",
};
