import { z } from "zod";

export const contractVersion = z.literal("1");
const externalId = z.string().trim().min(1).max(256);

const releaseContentTypeSchema = z.enum(["event", "map", "title", "challenge"]);
const releaseOperationSchema = z.enum(["upsert", "retire", "delete"]);
const releaseContentItemSchema = z.object({
  contentType: releaseContentTypeSchema,
  contentId: externalId,
  operation: releaseOperationSchema,
  data: z.record(z.string(), z.unknown()),
});

export const releaseSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  candidateId: externalId,
  baseReleaseId: externalId.nullable(),
  sourceVersion: z.string().trim().min(1).max(64),
  generatedAt: z.number().int().positive(),
  items: z.array(releaseContentItemSchema).max(10000),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const releaseDraftCreateRequestSchema = z.object({
  contractVersion,
  name: z.string().trim().min(1).max(128),
});

export const releaseDiffChangeSchema = z.object({
  contentType: releaseContentTypeSchema,
  contentId: externalId,
  change: z.enum(["added", "modified", "removed"]),
  beforeOperation: releaseOperationSchema.nullable(),
  afterOperation: releaseOperationSchema.nullable(),
  before: z.record(z.string(), z.unknown()).nullable(),
  after: z.record(z.string(), z.unknown()).nullable(),
});

export const releaseDraftResponseSchema = z.object({
  contractVersion,
  draftId: externalId,
  name: z.string(),
  status: z.literal("open"),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const releaseDraftDetailResponseSchema = releaseDraftResponseSchema.extend({
  items: z.array(releaseContentItemSchema).max(10000),
  diff: z.array(releaseDiffChangeSchema).max(10000),
});

export const releaseChangeSetFromDraftRequestSchema = z.object({
  contractVersion,
  name: z.string().trim().min(1).max(128),
});

export const releaseDraftItemRequestSchema = z.object({
  contractVersion,
  contentType: releaseContentTypeSchema,
  contentId: externalId,
  operation: releaseOperationSchema,
  data: z.record(z.string(), z.unknown()),
});

export const releaseChangeSetCreateRequestSchema = z.object({
  contractVersion,
  draftId: externalId,
  name: z.string().trim().min(1).max(128),
  itemIds: z.array(externalId).min(1).max(10000),
});

export const releaseBuildResultRequestSchema = z.object({
  contractVersion,
  buildId: externalId,
  candidateId: externalId,
  status: z.enum(["succeeded", "failed"]),
  bastionCommitSha: z.string().trim().min(1).max(128),
  snapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
  artifactRefs: z.array(z.string().trim().min(1).max(1024)).max(32),
  warnings: z.array(z.string().trim().max(2048)).max(100),
  errors: z.array(z.string().trim().max(2048)).max(100),
});

export const releaseBuildResponseSchema = z.object({
  contractVersion,
  buildId: externalId,
  candidateId: externalId,
  releaseId: externalId,
  status: z.enum(["queued", "running", "succeeded", "failed"]),
});

export const releaseOverviewResponseSchema = z.object({
  contractVersion,
  current: z.object({ releaseId: externalId, candidateId: externalId, sourceVersion: z.string(), bastionCommitSha: z.string().nullable(), activatedAt: z.number().int().nullable() }).nullable(),
  next: z.object({ candidateId: externalId, sourceVersion: z.string(), snapshotHash: z.string(), status: z.enum(["candidate", "queued", "running", "succeeded", "failed"]) }).nullable(),
  drafts: z.array(z.object({ draftId: externalId, name: z.string(), status: z.string(), updatedAt: z.number().int() })),
  releases: z.array(z.object({ releaseId: externalId, candidateId: externalId, sourceVersion: z.string(), status: z.string(), bastionCommitSha: z.string().nullable(), activatedAt: z.number().int().nullable(), createdAt: z.number().int() })),
});

const playerId = z.string().regex(/^\d{1,10}$/);
const retirementVersion = z.string().regex(/^\d{2}\.\d{4}\.[1-9]\d*$/);
const storedRetirementVersion = z.string().trim().min(1).max(64);
const challengeStatus = z.enum(["active", "sunsetting", "retired"]);
const playableChallengeStatus = z.enum(["active", "sunsetting"]);
const titleChallengeStatus = z.enum(["scheduled", "active", "sunsetting", "retired"]);
const scheduleTimestamp = z.number().int().positive();
const achievementIcon = z.string().trim().regex(/^[a-z0-9-]+$/).max(64);
const optionalRetirementVersion = z.preprocess((value) => value === null ? undefined : value, retirementVersion.optional());
const optionalScheduleTimestamp = z.preprocess((value) => value === null ? undefined : value, scheduleTimestamp.optional());

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

const inviteCode = z.string().trim().regex(/^[A-Z2-9]{12}$/);
const inviteClaimCode = z.string().trim().regex(/^[A-Z2-9]{6}$/);
export const adminBindingInviteRequestSchema = z.object({ contractVersion, playerName: z.string().trim().min(1).max(64), playerId });
export const adminBindingInviteResponseSchema = z.object({ contractVersion, inviteId: z.string().uuid(), code: inviteCode, playerName: z.string(), playerId, expiresAt: z.number().int() });
export const adminBindingInviteBatchRequestSchema = z.object({ contractVersion, invitations: z.array(adminBindingInviteRequestSchema.omit({ contractVersion: true })).min(1).max(100) }).superRefine((value, context) => {
  const seen = new Set<string>();
  value.invitations.forEach((invitation, index) => {
    const key = `${invitation.playerName.toLocaleLowerCase()}#${invitation.playerId}`;
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["invitations", index], message: "Duplicate BattleTag" });
    seen.add(key);
  });
});
export const adminBindingInviteBatchResponseSchema = z.object({ contractVersion, items: z.array(adminBindingInviteResponseSchema).min(1).max(100) });
export const adminBindingInviteStatusSchema = z.enum(["active", "redeemed", "expired", "revoked"]);
export const adminBindingInviteListItemSchema = z.object({ inviteId: z.string().uuid(), playerName: z.string(), playerId, status: adminBindingInviteStatusSchema, codeAvailable: z.boolean(), createdAt: z.number().int(), expiresAt: z.number().int(), redeemedAt: z.number().int().optional() });
export const adminBindingInviteListResponseSchema = z.object({ contractVersion, items: z.array(adminBindingInviteListItemSchema) });
export const adminBindingInviteRevokeRequestSchema = z.object({ contractVersion, reason: z.string().trim().max(256).optional() });
export const adminBindingInviteCodeResponseSchema = z.object({ contractVersion, inviteId: z.string().uuid(), code: inviteCode });
export const bindingInviteRedeemRequestSchema = z.object({ contractVersion, code: inviteCode, playerName: z.string().trim().min(1).max(64), playerId });
export const bindingInviteRedeemResponseSchema = z.object({ contractVersion, claimId: z.string().uuid(), claimToken: z.string().min(32), code: inviteClaimCode, expiresAt: z.number().int() });
export const bindingClaimStatusResponseSchema = z.object({ contractVersion, status: z.enum(["pending_confirmation", "pending_review", "approved", "rejected", "expired"]), expiresAt: z.number().int() });
export const qqBindingClaimVerifyRequestSchema = z.object({ contractVersion, provider: z.literal("qq"), code: inviteClaimCode, groupOpenId: externalId, memberOpenId: externalId, messageId: externalId });
export const adminBindingClaimDecisionRequestSchema = z.object({ contractVersion, decision: z.enum(["approved", "rejected"]), reason: z.string().trim().max(256).optional() });
export const adminBindingClaimOperationTypeSchema = z.enum(["initial_binding", "rebind_account", "qq_transfer", "conflict"]);
export const targetAccountBindingSchema = z.object({ bindingId: z.string().uuid(), memberOpenId: externalId, groupOpenId: externalId.optional() });
export const qqBoundAccountSchema = z.object({ playerAccountId: z.string().uuid(), playerName: z.string(), playerId });
export const adminBindingClaimSchema = z.object({
  claimId: z.string().uuid(),
  playerName: z.string(),
  playerId,
  status: z.enum(["pending_confirmation", "pending_review", "approved", "rejected", "expired"]),
  createdAt: z.number().int(),
  memberOpenId: externalId.optional(),
  groupOpenId: externalId.optional(),
  invitedBy: z.string(),
  affectedPlayerAccountId: z.string().uuid().optional(),
  targetAccountBinding: targetAccountBindingSchema.optional(),
  qqBoundAccounts: z.array(qqBoundAccountSchema).optional(),
  revokingBindingCount: z.number().int().nonnegative().optional(),
  invalidatingSessionCount: z.number().int().nonnegative().optional(),
  operationType: adminBindingClaimOperationTypeSchema.optional(),
});
export const adminBindingClaimListResponseSchema = z.object({ contractVersion, items: z.array(adminBindingClaimSchema) });

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
const qqGroupStatus = z.enum(["pending", "active", "legacy", "disconnected"]);
export const qqGroupAccessRequestSchema = z.object({ contractVersion, groupOpenId: externalId, displayName: z.string().trim().max(128).default(""), environment: z.enum(["production", "test"]), status: qqGroupStatus, bindEnabled: z.boolean(), verifyEnabled: z.boolean() });
export const qqGroupAccessResponseSchema = qqGroupAccessRequestSchema.extend({ updatedAt: z.number().int() });
export const qqGroupRegistrationRequestSchema = z.object({ contractVersion, groupOpenId: externalId, status: z.enum(["pending", "disconnected"]), occurredAt: z.number().int().nonnegative() });

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
export const adminPlayerListResponseSchema = z.object({ contractVersion, items: z.array(adminPlayerSummarySchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), hasMore: z.boolean() });
export const adminPlayerStatusRequestSchema = z.object({ contractVersion, status: adminPlayerStatus, reason: z.string().trim().max(256).optional() });

const attachmentSchema = z.object({
  externalAttachmentId: externalId,
  contentType: z.string().trim().min(1).max(128),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceUrl: z.string().url().max(4096),
});

const submissionStatus = z.enum(["upload_pending", "ocr_pending", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"]);
const adminSubmissionStatus = z.union([z.enum(["received", "evidence_pending", "evidence_stored"]), submissionStatus]);

export const mapChallengeSchema = z.object({
  challengeId: externalId,
  family: z.literal("map"),
  type: z.literal("map_completion"),
  kind: z.enum(["difficulty_completion", "pioneer", "classic_completion"]),
  name: z.string().trim().min(1).max(256),
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  difficulty: z.string().trim().min(1).max(64).optional(),
  gameVersion: z.string().trim().min(1).max(64),
  status: playableChallengeStatus,
  retiredVersion: storedRetirementVersion.optional(),
});

export const achievementChallengeSchema = z.object({
  challengeId: externalId,
  family: z.literal("achievement"),
  type: z.literal("title_achievement"),
  kind: z.literal("title_achievement"),
  titleKey: externalId,
  titleName: z.string().trim().min(1).max(256),
  icon: achievementIcon,
  iconUrl: z.string().url().max(2048).nullable().optional(),
  category: z.string().trim().min(1).max(128),
  condition: z.string().trim().min(1).max(1024),
  evidenceRule: z.string().trim().min(1).max(2048),
  gameVersion: z.string().trim().min(1).max(64),
  status: z.enum(["scheduled", "active", "sunsetting"]),
  startsAt: scheduleTimestamp.optional(),
  endsAt: scheduleTimestamp.optional(),
  retiredVersion: storedRetirementVersion.optional(),
  submissionMode: z.enum(["manual", "automatic"]),
});

export const challengeSchema = z.discriminatedUnion("family", [mapChallengeSchema, achievementChallengeSchema]);

export const challengeListResponseSchema = z.object({ contractVersion, items: z.array(challengeSchema) });

export const mapSchema = z.object({
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  gameVersion: z.string().trim().min(1).max(64),
  difficultyRating: z.enum(["T0", "T1", "T2", "T3", "T4", "T5"]).nullable(),
  mechanics: z.array(z.string().trim().min(1).max(64)).max(16),
  coverUrl: z.string().trim().url().max(2048).nullable(),
  backgroundUrl: z.string().trim().url().max(2048).nullable(),
});

export const mapListResponseSchema = z.object({ contractVersion, items: z.array(mapSchema) });

const randomEventStatus = z.enum(["development", "implemented", "removed"]);
const randomEventLinkSchema = z.object({ family: z.enum(["map", "achievement"]), challengeId: externalId });
export const randomEventSchema = z.object({
  eventId: externalId, name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), rarity: z.string().trim().min(1).max(32), description: z.string().trim().min(1).max(4096),
  durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().int().nonnegative().nullable(), weight: z.number().nonnegative().nullable(), appearanceProbability: z.number().min(-1).max(1).nullable(), categoryProbability: z.number().min(0).max(1).nullable(), groupTotalWeight: z.number().nonnegative().nullable(), groupSize: z.number().int().nonnegative().nullable(), failureProbability: z.number().min(0).max(1).nullable(), guaranteeProbability: z.number().min(0).max(1).nullable(), globalAppearanceProbability: z.number().min(-1).max(1).nullable(),
  gameVersion: z.string().trim().min(1).max(64), effectTags: z.array(z.string().trim().min(1).max(64)).max(16), releaseStatus: randomEventStatus, archived: z.boolean(), challenges: z.array(challengeSchema),
});
export const randomEventListResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) });
const randomEventWriteFields = z.object({ name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), rarity: z.string().trim().min(1).max(32), description: z.string().trim().min(1).max(4096), durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().int().nonnegative().nullable(), weight: z.number().nonnegative().nullable(), appearanceProbability: z.number().min(-1).max(1).nullable(), categoryProbability: z.number().min(0).max(1).nullable(), groupTotalWeight: z.number().nonnegative().nullable(), groupSize: z.number().int().nonnegative().nullable(), failureProbability: z.number().min(0).max(1).nullable(), guaranteeProbability: z.number().min(0).max(1).nullable(), globalAppearanceProbability: z.number().min(-1).max(1).nullable(), gameVersion: z.string().trim().min(1).max(64), effectTags: z.array(z.string().trim().min(1).max(64)).max(16), releaseStatus: randomEventStatus, challengeLinks: z.array(randomEventLinkSchema).max(64) });
export const adminRandomEventCreateRequestSchema = z.object({ contractVersion }).merge(randomEventWriteFields);
export const adminRandomEventUpdateRequestSchema = z.object({ contractVersion }).merge(randomEventWriteFields);
export const adminRandomEventImportRequestSchema = z.object({ contractVersion, fileName: z.string().trim().min(1).max(256), csv: z.string().min(1).max(512 * 1024) });
export const adminRandomEventImportPreviewSchema = z.object({ sourceHash: z.string(), validRowCount: z.number().int().nonnegative(), errors: z.array(z.object({ row: z.number().int().positive(), message: z.string() })), rows: z.array(z.object({ name: z.string(), category: z.string(), releaseStatus: randomEventStatus })).max(20) });

export const adminMapMetadataUpdateRequestSchema = z.object({
  contractVersion,
  difficultyRating: z.enum(["T0", "T1", "T2", "T3", "T4", "T5"]).nullable(),
  mechanics: z.array(z.string().trim().min(1).max(64)).max(16),
  coverUrl: z.string().trim().url().max(2048).nullable(),
  backgroundUrl: z.string().trim().url().max(2048).nullable(),
});

export const titleSchema = z.object({
  titleKey: externalId,
  label: z.string().trim().min(1).max(256),
  icon: achievementIcon,
  iconUrl: z.string().url().max(2048).nullable().optional(),
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

const agentPage = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
const agentPageQuery = z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().positive().max(100).default(20) });
export const agentEventListResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) }).merge(agentPage);
export const agentMapListResponseSchema = z.object({ contractVersion, items: z.array(mapSchema) }).merge(agentPage);
export const agentAchievementListResponseSchema = z.object({ contractVersion, items: z.array(achievementChallengeSchema) }).merge(agentPage);
export const agentTitleListResponseSchema = z.object({ contractVersion, items: z.array(titleSchema) }).merge(agentPage);
export const agentSearchResultSchema = z.object({ kind: z.enum(["event", "map", "achievement", "title"]), id: externalId, name: z.string().trim().min(1).max(256), summary: z.string().trim().min(1).max(4096) });
export const agentSearchResponseSchema = z.object({ contractVersion, items: z.array(agentSearchResultSchema) }).merge(agentPage);
export const agentPageQuerySchema = agentPageQuery;

export const ownedTitleSchema = z.object({
  grantId: z.string().uuid(), titleKey: externalId, label: z.string(), icon: achievementIcon, iconUrl: z.string().url().max(2048).nullable().optional(), category: z.string(),
  condition: z.string().trim().min(1).max(1024), scope: z.enum(["global", "map"]), mapName: z.string().optional(), slot: z.enum(["pioneer", "conqueror", "dominator"]).optional(), grantedAt: z.number().int(),
});
export const ownedTitleListResponseSchema = z.object({ contractVersion, items: z.array(ownedTitleSchema) });
export const historicalTitleGrantSchema = ownedTitleSchema.extend({ holderName: z.string(), playerAccountId: z.string().uuid().optional(), playerName: z.string().optional(), playerId: playerId.optional(), status: z.enum(["unclaimed", "active", "revoked"]), revokeReason: z.string().optional() });
export const historicalTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(historicalTitleGrantSchema) });
export const adminTitleGrantRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), historicalTitleGrantId: z.string().uuid() });
export const adminTitleGrantBulkRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), holderName: z.string().trim().min(1).max(256) });
export const adminTitleGrantBulkResponseSchema = z.object({ contractVersion, grantedCount: z.number().int().nonnegative() });
export const adminTitleGrantRevokeRequestSchema = z.object({ contractVersion, reason: z.string().trim().max(256).optional() });

const adminMapChallengeSchema = mapChallengeSchema.extend({
  status: challengeStatus,
  introducedVersion: z.string().trim().min(1).max(64),
  retiredVersion: storedRetirementVersion.nullable(),
});
const adminAchievementChallengeSchema = achievementChallengeSchema.extend({
  categoryOverride: z.string().trim().min(1).max(128).nullable(),
  status: titleChallengeStatus,
  introducedVersion: z.string().trim().min(1).max(64),
  retiredVersion: storedRetirementVersion.nullable(),
  startsAt: scheduleTimestamp.nullable().optional(),
  endsAt: scheduleTimestamp.nullable().optional(),
});
const adminCatalogTitleSchema = z.object({
  challengeId: externalId,
  family: z.literal("title_catalog"),
  type: z.literal("title_catalog"),
  titleKey: externalId,
  titleName: z.string().trim().min(1).max(256),
  icon: achievementIcon,
  iconUrl: z.string().url().max(2048).nullable().optional(),
  category: z.string().trim().min(1).max(128),
  condition: z.string().trim().min(1).max(1024),
  availability: z.enum(["active", "retired"]),
  scope: z.enum(["global", "map"]),
  displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]),
  status: z.enum(["active", "retired"]),
  gameVersion: z.string().trim().min(1).max(64),
  hasChallenge: z.literal(false),
});
export const adminChallengeSchema = z.discriminatedUnion("family", [adminMapChallengeSchema, adminAchievementChallengeSchema, adminCatalogTitleSchema]);
export const adminChallengeListResponseSchema = z.object({ contractVersion, items: z.array(adminChallengeSchema) });

const adminMapChallengeUpdateSchema = z.object({
  contractVersion,
  family: z.literal("map"),
  status: challengeStatus,
  retiredVersion: optionalRetirementVersion,
}).superRefine((value, ctx) => {
  if (value.status === "active" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "An active challenge cannot have a retired version" });
});
const adminAchievementChallengeUpdateSchema = z.object({
  contractVersion,
  family: z.literal("achievement"),
  condition: z.string().trim().min(1).max(1024),
  evidenceRule: z.string().trim().min(1).max(2048),
  submissionMode: z.enum(["manual", "automatic"]),
  categoryOverride: z.string().trim().min(1).max(128).nullable(),
  iconUrl: z.string().trim().url().max(2048).nullable().optional(),
  status: titleChallengeStatus,
  retiredVersion: optionalRetirementVersion,
  startsAt: optionalScheduleTimestamp,
  endsAt: optionalScheduleTimestamp,
}).superRefine((value, ctx) => {
  if (value.status === "active" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "An active challenge cannot have a retired version" });
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  if (value.status !== "scheduled" && (value.startsAt !== undefined || value.endsAt !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Only scheduled challenges may have a time window" });
});
export const adminChallengeUpdateRequestSchema = z.union([adminMapChallengeUpdateSchema, adminAchievementChallengeUpdateSchema]);
export const adminCatalogTitleUpdateRequestSchema = z.object({
  contractVersion,
  status: titleChallengeStatus,
  condition: z.string().trim().min(1).max(1024).optional(),
  evidenceRule: z.string().trim().min(1).max(2048).optional(),
  submissionMode: z.enum(["manual", "automatic"]).optional(),
  categoryOverride: z.string().trim().min(1).max(128).nullable().optional(),
  iconUrl: z.string().trim().url().max(2048).nullable().optional(),
  retiredVersion: optionalRetirementVersion,
  startsAt: optionalScheduleTimestamp,
  endsAt: optionalScheduleTimestamp,
}).superRefine((value, ctx) => {
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  if (value.status !== "scheduled" && (value.startsAt !== undefined || value.endsAt !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Only scheduled challenges may have a time window" });
});

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

export const adminSubmissionChallengeSchema = z.discriminatedUnion("family", [
  z.object({ family: z.literal("map"), name: z.string(), mapName: z.string(), difficulty: z.string().nullable() }),
  z.object({ family: z.literal("achievement"), titleName: z.string(), category: z.string(), condition: z.string(), evidenceRule: z.string() }),
]);
export const adminOcrStatusSchema = z.enum(["not_started", "pending", "matched", "mismatch", "review_required", "error"]);

export const adminSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  status: adminSubmissionStatus,
  challengeId: externalId,
  challenge: adminSubmissionChallengeSchema.nullable(),
  mapName: z.string(),
  difficulty: z.string(),
  playerName: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  ocrStatus: adminOcrStatusSchema,
  ocrAttempt: z.number().int().positive().nullable(),
  ocrErrorCode: z.string().nullable(),
  ocr: z.record(z.string(), z.unknown()).nullable(),
  evidenceUrl: z.string().url().nullable(),
});

export const adminSubmissionListResponseSchema = z.object({ contractVersion, items: z.array(adminSubmissionSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), hasMore: z.boolean() });
export const adminSubmissionReviewRequestSchema = z.object({
  contractVersion,
  decision: z.enum(["approved", "rejected", "resubmission_required"]),
  reason: z.string().trim().max(512).optional(),
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

export const playerSubmissionOcrSummarySchema = z.object({
  mapName: z.string().nullable(),
  difficulty: z.string().nullable(),
  playerName: z.string().nullable(),
  challengeCompleted: z.boolean().nullable(),
}).strict();

export const playerSubmissionDetailSchema = submissionStatusResponseSchema.extend({
  ocr: playerSubmissionOcrSummarySchema.optional(),
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
export type AdminBindingInviteRequest = z.infer<typeof adminBindingInviteRequestSchema>;
export type AdminBindingInviteResponse = z.infer<typeof adminBindingInviteResponseSchema>;
export type AdminBindingInviteBatchRequest = z.infer<typeof adminBindingInviteBatchRequestSchema>;
export type AdminBindingInviteBatchResponse = z.infer<typeof adminBindingInviteBatchResponseSchema>;
export type AdminBindingInviteListResponse = z.infer<typeof adminBindingInviteListResponseSchema>;
export type AdminBindingInviteRevokeRequest = z.infer<typeof adminBindingInviteRevokeRequestSchema>;
export type AdminBindingInviteCodeResponse = z.infer<typeof adminBindingInviteCodeResponseSchema>;
export type BindingInviteRedeemRequest = z.infer<typeof bindingInviteRedeemRequestSchema>;
export type BindingInviteRedeemResponse = z.infer<typeof bindingInviteRedeemResponseSchema>;
export type BindingClaimStatusResponse = z.infer<typeof bindingClaimStatusResponseSchema>;
export type QqBindingClaimVerifyRequest = z.infer<typeof qqBindingClaimVerifyRequestSchema>;
export type AdminBindingClaimDecisionRequest = z.infer<typeof adminBindingClaimDecisionRequestSchema>;
export type AdminBindingClaimOperationType = z.infer<typeof adminBindingClaimOperationTypeSchema>;
export type AdminBindingClaim = z.infer<typeof adminBindingClaimSchema>;
export type AdminBindingClaimListResponse = z.infer<typeof adminBindingClaimListResponseSchema>;
export type QqLoginAttemptRequest = z.infer<typeof qqLoginAttemptRequestSchema>;
export type QqLoginAttemptResponse = z.infer<typeof qqLoginAttemptResponseSchema>;
export type QqLoginStatusResponse = z.infer<typeof qqLoginStatusResponseSchema>;
export type QqLoginVerifyRequest = z.infer<typeof qqLoginVerifyRequestSchema>;
export type QqLoginVerifyResponse = z.infer<typeof qqLoginVerifyResponseSchema>;
export type QqGroupAccessRequest = z.infer<typeof qqGroupAccessRequestSchema>;
export type QqGroupAccessResponse = z.infer<typeof qqGroupAccessResponseSchema>;
export type QqGroupRegistrationRequest = z.infer<typeof qqGroupRegistrationRequestSchema>;
export type AdminPlayerSummary = z.infer<typeof adminPlayerSummarySchema>;
export type AdminPlayerDetail = z.infer<typeof adminPlayerDetailSchema>;
export type AdminPlayerListResponse = z.infer<typeof adminPlayerListResponseSchema>;
export type AdminPlayerStatusRequest = z.infer<typeof adminPlayerStatusRequestSchema>;
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type SubmissionStatusResponse = z.infer<typeof submissionStatusResponseSchema>;
export type PlayerSubmissionDetail = z.infer<typeof playerSubmissionDetailSchema>;
export type CurrentPlayerResponse = z.infer<typeof currentPlayerResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Map = z.infer<typeof mapSchema>;
export type MapListResponse = z.infer<typeof mapListResponseSchema>;
export type RandomEvent = z.infer<typeof randomEventSchema>;
export type RandomEventListResponse = z.infer<typeof randomEventListResponseSchema>;
export type AdminRandomEventCreateRequest = z.infer<typeof adminRandomEventCreateRequestSchema>;
export type AdminRandomEventUpdateRequest = z.infer<typeof adminRandomEventUpdateRequestSchema>;
export type AdminRandomEventImportRequest = z.infer<typeof adminRandomEventImportRequestSchema>;
export type AdminMapMetadataUpdateRequest = z.infer<typeof adminMapMetadataUpdateRequestSchema>;
export type Title = z.infer<typeof titleSchema>;
export type TitleListResponse = z.infer<typeof titleListResponseSchema>;
export type AgentEventListResponse = z.infer<typeof agentEventListResponseSchema>;
export type AgentMapListResponse = z.infer<typeof agentMapListResponseSchema>;
export type AgentAchievementListResponse = z.infer<typeof agentAchievementListResponseSchema>;
export type AgentTitleListResponse = z.infer<typeof agentTitleListResponseSchema>;
export type AgentSearchResult = z.infer<typeof agentSearchResultSchema>;
export type AgentSearchResponse = z.infer<typeof agentSearchResponseSchema>;
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
export type AdminCatalogTitleUpdateRequest = z.infer<typeof adminCatalogTitleUpdateRequestSchema>;
export type PlayerUploadSessionRequest = z.infer<typeof playerUploadSessionRequestSchema>;
export type PlayerUploadSessionResponse = z.infer<typeof playerUploadSessionResponseSchema>;
export type PlayerUploadCompleteRequest = z.infer<typeof playerUploadCompleteRequestSchema>;
export type AdminSubmission = z.infer<typeof adminSubmissionSchema>;
export type AdminSubmissionListResponse = z.infer<typeof adminSubmissionListResponseSchema>;
export type AdminSubmissionReviewRequest = z.infer<typeof adminSubmissionReviewRequestSchema>;
export type ReleaseContentItem = z.infer<typeof releaseContentItemSchema>;
export type ReleaseSnapshot = z.infer<typeof releaseSnapshotSchema>;
export type ReleaseDraftCreateRequest = z.infer<typeof releaseDraftCreateRequestSchema>;
export type ReleaseDraftResponse = z.infer<typeof releaseDraftResponseSchema>;
export type ReleaseDraftDetailResponse = z.infer<typeof releaseDraftDetailResponseSchema>;
export type ReleaseDiffChange = z.infer<typeof releaseDiffChangeSchema>;
export type ReleaseDraftItemRequest = z.infer<typeof releaseDraftItemRequestSchema>;
export type ReleaseChangeSetCreateRequest = z.infer<typeof releaseChangeSetCreateRequestSchema>;
export type ReleaseChangeSetFromDraftRequest = z.infer<typeof releaseChangeSetFromDraftRequestSchema>;
export type ReleaseBuildResultRequest = z.infer<typeof releaseBuildResultRequestSchema>;
export type ReleaseBuildResponse = z.infer<typeof releaseBuildResponseSchema>;
export type ReleaseOverviewResponse = z.infer<typeof releaseOverviewResponseSchema>;
