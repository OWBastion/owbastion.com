import { z } from "zod";
import { contractVersion } from "./shared";

// Seasons (#401): a named, time-boxed ranking window over the same Verified
// Runs. Only the schedule, lifecycle status, and visibility are stored; the
// phase is derived from time. The window includes both `startsAt` and
// `endsAt` (epoch milliseconds).
export const seasonStatusSchema = z.enum(["draft", "active", "archived"]);
export const seasonPhaseSchema = z.enum(["draft", "scheduled", "running", "ended"]);
export const adminSeasonSchema = z.object({
  seasonId: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  status: seasonStatusSchema,
  public: z.boolean(),
  phase: seasonPhaseSchema,
  // Players with at least one counted Run in the window so far; 0 before it starts.
  playerCount: z.number().int().nonnegative(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict();
export const adminSeasonListResponseSchema = z.object({
  contractVersion,
  now: z.number().int().nonnegative(),
  items: z.array(adminSeasonSchema).max(200),
}).strict();
export const adminSeasonWriteRequestSchema = z.object({
  contractVersion,
  name: z.string().trim().min(1).max(64),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  status: seasonStatusSchema,
  public: z.boolean(),
}).strict();
export const publicSeasonSchema = z.object({
  seasonId: z.string().uuid(),
  name: z.string().trim().min(1).max(64),
  startsAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
  phase: z.enum(["running", "ended"]),
}).strict();
export const publicSeasonListResponseSchema = z.object({
  contractVersion,
  items: z.array(publicSeasonSchema).max(200),
}).strict();

export type SeasonStatus = z.infer<typeof seasonStatusSchema>;
export type SeasonPhase = z.infer<typeof seasonPhaseSchema>;
export type AdminSeason = z.infer<typeof adminSeasonSchema>;
export type AdminSeasonListResponse = z.infer<typeof adminSeasonListResponseSchema>;
export type AdminSeasonWriteRequest = z.infer<typeof adminSeasonWriteRequestSchema>;
export type PublicSeason = z.infer<typeof publicSeasonSchema>;
export type PublicSeasonListResponse = z.infer<typeof publicSeasonListResponseSchema>;
