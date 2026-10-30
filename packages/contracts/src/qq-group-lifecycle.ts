import { z } from "zod";
import { contractVersion, externalId } from "./common";

export const qqGroupRegistrationRequestSchema = z.object({ contractVersion, groupOpenId: externalId, status: z.enum(["pending", "disconnected"]), occurredAt: z.number().int().nonnegative() });
export const qqGroupMemberLeftRequestSchema = z.object({ contractVersion, groupOpenId: externalId, memberOpenId: externalId, occurredAt: z.number().int().nonnegative() });
export type QqGroupRegistrationRequest = z.infer<typeof qqGroupRegistrationRequestSchema>;
export type QqGroupMemberLeftRequest = z.infer<typeof qqGroupMemberLeftRequestSchema>;
