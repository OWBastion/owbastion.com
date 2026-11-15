import type { AgentSpatialConfig, MapPosition, MapPositionKind, MapPositionStage } from "@owbastion/contracts";

type Vector = MapPosition["position"];

const points = (kind: MapPositionKind, positions: readonly Vector[] | undefined): MapPosition[] =>
  (positions ?? []).map((position) => ({ kind, position }));

// The drawn subset of a revision's spatial config, one entry per stage in config order.
// Credits points are never drawn. A composite stage's respawn point only receives the jump
// from the previous stage, and its route end is the last selected stage's jump point, so
// composite stages carry neither.
export const mapPositionStages = (config: AgentSpatialConfig): MapPositionStage[] => {
  if ("stages" in config) {
    const root = "resetPosition" in config ? config : null;
    return config.stages.map((stage) => ({
      points: [
        ...points("bastion", stage.bastionPositions),
        ...points("reset", [stage.resetPosition ?? root?.resetPosition].filter((value) => value !== undefined)),
        ...points("third_person", [stage.thirdPersonPosition ?? root?.thirdPersonPosition].filter((value) => value !== undefined)),
        ...points("portal", stage.portalPositions),
        ...points("springboard", stage.springboardPositions),
        ...points("control_center", stage.control?.centerPositions),
        ...points("control_jump", stage.control?.jumpPositions),
      ],
    }));
  }
  return [config, ...config.alternateStages].map((stage) => ({
    points: [
      ...points("bastion", stage.bastionPositions),
      ...points("reset", [stage.resetPosition]),
      ...points("end", [stage.endPosition]),
      ...points("third_person", [stage.thirdPersonPosition]),
      ...points("portal", stage.portalPositions),
      ...points("springboard", stage.springboardPositions),
      ...points("control_center", stage.control?.centerPositions),
      ...points("control_jump", stage.control?.jumpPositions),
      ...points("control_respawn", stage.control?.respawnPositions),
    ],
  }));
};
