export type OwnedTitle = {
  grantId: string;
  titleKey: string;
  label: string;
  icon: string;
  iconUrl?: string | null;
  category: string;
  condition: string;
  scope: "global" | "map";
  mapId?: string;
  gameplayRevisionId?: string;
  mapName?: string;
  slot?: "pioneer" | "conqueror" | "dominator";
  grantedAt: number;
};
