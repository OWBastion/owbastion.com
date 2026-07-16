import { z } from "zod";

export const contractVersion = z.literal("1");

const externalId = z.string().trim().min(1).max(256);
const playerId = z.string().regex(/^\d{1,10}$/);

export const qqBindingRequestSchema = z.object({
  contractVersion,
  provider: z.literal("qq"),
  groupOpenId: externalId,
  memberOpenId: externalId,
  playerName: z.string().trim().min(1).max(64),
  playerId,
});

export const qqBindingResponseSchema = z.object({
  contractVersion,
  bindingId: z.string().uuid(),
  identityId: z.string().uuid(),
  provider: z.literal("qq"),
  groupOpenId: externalId,
  memberOpenId: externalId,
  playerName: z.string().trim().min(1).max(64),
  playerId,
});

export const qqLoginAttemptRequestSchema = z.object({ contractVersion, provider: z.literal("qq") });
export const qqLoginAttemptResponseSchema = z.object({
  contractVersion,
  attemptId: z.string().uuid(),
  attemptToken: z.string().min(32),
  code: z.string().regex(/^[A-Z2-9]{6}$/),
  expiresAt: z.number().int(),
});
export const qqLoginStatusResponseSchema = z.object({
  contractVersion,
  status: z.enum(["pending", "verified", "expired"]),
  environment: z.enum(["production", "test"]).optional(),
  sessionToken: z.string().min(32).optional(),
});
export const qqLoginVerifyRequestSchema = z.object({
  contractVersion,
  provider: z.literal("qq"),
  code: z.string().regex(/^[A-Z2-9]{6}$/),
  groupOpenId: externalId,
  memberOpenId: externalId,
  messageId: externalId,
});
export const qqLoginVerifyResponseSchema = z.object({
  contractVersion,
  status: z.literal("verified"),
  environment: z.enum(["production", "test"]),
});
export const qqGroupAccessRequestSchema = z.object({ contractVersion, groupOpenId: externalId, environment: z.enum(["production", "test"]), enabled: z.boolean() });
export const qqGroupAccessResponseSchema = qqGroupAccessRequestSchema.extend({ updatedAt: z.number().int() });

const adminPlayerStatus = z.enum(["active", "banned"]);
const adminBindingSchema = z.object({
  bindingId: z.string().uuid(),
  provider: z.literal("qq"),
  groupOpenId: externalId,
  memberOpenId: externalId,
  createdAt: z.number().int(),
});
export const adminPlayerSummarySchema = z.object({
  playerAccountId: z.string().uuid(),
  playerId,
  playerName: z.string().trim().min(1).max(64),
  status: adminPlayerStatus,
  bindingCount: z.number().int().nonnegative(),
  updatedAt: z.number().int(),
});
export const adminPlayerListResponseSchema = z.object({ contractVersion, items: z.array(adminPlayerSummarySchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), hasMore: z.boolean() });
export const adminPlayerStatusRequestSchema = z.object({ contractVersion, status: adminPlayerStatus, reason: z.string().trim().max(256).optional() });

const attachmentSchema = z.object({
  externalAttachmentId: externalId,
  contentType: z.string().trim().min(1).max(128),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceUrl: z.string().url().max(4096),
});

const submissionStatus = z.enum(["upload_pending", "ocr_pending", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"]);

const mapChallengeSchema = z.object({
  challengeId: externalId,
  family: z.literal("map"),
  type: z.literal("map_completion"),
  kind: z.enum(["difficulty_completion", "pioneer", "classic_completion"]),
  name: z.string().trim().min(1).max(256),
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  difficulty: z.string().trim().min(1).max(64).optional(),
  gameVersion: z.string().trim().min(1).max(64),
});

const achievementChallengeSchema = z.object({
  challengeId: externalId,
  family: z.literal("achievement"),
  type: z.literal("title_achievement"),
  kind: z.literal("title_achievement"),
  titleKey: externalId,
  titleName: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(128),
  condition: z.string().trim().min(1).max(1024),
  evidenceRule: z.string().trim().min(1).max(2048),
  gameVersion: z.string().trim().min(1).max(64),
  status: z.literal("active"),
  submissionMode: z.enum(["manual", "automatic"]),
});

export const challengeSchema = z.discriminatedUnion("family", [mapChallengeSchema, achievementChallengeSchema]);

export const challengeListResponseSchema = z.object({ contractVersion, items: z.array(challengeSchema) });

export const mapSchema = z.object({
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  gameVersion: z.string().trim().min(1).max(64),
});

export const mapListResponseSchema = z.object({ contractVersion, items: z.array(mapSchema) });

export const titleSchema = z.object({
  titleKey: externalId,
  label: z.string().trim().min(1).max(256),
  category: z.string().trim().min(1).max(128),
  condition: z.string().trim().min(1).max(1024),
  availability: z.enum(["active", "retired"]),
  scope: z.enum(["global", "map"]),
  displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]),
  mapId: externalId.optional(),
  slot: z.enum(["pioneer", "conqueror", "dominator"]).optional(),
  pioneerPrefixes: z.array(z.string().trim().min(1).max(256)).optional(),
  gameVersion: z.string().trim().min(1).max(64),
});

export const titleListResponseSchema = z.object({ contractVersion, items: z.array(titleSchema) });

export const ownedTitleSchema = z.object({
  grantId: z.string().uuid(), titleKey: externalId, label: z.string(), category: z.string(),
  scope: z.enum(["global", "map"]), mapName: z.string().optional(), slot: z.enum(["pioneer", "conqueror", "dominator"]).optional(), grantedAt: z.number().int(),
});
export const ownedTitleListResponseSchema = z.object({ contractVersion, items: z.array(ownedTitleSchema) });
export const historicalTitleGrantSchema = ownedTitleSchema.extend({ holderName: z.string(), playerAccountId: z.string().uuid().optional(), playerName: z.string().optional(), playerId: playerId.optional(), status: z.enum(["unclaimed", "active", "revoked"]), revokeReason: z.string().optional() });
export const historicalTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(historicalTitleGrantSchema) });
export const adminTitleGrantRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), historicalTitleGrantId: z.string().uuid() });
export const adminTitleGrantBulkRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), holderName: z.string().trim().min(1).max(256) });
export const adminTitleGrantBulkResponseSchema = z.object({ contractVersion, grantedCount: z.number().int().nonnegative() });
export const adminTitleGrantRevokeRequestSchema = z.object({ contractVersion, reason: z.string().trim().min(1).max(256) });

const adminMapChallengeSchema = mapChallengeSchema.extend({
  status: z.enum(["active", "retired"]),
  introducedVersion: z.string().trim().min(1).max(64),
  retiredVersion: z.string().trim().min(1).max(64).nullable(),
});
const adminAchievementChallengeSchema = achievementChallengeSchema.extend({
  categoryOverride: z.string().trim().min(1).max(128).nullable(),
  status: z.enum(["active", "retired"]),
  introducedVersion: z.string().trim().min(1).max(64),
  retiredVersion: z.string().trim().min(1).max(64).nullable(),
});
export const adminChallengeSchema = z.discriminatedUnion("family", [adminMapChallengeSchema, adminAchievementChallengeSchema]);
export const adminChallengeListResponseSchema = z.object({ contractVersion, items: z.array(adminChallengeSchema) });

const adminMapChallengeUpdateSchema = z.object({
  contractVersion,
  family: z.literal("map"),
  status: z.enum(["active", "retired"]),
  retiredVersion: z.string().trim().min(1).max(64).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "retired" && !value.retiredVersion) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "A retired version is required" });
  if (value.status === "active" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "An active challenge cannot have a retired version" });
});
const adminAchievementChallengeUpdateSchema = z.object({
  contractVersion,
  family: z.literal("achievement"),
  condition: z.string().trim().min(1).max(1024),
  evidenceRule: z.string().trim().min(1).max(2048),
  submissionMode: z.enum(["manual", "automatic"]),
  categoryOverride: z.string().trim().min(1).max(128).nullable(),
  status: z.enum(["active", "retired"]),
  retiredVersion: z.string().trim().min(1).max(64).optional(),
}).superRefine((value, ctx) => {
  if (value.status === "retired" && !value.retiredVersion) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "A retired version is required" });
  if (value.status === "active" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "An active challenge cannot have a retired version" });
});
export const adminChallengeUpdateRequestSchema = z.union([adminMapChallengeUpdateSchema, adminAchievementChallengeUpdateSchema]);

export const playerUploadSessionRequestSchema = z.object({
  contractVersion,
  challengeId: externalId,
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const playerUploadSessionResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  uploadId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.number().int(),
  maxBytes: z.number().int().positive(),
});

export const playerUploadCompleteRequestSchema = z.object({ contractVersion, uploadId: z.string().uuid() });

export const adminSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  status: submissionStatus,
  challengeId: externalId,
  mapName: z.string(),
  difficulty: z.string(),
  playerName: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  ocr: z.record(z.string(), z.unknown()).nullable(),
  evidenceUrl: z.string().url().nullable(),
});

export const adminSubmissionListResponseSchema = z.object({ contractVersion, items: z.array(adminSubmissionSchema), hasMore: z.boolean() });
export const adminSubmissionReviewRequestSchema = z.object({
  contractVersion,
  decision: z.enum(["approved", "rejected", "resubmission_required"]),
  reason: z.string().trim().min(1).max(512),
});

export const submissionRequestSchema = z.object({
  contractVersion,
  actor: z.object({
    provider: z.literal("qq"),
    groupOpenId: externalId,
    memberOpenId: externalId,
  }),
  source: z.object({
    provider: z.literal("qq"),
    conversationId: externalId,
    messageId: externalId,
  }),
  challenge: z.object({
    type: z.literal("map_completion"),
    mapName: z.string().trim().min(1).max(256),
  }),
  attachments: z.array(attachmentSchema).min(1).max(20),
});

export const submissionResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  status: z.enum(["evidence_pending", "evidence_stored", "ocr_pending", "resubmission_required"]),
  mapName: z.string(),
  attachmentIds: z.array(z.string().uuid()),
});

export const submissionStatusResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  status: z.union([submissionStatus, z.enum(["received", "evidence_pending", "evidence_stored"])]),
  mapName: z.string(),
  challengeId: z.string().optional(),
  difficulty: z.string().optional(),
  reason: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const adminPlayerDetailSchema = adminPlayerSummarySchema.extend({
  bindings: z.array(adminBindingSchema),
  recentSubmissions: z.array(submissionStatusResponseSchema.omit({ contractVersion: true })).max(10),
});

export const currentPlayerResponseSchema = z.object({
  contractVersion,
  player: z.object({
    playerId,
    playerName: z.string().trim().min(1).max(64),
    bindingStatus: z.literal("bound"),
    isAdmin: z.boolean().default(false),
  }),
  recentSubmissions: z.array(submissionStatusResponseSchema.omit({ contractVersion: true })).max(5),
});

export const errorResponseSchema = z.object({
  contractVersion,
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
  }),
});

export type QqBindingRequest = z.infer<typeof qqBindingRequestSchema>;
export type QqBindingResponse = z.infer<typeof qqBindingResponseSchema>;
export type QqLoginAttemptRequest = z.infer<typeof qqLoginAttemptRequestSchema>;
export type QqLoginAttemptResponse = z.infer<typeof qqLoginAttemptResponseSchema>;
export type QqLoginStatusResponse = z.infer<typeof qqLoginStatusResponseSchema>;
export type QqLoginVerifyRequest = z.infer<typeof qqLoginVerifyRequestSchema>;
export type QqLoginVerifyResponse = z.infer<typeof qqLoginVerifyResponseSchema>;
export type QqGroupAccessRequest = z.infer<typeof qqGroupAccessRequestSchema>;
export type QqGroupAccessResponse = z.infer<typeof qqGroupAccessResponseSchema>;
export type AdminPlayerSummary = z.infer<typeof adminPlayerSummarySchema>;
export type AdminPlayerDetail = z.infer<typeof adminPlayerDetailSchema>;
export type AdminPlayerListResponse = z.infer<typeof adminPlayerListResponseSchema>;
export type AdminPlayerStatusRequest = z.infer<typeof adminPlayerStatusRequestSchema>;
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type SubmissionStatusResponse = z.infer<typeof submissionStatusResponseSchema>;
export type CurrentPlayerResponse = z.infer<typeof currentPlayerResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Map = z.infer<typeof mapSchema>;
export type MapListResponse = z.infer<typeof mapListResponseSchema>;
export type Title = z.infer<typeof titleSchema>;
export type TitleListResponse = z.infer<typeof titleListResponseSchema>;
export type OwnedTitle = z.infer<typeof ownedTitleSchema>;
export type OwnedTitleListResponse = z.infer<typeof ownedTitleListResponseSchema>;
export type HistoricalTitleGrant = z.infer<typeof historicalTitleGrantSchema>;
export type HistoricalTitleGrantListResponse = z.infer<typeof historicalTitleGrantListResponseSchema>;
export type AdminTitleGrantRequest = z.infer<typeof adminTitleGrantRequestSchema>;
export type AdminTitleGrantBulkRequest = z.infer<typeof adminTitleGrantBulkRequestSchema>;
export type AdminTitleGrantBulkResponse = z.infer<typeof adminTitleGrantBulkResponseSchema>;
export type AdminTitleGrantRevokeRequest = z.infer<typeof adminTitleGrantRevokeRequestSchema>;
export type AdminChallenge = z.infer<typeof adminChallengeSchema>;
export type AdminChallengeListResponse = z.infer<typeof adminChallengeListResponseSchema>;
export type AdminChallengeUpdateRequest = z.infer<typeof adminChallengeUpdateRequestSchema>;
export type PlayerUploadSessionRequest = z.infer<typeof playerUploadSessionRequestSchema>;
export type PlayerUploadSessionResponse = z.infer<typeof playerUploadSessionResponseSchema>;
export type PlayerUploadCompleteRequest = z.infer<typeof playerUploadCompleteRequestSchema>;
export type AdminSubmission = z.infer<typeof adminSubmissionSchema>;
export type AdminSubmissionListResponse = z.infer<typeof adminSubmissionListResponseSchema>;
export type AdminSubmissionReviewRequest = z.infer<typeof adminSubmissionReviewRequestSchema>;
