import { z } from "zod";

export const contractVersion = z.literal("1");
export const externalId = z.string().trim().min(1).max(256);

export const pageInfo = (maxPageSize?: number) => z.object({
  page: z.number().int().positive(),
  pageSize: maxPageSize === undefined ? z.number().int().positive() : z.number().int().positive().max(maxPageSize),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
export const playerId = z.string().regex(/^\d{1,10}$/);
export const playerName = z.string().trim().min(1).max(64);

export const titleLifecycleStatus = z.enum(["draft", "active"]);
export const gameVersionValue = z.string().trim().min(1).max(64).nullable();
export const achievementIcon = z.string().trim().regex(/^[a-z0-9-]+$/).max(64);
export const titleColorSchema = z.union([
  z.object({ kind: z.literal("heroColor"), index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("rgb"), value: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]) }),
  z.object({ kind: z.literal("palette"), name: z.enum(["orange", "red", "purple", "gold", "blue"]) }),
]);
