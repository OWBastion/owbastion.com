import type { SpatialConfigValue } from "./spatial-config-import";

export type CompositeStage = SpatialConfigValue & {
  stageId: string;
  setupDetection?: { position: unknown[]; radius: unknown };
};

export type CompositeConfig = SpatialConfigValue & {
  resetPosition?: unknown;
  endPosition?: unknown;
  thirdPersonPosition?: unknown;
  creditsPosition?: unknown;
  control?: { respawnAxis: "x" | "y" | "z" | null; respawnAxisThreshold: number | null } | null;
  composition: {
    selectionCount: number;
    firstStageSelection: { mode: "random" } | { mode: "setup_detection"; fallbackStageId: string };
    remainingStageSelection: string;
  };
  stages: CompositeStage[];
};

export type ValidationIssue = { path: PropertyKey[]; message: string };

export function hasCompositeStructure(value: SpatialConfigValue | null): value is CompositeConfig {
  return Boolean(value && Array.isArray(value.stages) && value.composition && typeof value.composition === "object");
}

export function isCompositeForMode(value: SpatialConfigValue, mode: "legacy" | "current"): value is CompositeConfig {
  return hasCompositeStructure(value) && (mode === "legacy" || "endPosition" in value);
}

export function createEmptyCompositeStage(stageId: string, mode: "legacy" | "current"): CompositeStage {
  const stage = { stageId, bastionPositions: [], control: null, portalPositions: [], springboardPositions: [] };
  return mode === "legacy" ? { ...stage, resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null } : stage;
}

export function createEmptyCompositeConfig(mode: "legacy" | "current" = "current"): CompositeConfig {
  const config = {
    composition: { selectionCount: 2, firstStageSelection: { mode: "random" as const }, remainingStageSelection: "random_unique" },
    stages: [createEmptyCompositeStage("stage-1", mode), createEmptyCompositeStage("stage-2", mode)],
  };
  return mode === "legacy" ? config : { resetPosition: null, endPosition: null, thirdPersonPosition: null, creditsPosition: null, control: null, ...config };
}
