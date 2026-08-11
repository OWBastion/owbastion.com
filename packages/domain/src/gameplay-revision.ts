export const gameplayRevisionLifecycles = ["preparing", "default", "selectable", "historical"] as const;

export type GameplayRevisionLifecycle = (typeof gameplayRevisionLifecycles)[number];
export type GameplayRevisionLegacyVariant = "classic" | null;

export const isGameplayRevisionBastionEnabled = (lifecycle: GameplayRevisionLifecycle) =>
  lifecycle === "default" || lifecycle === "selectable";

export const isGameplayRevisionDefault = (lifecycle: GameplayRevisionLifecycle) =>
  lifecycle === "default";

export const initialGameplayRevisionId = (mapId: string) => `revision:${mapId}:initial`;

export const classicGameplayRevisionId = (mapId: string) => `revision:${mapId}:classic`;
