import { z } from "zod";
import { bindingClaimStatusResponseSchema } from "./index";
import { contractVersion, pageInfo } from "./shared";

const playerId = z.string().regex(/^\d{1,10}$/), playerName = z.string().trim().min(1).max(64);
const count = z.number().int().nonnegative();
const timestamp = z.number().int();

export const playerInvitationPeriodSchema = z.enum(["day", "week", "month"]);
export const playerInvitationEligibilityModeSchema = z.enum(["any", "all"]);
// Player-chosen code. Normalization (case) and reserved prefixes are checked by the domain.
export const playerInvitationCodeSchema = z.string().trim().min(1).max(64);

// A registration limit at or above this value means unlimited.
export const playerInvitationUnlimited = 1_000_000;

const policyFields = {
  enabled: z.boolean(),
  maxRegistrationsPerPeriod: count,
  maxUsesPerCode: z.number().int().min(1).max(1000),
  maxValidityDays: z.number().int().min(1).max(365),
  minAccountAgeDays: count.max(3650),
  minApprovedSubmissions: count.max(1000),
  eligibilityMode: playerInvitationEligibilityModeSchema,
};

export const playerInvitationPolicySchema = z.object({ ...policyFields, period: playerInvitationPeriodSchema }).strict();
export const adminPlayerInvitationPolicyRequestSchema = z.object({ contractVersion, policy: playerInvitationPolicySchema }).strict();
export const adminPlayerInvitationPolicyResponseSchema = z.object({
  contractVersion,
  // Null until a maintainer saves a policy; player invitations stay disabled meanwhile.
  policy: playerInvitationPolicySchema.nullable(),
  updatedAt: timestamp.nullable(),
}).strict();

// Every field may be null to inherit the global value. The period is never overridden.
export const playerInvitationOverrideSchema = z.object({
  enabled: policyFields.enabled.nullable(),
  maxRegistrationsPerPeriod: policyFields.maxRegistrationsPerPeriod.nullable(),
  maxUsesPerCode: policyFields.maxUsesPerCode.nullable(),
  maxValidityDays: policyFields.maxValidityDays.nullable(),
  minAccountAgeDays: policyFields.minAccountAgeDays.nullable(),
  minApprovedSubmissions: policyFields.minApprovedSubmissions.nullable(),
  eligibilityMode: policyFields.eligibilityMode.nullable(),
}).strict();
export const adminPlayerInvitationOverrideRequestSchema = z.object({ contractVersion, override: playerInvitationOverrideSchema }).strict();
export const adminPlayerInvitationOverrideSchema = z.object({
  playerAccountId: z.string().min(1).max(128),
  playerName,
  playerId,
  override: playerInvitationOverrideSchema,
  updatedAt: timestamp,
}).strict();
export const adminPlayerInvitationOverrideListResponseSchema = z.object({ contractVersion, items: z.array(adminPlayerInvitationOverrideSchema).max(50), ...pageInfo(50).shape }).strict();

export const playerInvitationStatusSchema = z.enum(["available", "exhausted", "expired", "revoked", "inviter_blocked"]);
export const playerInvitationSchema = z.object({
  invitationId: z.string().uuid(),
  code: z.string(),
  status: playerInvitationStatusSchema,
  maxUses: z.number().int().positive(),
  usedCount: count,
  expiresAt: timestamp,
  createdAt: timestamp,
  revokedAt: timestamp.nullable(),
}).strict();

export const playerInvitationCreateRequestSchema = z.object({
  contractVersion,
  code: playerInvitationCodeSchema,
  maxUses: z.number().int().min(1).max(1000),
  validityDays: z.number().int().min(1).max(365),
}).strict();

export const playerInvitationCreateBlockedReasonSchema = z.enum(["disabled", "ineligible", "quota_exhausted"]);
export const playerInvitationStateResponseSchema = z.object({
  contractVersion,
  policy: z.object({
    period: playerInvitationPeriodSchema,
    periodStart: timestamp,
    periodEnd: timestamp,
    maxUsesPerCode: z.number().int().positive(),
    maxValidityDays: z.number().int().positive(),
  }).strict().nullable(),
  quota: z.object({ registrations: count, maxRegistrations: count }).strict().nullable(),
  eligibility: z.object({
    eligible: z.boolean(),
    mode: playerInvitationEligibilityModeSchema,
    accountAgeDays: count,
    minAccountAgeDays: count,
    approvedSubmissions: count,
    minApprovedSubmissions: count,
  }).strict().nullable(),
  createBlockedReason: playerInvitationCreateBlockedReasonSchema.nullable(),
  items: z.array(playerInvitationSchema).max(20),
  ...pageInfo(20).shape,
}).strict();

export const playerInvitationRedemptionSchema = z.object({
  // Null when the invitee withholds their BattleTag or public profile.
  playerName: playerName.nullable(),
  playerId: playerId.nullable(),
  code: z.string(),
  completedAt: timestamp,
}).strict();
export const playerInvitationRedemptionListResponseSchema = z.object({ contractVersion, items: z.array(playerInvitationRedemptionSchema).max(20), ...pageInfo(20).shape }).strict();

export const playerInvitationRedeemRequestSchema = z.object({ contractVersion, code: playerInvitationCodeSchema, playerName, playerId }).strict();

export const playerInvitationClaimRejectionReasonSchema = z.enum([
  "account_exists", "qq_conflict", "legacy_candidate", "invitation_unavailable", "inviter_quota_exhausted", "code_exhausted",
]);

// Same claim status as administrator invitations, plus why a Player-code claim was refused.
export const playerInvitationClaimStatusResponseSchema = bindingClaimStatusResponseSchema.extend({ rejectionReason: playerInvitationClaimRejectionReasonSchema.optional() });
export type PlayerInvitationClaimStatusResponse = z.infer<typeof playerInvitationClaimStatusResponseSchema>;

const adminTypeFilter = z.enum(["all", "admin", "player"]);
export const adminInvitationStatusSchema = z.enum(["active", "redeemed", "exhausted", "expired", "revoked", "inviter_blocked"]);
export const adminInvitationOverviewQuerySchema = z.object({
  type: adminTypeFilter.default("all"),
  status: adminInvitationStatusSchema.optional(),
  issuer: z.string().trim().min(1).max(64).optional(),
  from: z.coerce.number().int().optional(),
  to: z.coerce.number().int().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
}).strict();
export const adminInvitationOverviewItemSchema = z.object({
  type: z.enum(["admin", "player"]),
  invitationId: z.string().uuid(),
  issuer: z.string(),
  inviterPlayerAccountId: z.string().nullable(),
  status: adminInvitationStatusSchema,
  maxUses: z.number().int().positive(),
  usedCount: count,
  createdAt: timestamp,
  expiresAt: timestamp,
}).strict();
export const adminInvitationOverviewResponseSchema = z.object({ contractVersion, items: z.array(adminInvitationOverviewItemSchema).max(50), ...pageInfo(50).shape }).strict();

export const adminPlayerInvitationDetailResponseSchema = z.object({
  contractVersion,
  invitation: adminInvitationOverviewItemSchema.extend({ code: z.string() }),
  redemptions: z.array(z.object({
    inviteePlayerAccountId: z.string(),
    playerName,
    playerId,
    completedAt: timestamp,
  }).strict()).max(50),
  ...pageInfo(50).shape,
}).strict();

export const adminPlayerInvitationAuditResponseSchema = z.object({
  contractVersion,
  items: z.array(z.object({ auditId: z.string(), operation: z.string(), actorId: z.string(), entityId: z.string(), payload: z.unknown(), createdAt: timestamp }).strict()).max(50),
  ...pageInfo(50).shape,
}).strict();

export type PlayerInvitationPolicy = z.infer<typeof playerInvitationPolicySchema>;
export type AdminPlayerInvitationPolicyRequest = z.infer<typeof adminPlayerInvitationPolicyRequestSchema>;
export type AdminPlayerInvitationPolicyResponse = z.infer<typeof adminPlayerInvitationPolicyResponseSchema>;
export type PlayerInvitationOverride = z.infer<typeof playerInvitationOverrideSchema>;
export type AdminPlayerInvitationOverrideRequest = z.infer<typeof adminPlayerInvitationOverrideRequestSchema>;
export type AdminPlayerInvitationOverrideListResponse = z.infer<typeof adminPlayerInvitationOverrideListResponseSchema>;
export type PlayerInvitationCreateRequest = z.infer<typeof playerInvitationCreateRequestSchema>;
export type PlayerInvitation = z.infer<typeof playerInvitationSchema>;
export type PlayerInvitationStateResponse = z.infer<typeof playerInvitationStateResponseSchema>;
export type PlayerInvitationRedemptionListResponse = z.infer<typeof playerInvitationRedemptionListResponseSchema>;
export type PlayerInvitationRedeemRequest = z.infer<typeof playerInvitationRedeemRequestSchema>;
export type PlayerInvitationClaimRejectionReason = z.infer<typeof playerInvitationClaimRejectionReasonSchema>;
export type AdminInvitationOverviewQuery = z.infer<typeof adminInvitationOverviewQuerySchema>;
export type AdminInvitationOverviewResponse = z.infer<typeof adminInvitationOverviewResponseSchema>;
export type AdminPlayerInvitationDetailResponse = z.infer<typeof adminPlayerInvitationDetailResponseSchema>;
export type AdminPlayerInvitationAuditResponse = z.infer<typeof adminPlayerInvitationAuditResponseSchema>;
