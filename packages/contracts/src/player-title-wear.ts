import { z } from "zod";
import { contractVersion } from "./shared";

export const playerMapTitleWearRequestSchema = z.object({ wearMapTitles: z.boolean() }).strict();
export const playerMapTitleWearResponseSchema = z.object({ contractVersion, wearMapTitles: z.boolean() });
export type PlayerMapTitleWearResponse = z.infer<typeof playerMapTitleWearResponseSchema>;
