import { z } from "zod";

export const contractVersion = z.literal("1");
export const externalId = z.string().trim().min(1).max(256);

export const pageInfo = (maxPageSize?: number) => z.object({
  page: z.number().int().positive(),
  pageSize: maxPageSize === undefined ? z.number().int().positive() : z.number().int().positive().max(maxPageSize),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
