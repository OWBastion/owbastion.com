import { z } from "zod";
import { achievementIcon, contractVersion, externalId, gameVersionValue, pageInfo, playerId, playerName, titleColorSchema, titleLifecycleStatus } from "./shared";

const count = z.int().nonnegative();
export const derivedStatusSchema = z.enum(["draft", "scheduled", "active", "sunsetting", "ended"]);
export const adminTitleSummarySchema = z.object({
  titleKey: externalId, label: z.string(), icon: achievementIcon, iconUrl: z.string().url().nullable(), category: z.string(),
  scope: z.enum(["global", "map"]), displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]), color: titleColorSchema.nullable(),
  publicVisibility: z.boolean(), lifecycle: titleLifecycleStatus, gameVersion: gameVersionValue, developerOnly: z.boolean(), holderCount: count, status: derivedStatusSchema,
  acquisition: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("challenges"), challengeCount: count, completableCount: count }),
    z.object({ kind: z.literal("map_rule"), ruleId: externalId, condition: z.string(), scopeLabel: z.string() }),
    z.object({ kind: z.literal("none") }),
  ]),
});
export const adminTitleSummaryListResponseSchema = z.object({ contractVersion, items: z.array(adminTitleSummarySchema) });

export const adminTitleHolderSchema = z.object({ playerAccountId: externalId, playerName, playerId, grantCount: count, firstGrantedAt: z.int().nonnegative() });
export const adminTitleHolderListResponseSchema = z.object({ contractVersion, items: z.array(adminTitleHolderSchema), ...pageInfo(100).shape });
export type AdminTitleSummary = z.infer<typeof adminTitleSummarySchema>;
export type AdminTitleHolder = z.infer<typeof adminTitleHolderSchema>;
export type AdminTitleHolderListResponse = z.infer<typeof adminTitleHolderListResponseSchema>;
