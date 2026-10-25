import { z } from "zod";
import { contractVersion, pageInfo } from "./shared";

const playerVerifiedRunSubmissionOutcomeStatus = z.enum(["created", "reused", "ineligible", "invalidated"]);
export const playerVerifiedRunSubmissionOutcomeSchema = z.object({
  status: playerVerifiedRunSubmissionOutcomeStatus,
  awardedXp: z.number().int().nonnegative(),
}).strict();

export const submissionStatusResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  status: z.enum(["processing", "needs_review", "completed", "rejected"]),
  resubmissionRequired: z.boolean().optional(),
  mapName: z.string(),
  challengeId: z.string().optional(),
  difficulty: z.string().optional(),
  reason: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  verifiedRunOutcome: playerVerifiedRunSubmissionOutcomeSchema.optional(),
});

// The caller's own submission history, paged: the same player-safe fields the
// current-player response carries under `recentSubmissions`.
export const playerSubmissionListResponseSchema = z.object({
  contractVersion,
  items: z.array(submissionStatusResponseSchema.omit({ contractVersion: true })),
}).merge(pageInfo(50)).strict();

export type SubmissionStatusResponse = z.infer<typeof submissionStatusResponseSchema>;
export type PlayerSubmissionStatus = SubmissionStatusResponse["status"];
export type PlayerSubmissionListResponse = z.infer<typeof playerSubmissionListResponseSchema>;
