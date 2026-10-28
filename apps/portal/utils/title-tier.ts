import type { OwnedTitle } from "~/types/title";

export type TitleTier = "dominator" | "conqueror" | "pioneer" | "general";

// Map titles carry a slot; every other title is general. Terminology: the slot
// is a classification, written as "开拓者槽位", never as a rank or 段位.
export const titleTier = (title: Pick<OwnedTitle, "slot">): TitleTier => title.slot ?? "general";
