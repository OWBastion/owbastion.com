import { z } from "zod";
import { contractVersion, externalId } from "./shared";

const scheduleTimestamp = z.number().int().positive();

export const activeChallengeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pioneer"), titleKey: externalId, titleName: z.string(), mapId: externalId, mapName: z.string(), startsAt: scheduleTimestamp, endsAt: scheduleTimestamp }),
  z.object({ kind: z.literal("achievement"), challengeId: externalId, titleKey: externalId, titleName: z.string(), mapIds: z.array(externalId), startsAt: scheduleTimestamp.nullable(), endsAt: scheduleTimestamp }),
]);
export const activeChallengeListResponseSchema = z.object({ contractVersion, items: z.array(activeChallengeSchema) });

export type ActiveChallenge = z.infer<typeof activeChallengeSchema>;
export type ActiveChallengeListResponse = z.infer<typeof activeChallengeListResponseSchema>;
