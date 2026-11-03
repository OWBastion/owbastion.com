// Insert order for grants that database triggers inherit downward (PIONEER gives
// DOMINATOR and CONQUEROR, DOMINATOR gives CONQUEROR). Inserting the lower title
// first lets each trigger skip its auto-insert; the other order collides on
// player_title_grants_active_identity_idx.
export const inheritanceGrantRank = (titleKey: string | null) => titleKey === "CONQUEROR" ? 0 : titleKey === "DOMINATOR" ? 1 : titleKey === "PIONEER" ? 2 : 3;

export const inheritanceOrder = <T>(items: readonly T[], titleKeyOf: (item: T) => string) =>
  [...items].sort((left, right) => inheritanceGrantRank(titleKeyOf(left)) - inheritanceGrantRank(titleKeyOf(right)));
