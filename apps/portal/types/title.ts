export type OwnedTitle = {
  grantId: string;
  titleKey: string;
  label: string;
  category: string;
  condition: string;
  scope: "global" | "map";
  mapName?: string;
  slot?: "pioneer" | "conqueror" | "dominator";
  grantedAt: number;
};
