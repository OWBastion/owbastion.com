import { z } from "zod";
import { contractVersion, externalId, vector3 } from "./shared";

export const mapPositionKinds = ["bastion", "reset", "end", "third_person", "portal", "springboard", "control_center", "control_jump", "control_respawn"] as const;

export const mapPositionSchema = z.object({ kind: z.enum(mapPositionKinds), position: vector3 }).strict();
export const mapPositionStageSchema = z.object({ points: z.array(mapPositionSchema) }).strict();

export const publicMapPositionsSchema = z.object({
  mapId: externalId,
  gameplayRevisionId: externalId.nullable(),
  stages: z.array(mapPositionStageSchema),
}).strict();
export const publicMapPositionsResponseSchema = z.object({ contractVersion, item: publicMapPositionsSchema }).strict();

export type MapPositionKind = (typeof mapPositionKinds)[number];
export type MapPosition = z.infer<typeof mapPositionSchema>;
export type MapPositionStage = z.infer<typeof mapPositionStageSchema>;
export type PublicMapPositions = z.infer<typeof publicMapPositionsSchema>;
export type PublicMapPositionsResponse = z.infer<typeof publicMapPositionsResponseSchema>;
