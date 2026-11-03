import { z } from "zod";
import { contractVersion, externalId, pageInfo, playerId, playerName } from "./shared";

export const reviewTargetTypeSchema = z.enum(["event", "map"]);
const reviewRatingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
export const reviewTargetSchema = z.discriminatedUnion("targetType", [
  z.object({ targetType: z.literal("event"), targetId: externalId }).strict(),
  z.object({ targetType: z.literal("map"), targetId: externalId, gameplayRevisionId: externalId }).strict(),
]);
const reviewComment = z.string().trim().refine((value) => Array.from(value).length <= 500, "The review comment is too long");
const reviewRatingDistributionSchema = z.object({ 1: z.number().int().nonnegative(), 2: z.number().int().nonnegative(), 3: z.number().int().nonnegative(), 4: z.number().int().nonnegative(), 5: z.number().int().nonnegative() }).strict();
const publicReviewSummaryFields = {
  averageRating: z.number().min(1).max(5).nullable(),
  reviewCount: z.number().int().nonnegative(),
  ratingDistribution: reviewRatingDistributionSchema,
  sampleInsufficient: z.boolean(),
};
export const publicReviewSummarySchema = z.discriminatedUnion("targetType", [
  z.object({ targetType: z.literal("event"), targetId: externalId, gameplayRevisionId: z.null(), ...publicReviewSummaryFields }).strict(),
  z.object({ targetType: z.literal("map"), targetId: externalId, gameplayRevisionId: externalId, ...publicReviewSummaryFields }).strict(),
]);
export const publicReviewSummaryResponseSchema = z.object({ contractVersion, summary: publicReviewSummarySchema }).strict();
export const publicReviewCommentSchema = z.object({
  rating: reviewRatingSchema,
  comment: reviewComment,
  author: z.object({ displayName: z.string().trim().min(1).max(64) }).strict().nullable(),
  createdAt: z.number().int(),
}).strict();
export const publicReviewCommentPageSchema = z.object({
  contractVersion,
  targetType: reviewTargetTypeSchema,
  targetId: externalId,
  gameplayRevisionId: externalId.nullable(),
  items: z.array(publicReviewCommentSchema).max(50),
}).merge(pageInfo(50)).strict();
export const featuredReviewCommentsResponseSchema = z.object({
  contractVersion,
  items: z.array(z.object({ rating: z.union([z.literal(4), z.literal(5)]), comment: reviewComment, targetName: z.string().trim().min(1).max(128) }).strict()).max(3),
}).strict();
export const playerReviewSchema = z.object({
  reviewId: z.string().uuid(),
  targetType: reviewTargetTypeSchema,
  targetId: externalId,
  gameplayRevisionId: externalId.nullable(),
  rating: reviewRatingSchema,
  comment: reviewComment.nullable(),
  anonymous: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict();
export const playerReviewResponseSchema = z.object({ contractVersion, review: playerReviewSchema.nullable() }).strict();
export const playerReviewUpsertRequestSchema = z.object({
  contractVersion,
  rating: reviewRatingSchema,
  comment: reviewComment.nullable().optional(),
  anonymous: z.boolean().default(false),
}).strict();
export const playerReviewUpsertResponseSchema = z.object({ contractVersion, review: playerReviewSchema }).strict();
export const playerReviewWithdrawRequestSchema = z.object({ contractVersion }).strict();
export const playerReviewWithdrawResponseSchema = z.object({ contractVersion, review: z.null() }).strict();

const reviewStatusSchema = z.enum(["active", "withdrawn", "invalidated"]);
const reviewCommentStatusSchema = z.enum(["visible", "hidden"]);
export const adminReviewSchema = z.object({
  reviewId: z.string().uuid(),
  targetType: reviewTargetTypeSchema,
  targetId: externalId,
  gameplayRevisionId: externalId.nullable(),
  targetName: z.string().trim().min(1).max(256),
  playerAccountId: z.string().uuid().nullable(),
  playerId: playerId.nullable(),
  playerName: playerName.nullable(),
  sourceLabel: z.string().nullable(),
  rating: reviewRatingSchema,
  comment: reviewComment.nullable(),
  anonymous: z.boolean(),
  commentStatus: reviewCommentStatusSchema,
  status: reviewStatusSchema,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  withdrawnAt: z.number().int().nullable(),
  invalidatedAt: z.number().int().nullable(),
  invalidatedBy: z.string().nullable(),
  invalidationReason: z.string().nullable(),
}).strict();
export const adminReviewAuditSchema = z.object({
  operation: z.string().trim().min(1).max(128),
  actorType: z.string().trim().min(1).max(32),
  actorId: z.string().trim().min(1).max(256),
  reason: z.string().nullable(),
  createdAt: z.number().int(),
}).strict();
export const adminReviewListResponseSchema = z.object({ contractVersion, items: z.array(adminReviewSchema).max(50) }).merge(pageInfo(50)).strict();
export const adminReviewDetailResponseSchema = z.object({ contractVersion, review: adminReviewSchema, audit: z.array(adminReviewAuditSchema).max(50) }).strict();
export const adminReviewCommentModerationRequestSchema = z.object({ contractVersion, action: z.enum(["hide", "restore"]), reason: z.string().trim().max(512).optional() }).strict();
export const adminReviewStateModerationRequestSchema = z.object({ contractVersion, action: z.enum(["invalidate", "restore"]), reason: z.string().trim().max(512).optional() }).strict();

export type ReviewTargetType = z.infer<typeof reviewTargetTypeSchema>;
export type ReviewRating = z.infer<typeof reviewRatingSchema>;
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;
export type PublicReviewSummary = z.infer<typeof publicReviewSummarySchema>;
export type PublicReviewSummaryResponse = z.infer<typeof publicReviewSummaryResponseSchema>;
export type PublicReviewComment = z.infer<typeof publicReviewCommentSchema>;
export type PublicReviewCommentPage = z.infer<typeof publicReviewCommentPageSchema>;
export type FeaturedReviewCommentsResponse = z.infer<typeof featuredReviewCommentsResponseSchema>;
export type PlayerReview = z.infer<typeof playerReviewSchema>;
export type PlayerReviewResponse = z.infer<typeof playerReviewResponseSchema>;
export type AdminReview = z.infer<typeof adminReviewSchema>;
export type AdminReviewAudit = z.infer<typeof adminReviewAuditSchema>;
export type AdminReviewListResponse = z.infer<typeof adminReviewListResponseSchema>;
export type AdminReviewDetailResponse = z.infer<typeof adminReviewDetailResponseSchema>;
