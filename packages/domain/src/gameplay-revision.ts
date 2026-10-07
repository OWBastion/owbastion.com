export const gameplayRevisionLifecycles = ["preparing", "default", "selectable", "historical"] as const;

export type GameplayRevisionLifecycle = (typeof gameplayRevisionLifecycles)[number];
export type GameplayRevisionLegacyVariant = "classic" | null;

export const isGameplayRevisionBastionEnabled = (lifecycle: GameplayRevisionLifecycle) =>
  lifecycle === "default" || lifecycle === "selectable";

export const isGameplayRevisionDefault = (lifecycle: GameplayRevisionLifecycle) =>
  lifecycle === "default";

// A standalone game mode such as 2026镜中回响 is played on its own selectable Gameplay
// Revisions. Labels compare without whitespace, which the HUD and OCR disagree about.
export const normalizeGameMode = (value: string | null | undefined) => value?.replace(/\s+/gu, "") || null;

export const initialGameplayRevisionId = (mapId: string) => `revision:${mapId}:initial`;

// Legacy compatibility remains represented by legacyMapVariant. The revision
// identity itself uses a reserved machine sequence rather than that label.
export const legacyGameplayRevisionId = (mapId: string) => ["revision", mapId, "v0"].join(":");
