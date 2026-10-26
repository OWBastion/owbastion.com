import { z } from "zod";

export const contractVersion = z.literal("1");
export const externalId = z.string().trim().min(1).max(256);
