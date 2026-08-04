import { z } from "zod";

export const contractVersion = z.literal("1");

const externalId = z.string().trim().min(1).max(256);
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
const historicalTitleGrantId = z.string().trim().min(1).max(256);
export const historicalMigrationStatusSchema = z.enum(["not_requested", "authorized", "completed", "partial", "retry_required", "cancelled"]);
export const adminHistoricalMigrationSummarySchema = z.object({ status: historicalMigrationStatusSchema, requestedCount: z.number().int().nonnegative(), completedCount: z.number().int().nonnegative(), conflictCount: z.number().int().nonnegative(), retryCount: z.number().int().nonnegative() });
export const publicHistoricalMigrationSummarySchema = z.object({ status: z.enum(["not_requested", "pending", "completed", "partial", "retry_required", "cancelled"]), requestedCount: z.number().int().nonnegative(), restoredCount: z.number().int().nonnegative() });
const adminBindingInviteRequestBaseSchema = z.object({ contractVersion, playerName: z.string().trim().min(1).max(64), playerId, historicalTitleGrantIds: z.array(historicalTitleGrantId).max(1000).default([]) });
export const adminBindingInviteRequestSchema = adminBindingInviteRequestBaseSchema.superRefine((value, context) => {
  if (new Set(value.historicalTitleGrantIds).size !== value.historicalTitleGrantIds.length) context.addIssue({ code: "custom", path: ["historicalTitleGrantIds"], message: "Duplicate historical title grant" });
});
export const adminBindingInviteResponseSchema = z.object({ contractVersion, inviteId: z.string().uuid(), code: inviteCode, playerName: z.string(), playerId, expiresAt: z.number().int(), historicalMigration: adminHistoricalMigrationSummarySchema });
export const adminBindingInviteBatchRequestSchema = z.object({ contractVersion, invitations: z.array(adminBindingInviteRequestBaseSchema.omit({ contractVersion: true })).min(1).max(100) }).superRefine((value, context) => {
  const seen = new Set<string>();
  value.invitations.forEach((invitation, index) => {
    const key = `${invitation.playerName.toLocaleLowerCase()}#${invitation.playerId}`;
    if (seen.has(key)) context.addIssue({ code: "custom", path: ["invitations", index], message: "Duplicate BattleTag" });
    seen.add(key);
    if (new Set(invitation.historicalTitleGrantIds).size !== invitation.historicalTitleGrantIds.length) context.addIssue({ code: "custom", path: ["invitations", index, "historicalTitleGrantIds"], message: "Duplicate historical title grant" });
  });
});
export const adminBindingInviteBatchResponseSchema = z.object({ contractVersion, items: z.array(adminBindingInviteResponseSchema).min(1).max(100) });
export const adminBindingInviteStatusSchema = z.enum(["active", "redeemed", "expired", "revoked"]);
export const adminBindingInviteListItemSchema = z.object({ inviteId: z.string().uuid(), playerName: z.string(), playerId, status: adminBindingInviteStatusSchema, codeAvailable: z.boolean(), createdAt: z.number().int(), expiresAt: z.number().int(), redeemedAt: z.number().int().optional(), historicalMigration: adminHistoricalMigrationSummarySchema });
export const adminBindingInviteListResponseSchema = z.object({ contractVersion, items: z.array(adminBindingInviteListItemSchema) });
export const adminBindingInviteRevokeRequestSchema = z.object({ contractVersion, reason: z.string().trim().max(256).optional() });
export const adminBindingInviteCodeResponseSchema = z.object({ contractVersion, inviteId: z.string().uuid(), code: inviteCode });
export const adminActiveBindingSchema = z.object({ bindingId: z.string().uuid(), playerName: z.string(), playerId, groupOpenId: externalId, memberOpenId: externalId, createdAt: z.number().int() });
export const adminActiveBindingListResponseSchema = z.object({ contractVersion, items: z.array(adminActiveBindingSchema) });
export const bindingInviteRedeemRequestSchema = z.object({ contractVersion, code: inviteCode }).strict();
export const bindingInviteRedeemResponseSchema = z.object({ contractVersion, claimId: z.string().uuid(), claimToken: z.string().min(32), code: inviteClaimCode, playerName: z.string().trim().min(1).max(64), playerId, expiresAt: z.number().int() });
export const bindingClaimStatusResponseSchema = z.object({ contractVersion, status: z.enum(["pending_confirmation", "pending_review", "approved", "rejected", "expired"]), expiresAt: z.number().int(), historicalMigration: publicHistoricalMigrationSummarySchema });
export const bindingClaimSessionResponseSchema = z.object({ contractVersion, status: z.literal("authenticated") });
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
export const adminPlayerIdentityRequestSchema = z.object({ contractVersion, playerName: z.string().trim().min(1).max(64) });

const attachmentSchema = z.object({
  externalAttachmentId: externalId,
  contentType: z.string().trim().min(1).max(128),
  byteSize: z.number().int().nonnegative().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  sourceUrl: z.string().url().max(4096),
});

const submissionStatus = z.enum(["upload_pending", "ocr_pending", "awaiting_player_confirmation", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"]);

export const mapChallengeSchema = z.object({
  challengeId: externalId,
  family: z.literal("map"),
  type: z.literal("map_completion"),
  kind: z.enum(["difficulty_completion", "pioneer", "classic_completion", "map_title_achievement"]),
  name: z.string().trim().min(1).max(256),
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  titleKey: externalId.optional(),
  mapVariant: z.literal("classic").optional(),
  // Present only for map-title instances derived from map_title_rules.  Consumers
  // must use this explicit discriminator instead of treating a null slot as a
  // special case.
  mapTitleRule: z.object({
    ruleId: externalId,
    kind: z.string().trim().min(1).max(64),
    displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]),
    slot: z.enum(["pioneer", "conqueror", "dominator"]).nullable(),
    dynamic: z.literal(true),
  }).optional(),
  condition: z.string().trim().min(1).max(1024).optional(),
  evidenceRule: z.string().trim().min(1).max(2048).optional(),
  submissionMode: z.enum(["manual", "automatic"]).optional(),
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
  scope: z.enum(["global", "map"]).optional(),
  mapIds: z.array(externalId).max(256).optional(),
  mapVariant: z.literal("classic").optional(),
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
const effectGlossaryTermSchema = z.object({ key: z.string().trim().min(1).max(64), nameZh: z.string().trim().min(1).max(128), aliases: z.array(z.string().trim().min(1).max(128)).max(16), category: z.string().trim().min(1).max(64), summary: z.string().trim().min(1).max(512), definition: z.string().trim().min(1).max(4096), rules: z.array(z.string().trim().min(1).max(512)).max(16), sourceVersion: z.string().trim().min(1).max(64) });
const randomEventEffectAnnotationSchema = z.object({ tag: z.string().trim().min(1).max(64), term: effectGlossaryTermSchema });
export const randomEventSchema = z.object({
  eventId: externalId, name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), rarity: z.string().trim().min(1).max(32), description: z.string().trim().min(1).max(4096),
  durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().nonnegative().nullable(), weight: z.number().nonnegative().nullable(),
  gameVersion: z.string().trim().min(1).max(64), effectTags: z.array(z.string().trim().min(1).max(64)).max(16), effectAnnotations: z.array(randomEventEffectAnnotationSchema).max(16), releaseStatus: randomEventStatus, archived: z.boolean(), challenges: z.array(challengeSchema),
});
export const randomEventListResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) });
const randomEventWriteFields = z.object({ name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), rarity: z.string().trim().min(1).max(32), description: z.string().trim().min(1).max(4096), durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().nonnegative().nullable(), weight: z.number().nonnegative().nullable(), gameVersion: z.string().trim().min(1).max(64), effectTags: z.array(z.string().trim().min(1).max(64)).max(16), releaseStatus: randomEventStatus, challengeLinks: z.array(randomEventLinkSchema).max(64) }).strict();
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

const titleColorSchema = z.union([
  z.object({ kind: z.literal("heroColor"), index: z.number().int().nonnegative() }),
  z.object({ kind: z.literal("rgb"), value: z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255)]) }),
  z.object({ kind: z.literal("palette"), name: z.enum(["orange", "red", "purple", "gold", "blue"]) }),
]);

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
  color: titleColorSchema.nullable(),
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
export const agentAchievementListResponseSchema = z.object({ contractVersion, items: z.array(challengeSchema) }).merge(agentPage);
export const agentTitleListResponseSchema = z.object({ contractVersion, items: z.array(titleSchema) }).merge(agentPage);
export const agentPlayerTitleGrantSchema = z.object({ playerId, playerName: z.string().trim().min(1).max(64), titleKeys: z.array(externalId), allTitles: z.boolean() });
export const agentPlayerTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(agentPlayerTitleGrantSchema) }).merge(agentPage);
export const agentMapTitleHolderSchema = z.object({ mapId: externalId, titleKey: externalId, slot: z.enum(["pioneer", "conqueror", "dominator"]).nullable(), slotSemantics: z.enum(["named", "none"]), playerId, playerName: z.string().trim().min(1).max(64) });
export const agentMapTitleHolderListResponseSchema = z.object({ contractVersion, items: z.array(agentMapTitleHolderSchema) }).merge(agentPage);
export const agentSearchResultSchema = z.object({ kind: z.enum(["event", "map", "achievement", "title"]), id: externalId, name: z.string().trim().min(1).max(256), summary: z.string().trim().min(1).max(4096) });
export const agentSearchResponseSchema = z.object({ contractVersion, items: z.array(agentSearchResultSchema) }).merge(agentPage);
export const agentPageQuerySchema = agentPageQuery;

export const ownedTitleSchema = z.object({
  grantId: z.string().uuid(), titleKey: externalId, label: z.string(), icon: achievementIcon, iconUrl: z.string().url().max(2048).nullable().optional(), category: z.string(),
  condition: z.string().trim().min(1).max(1024), scope: z.enum(["global", "map"]), mapName: z.string().optional(), slot: z.enum(["pioneer", "conqueror", "dominator"]).optional(), grantedAt: z.number().int(),
});
export const ownedTitleListResponseSchema = z.object({ contractVersion, items: z.array(ownedTitleSchema) });
export const historicalTitleGrantSchema = ownedTitleSchema.extend({ grantId: historicalTitleGrantId, holderName: z.string(), playerAccountId: z.string().uuid().optional(), playerName: z.string().optional(), playerId: playerId.optional(), status: z.enum(["unclaimed", "active", "revoked"]), revokeReason: z.string().optional() });
export const adminTitleGrantStatsSchema = z.object({ pendingHolderCount: z.number().int().nonnegative(), unclaimedGrantCount: z.number().int().nonnegative(), migratedGrantCount: z.number().int().nonnegative() });
export const adminTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(historicalTitleGrantSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), hasMore: z.boolean(), stats: adminTitleGrantStatsSchema });
export const historicalTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(historicalTitleGrantSchema) });
export const adminTitleGrantRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), historicalTitleGrantId });
export const adminTitleGrantBulkRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), holderName: z.string().trim().min(1).max(256) });
export const adminTitleGrantBulkResponseSchema = z.object({ contractVersion, grantedCount: z.number().int().nonnegative() });
export const adminTitleGrantRevokeRequestSchema = z.object({ contractVersion, reason: z.string().trim().max(256).optional() });
export const adminManualTitleGrantRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), titleKey: externalId, mapId: externalId.optional(), reason: z.string().trim().min(1).max(512).optional() });
export const adminManualTitleGrantResponseSchema = z.object({ contractVersion, grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), mapId: externalId.nullable(), slot: z.enum(["pioneer", "conqueror", "dominator"]).nullable(), alreadyOwned: z.boolean() });

const adminMapChallengeSchema = mapChallengeSchema.extend({
  condition: z.string().trim().min(1).max(1024).optional(),
  evidenceRule: z.string().trim().min(1).max(2048).optional(),
  submissionMode: z.enum(["manual", "automatic"]).optional(),
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
  scope: z.enum(["global", "map"]).optional(),
  mapIds: z.array(externalId).max(256).optional(),
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
  color: titleColorSchema.nullable().optional(),
  status: z.enum(["active", "retired"]),
  gameVersion: z.string().trim().min(1).max(64),
  hasChallenge: z.literal(false),
});
export const adminChallengeSchema = z.discriminatedUnion("family", [adminMapChallengeSchema, adminAchievementChallengeSchema, adminCatalogTitleSchema]);
export const adminChallengeListResponseSchema = z.object({ contractVersion, items: z.array(adminChallengeSchema) });

const mapTitleRuleStatus = z.enum(["active", "sunsetting", "retired"]);
const mapTitleRuleSlot = z.enum(["pioneer", "conqueror", "dominator"]);
const mapTitleRuleShape = {
  titleKey: externalId,
  kind: z.string().trim().min(1).max(64),
  condition: z.string().trim().min(1).max(1024),
  evidenceRule: z.string().trim().min(1).max(2048),
  submissionMode: z.enum(["manual", "automatic"]),
  displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]),
  slot: mapTitleRuleSlot.nullable(),
  mapVariant: z.literal("classic").optional(),
  defaultScope: z.enum(["all_active", "explicit"]),
  status: mapTitleRuleStatus,
  introducedVersion: z.string().trim().min(1).max(64),
  retiredVersion: optionalRetirementVersion,
};
const mapTitleRuleInputSchema = z.object(mapTitleRuleShape).superRefine((value, ctx) => {
  if (value.status === "sunsetting" && value.retiredVersion === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "Sunsetting rules require a retired version" });
  if (value.status !== "sunsetting" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "Only sunsetting rules may have a retired version" });
  if (value.kind.trim().toLocaleLowerCase() === "pioneer" && value.defaultScope !== "explicit") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultScope"], message: "Pioneer rules require explicit map exceptions" });
});
export const adminMapTitleRuleSchema = z.object(mapTitleRuleShape).extend({
  ruleId: externalId,
  titleName: z.string().trim().min(1).max(256),
  retiredVersion: storedRetirementVersion.nullable(),
});
export const adminMapTitleRuleListResponseSchema = z.object({ contractVersion, items: z.array(adminMapTitleRuleSchema) });
export const adminMapTitleRuleCreateRequestSchema = mapTitleRuleInputSchema.safeExtend({ contractVersion });
export const adminMapTitleRuleUpdateRequestSchema = mapTitleRuleInputSchema.safeExtend({ contractVersion });
export const adminMapTitleRuleExceptionSchema = z.object({
  exceptionId: z.string().uuid(), ruleId: externalId, mapId: externalId, enabled: z.boolean(),
  condition: z.string().trim().min(1).max(1024).nullable(), evidenceRule: z.string().trim().min(1).max(2048).nullable(),
  submissionMode: z.enum(["manual", "automatic"]).nullable(), slot: mapTitleRuleSlot.nullable(),
});
export const adminMapTitleInheritanceSchema = z.object({
  mapId: externalId, rule: adminMapTitleRuleSchema, projected: z.boolean(),
  source: z.literal("map_title_rule"),
  effective: z.object({ condition: z.string(), evidenceRule: z.string(), submissionMode: z.enum(["manual", "automatic"]), slot: mapTitleRuleSlot.nullable() }).nullable(),
  exception: adminMapTitleRuleExceptionSchema.nullable(),
});
export const adminMapTitleInheritanceResponseSchema = z.object({ contractVersion, items: z.array(adminMapTitleInheritanceSchema) });
export const adminMapTitleRuleExceptionUpsertRequestSchema = z.object({
  contractVersion, enabled: z.boolean(), condition: z.string().trim().min(1).max(1024).nullable().optional(),
  evidenceRule: z.string().trim().min(1).max(2048).nullable().optional(), submissionMode: z.enum(["manual", "automatic"]).nullable().optional(), slot: mapTitleRuleSlot.nullable().optional(),
});

const adminMapChallengeUpdateSchema = z.object({
  contractVersion,
  family: z.literal("map"),
  name: z.string().trim().min(1).max(256).optional(),
  difficulty: z.string().trim().min(1).max(64).nullable().optional(),
  condition: z.string().trim().min(1).max(1024).optional(),
  evidenceRule: z.string().trim().min(1).max(2048).optional(),
  submissionMode: z.enum(["manual", "automatic"]).optional(),
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
  scope: z.enum(["global", "map"]).optional(),
  mapIds: z.array(externalId).max(256).optional(),
  mapVariant: z.literal("classic").optional(),
}).superRefine((value, ctx) => {
  if (value.status === "active" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "An active challenge cannot have a retired version" });
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  if (value.status !== "scheduled" && (value.startsAt !== undefined || value.endsAt !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Only scheduled challenges may have a time window" });
  if (value.scope === "global" && value.mapIds?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mapIds"], message: "Global challenges cannot target maps" });
});
export const adminChallengeUpdateRequestSchema = z.union([adminMapChallengeUpdateSchema, adminAchievementChallengeUpdateSchema]);

const achievementKey = z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,63}$/);
export const adminAchievementCreateRequestSchema = z.object({
  contractVersion,
  titleKey: achievementKey,
  titleName: z.string().trim().min(1).max(256),
  icon: achievementIcon,
  category: z.string().trim().min(1).max(128),
  condition: z.string().trim().min(1).max(1024),
  evidenceRule: z.string().trim().min(1).max(2048),
  submissionMode: z.enum(["manual", "automatic"]),
  scope: z.enum(["global", "map"]),
  mapIds: z.array(externalId).max(256).default([]),
  mapVariant: z.literal("classic").optional(),
  status: titleChallengeStatus,
  gameVersion: z.string().trim().min(1).max(64),
  categoryOverride: z.string().trim().min(1).max(128).nullable().default(null),
  iconUrl: z.string().trim().url().max(2048).nullable().default(null),
  startsAt: optionalScheduleTimestamp,
  endsAt: optionalScheduleTimestamp,
  retiredVersion: optionalRetirementVersion,
}).superRefine((value, ctx) => {
  if (value.scope === "global" && value.mapIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mapIds"], message: "Global challenges cannot target maps" });
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  if (value.status === "scheduled" && (value.startsAt === undefined || value.endsAt === undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Scheduled challenges require a start and end time" });
  if (value.status === "sunsetting" && value.retiredVersion === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "Sunsetting challenges require a retired version" });
  if (value.status !== "scheduled" && (value.startsAt !== undefined || value.endsAt !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Only scheduled challenges may have a time window" });
  if (value.status !== "sunsetting" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "Only sunsetting challenges may have a retired version" });
});
export const adminCatalogTitleUpdateRequestSchema = z.object({
  contractVersion,
  status: titleChallengeStatus,
  label: z.string().trim().min(1).max(256).optional(),
  icon: achievementIcon.optional(),
  category: z.string().trim().min(1).max(128).optional(),
  scope: z.enum(["global", "map"]).optional(),
  displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]).optional(),
  color: titleColorSchema.nullable().optional(),
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
  challengeId: externalId.optional(),
  mapId: externalId.optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const playerSubmissionChallengeRequestSchema = z.object({ contractVersion, challengeId: externalId, mapId: externalId.optional() });

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
  status: z.union([submissionStatus, z.enum(["received", "evidence_pending", "evidence_stored"])]),
  challengeId: externalId,
  challenge: z.union([
    z.object({ family: z.literal("map"), name: z.string(), mapName: z.string(), difficulty: z.string().nullable() }),
    z.object({ family: z.literal("achievement"), titleName: z.string(), category: z.string(), condition: z.string(), evidenceRule: z.string(), mapVariant: z.literal("classic").optional() }),
  ]).nullable().optional(),
  mapName: z.string(),
  difficulty: z.string(),
  playerName: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  ocrStatus: z.enum(["not_started", "pending", "completed", "matched", "mismatch", "review_required", "failed"]).optional(),
  ocrAttempt: z.number().int().nullable().optional(),
  ocrErrorCode: z.string().nullable().optional(),
  ocr: z.record(z.string(), z.unknown()).nullable(),
  match: z.record(z.string(), z.unknown()).nullable().optional(),
  reason: z.string().nullable().optional(),
  evidenceUrl: z.string().url().nullable(),
  spotCheck: z.object({ status: z.enum(["pending", "confirmed", "revoked"]), sampledAt: z.number().int(), resolvedAt: z.number().int().nullable(), reviewer: z.string().nullable(), reason: z.string().nullable() }).nullable().optional(),
});

export const adminSubmissionListResponseSchema = z.object({ contractVersion, items: z.array(adminSubmissionSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), hasMore: z.boolean() });
export const adminSubmissionReviewRequestSchema = z.object({
  contractVersion,
  decision: z.enum(["approved", "rejected", "resubmission_required"]),
  reason: z.string().trim().max(512).optional(),
});
export const adminSubmissionReviewResponseSchema = z.object({
  contractVersion, submissionId: z.string().uuid(), decision: z.literal("approved"), grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), alreadyOwned: z.boolean(),
}).or(z.object({ contractVersion, submissionId: z.string().uuid(), decision: z.enum(["rejected", "resubmission_required"]), grant: z.null() }));
export const adminSubmissionChallengeRequestSchema = z.object({ contractVersion, challengeId: externalId, mapId: externalId.optional() });
export const adminSubmissionChallengeResponseSchema = z.object({ contractVersion, submissionId: z.string().uuid(), status: z.literal("ready_for_review"), challengeId: externalId });
export const adminSubmissionOcrRetryRequestSchema = z.object({ contractVersion });
export const adminSubmissionOcrRetryResponseSchema = z.object({ contractVersion, submissionId: z.string().uuid(), status: z.literal("ocr_pending") });
export const adminSubmissionSpotCheckRequestSchema = z.object({ contractVersion, decision: z.enum(["confirmed", "revoked"]), reason: z.string().trim().max(512).optional() });
export const adminSubmissionSpotCheckResponseSchema = z.object({ contractVersion, submissionId: z.string().uuid(), status: z.enum(["confirmed", "revoked"]), grantId: z.string().uuid().nullable() });

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
  achievementTitles: z.array(z.string()).optional(),
}).strict();

export const playerSubmissionDetailSchema = submissionStatusResponseSchema.extend({
  evidenceUrl: z.string().url().nullable().optional(),
  ocr: playerSubmissionOcrSummarySchema.optional(),
  ocrFailCount: z.number().int().nonnegative().optional(),
  manualReviewEligible: z.boolean().optional(),
  titleGrant: z.object({ grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), mapName: z.string().optional() }).optional(),
});

export const adminPlayerDetailSchema = adminPlayerSummarySchema.extend({
  bindings: z.array(adminBindingSchema),
  recentSubmissions: z.array(submissionStatusResponseSchema.omit({ contractVersion: true })).max(10),
  titleGrants: z.array(ownedTitleSchema.extend({ sourceType: z.enum(["historical", "submission", "manual", "automatic"]), grantedBy: z.string() })),
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
export type AdminActiveBindingListResponse = z.infer<typeof adminActiveBindingListResponseSchema>;
export type BindingInviteRedeemRequest = z.infer<typeof bindingInviteRedeemRequestSchema>;
export type BindingInviteRedeemResponse = z.infer<typeof bindingInviteRedeemResponseSchema>;
export type BindingClaimStatusResponse = z.infer<typeof bindingClaimStatusResponseSchema>;
export type BindingClaimSessionResponse = z.infer<typeof bindingClaimSessionResponseSchema>;
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
export type AdminPlayerIdentityRequest = z.infer<typeof adminPlayerIdentityRequestSchema>;
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;
export type SubmissionResponse = z.infer<typeof submissionResponseSchema>;
export type SubmissionStatusResponse = z.infer<typeof submissionStatusResponseSchema>;
export type PlayerSubmissionDetail = z.infer<typeof playerSubmissionDetailSchema>;
export type PlayerSubmissionChallengeRequest = z.infer<typeof playerSubmissionChallengeRequestSchema>;
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
export type AgentPlayerTitleGrant = z.infer<typeof agentPlayerTitleGrantSchema>;
export type AgentPlayerTitleGrantListResponse = z.infer<typeof agentPlayerTitleGrantListResponseSchema>;
export type AgentMapTitleHolder = z.infer<typeof agentMapTitleHolderSchema>;
export type AgentMapTitleHolderListResponse = z.infer<typeof agentMapTitleHolderListResponseSchema>;
export type AgentSearchResult = z.infer<typeof agentSearchResultSchema>;
export type AgentSearchResponse = z.infer<typeof agentSearchResponseSchema>;
export type OwnedTitle = z.infer<typeof ownedTitleSchema>;
export type OwnedTitleListResponse = z.infer<typeof ownedTitleListResponseSchema>;
export type HistoricalTitleGrant = z.infer<typeof historicalTitleGrantSchema>;
export type HistoricalTitleGrantListResponse = z.infer<typeof historicalTitleGrantListResponseSchema>;
export type AdminTitleGrantListResponse = z.infer<typeof adminTitleGrantListResponseSchema>;
export type AdminTitleGrantRequest = z.infer<typeof adminTitleGrantRequestSchema>;
export type AdminTitleGrantBulkRequest = z.infer<typeof adminTitleGrantBulkRequestSchema>;
export type AdminTitleGrantBulkResponse = z.infer<typeof adminTitleGrantBulkResponseSchema>;
export type AdminTitleGrantRevokeRequest = z.infer<typeof adminTitleGrantRevokeRequestSchema>;
export type AdminManualTitleGrantRequest = z.infer<typeof adminManualTitleGrantRequestSchema>;
export type AdminManualTitleGrantResponse = z.infer<typeof adminManualTitleGrantResponseSchema>;
export type AdminChallenge = z.infer<typeof adminChallengeSchema>;
export type AdminChallengeListResponse = z.infer<typeof adminChallengeListResponseSchema>;
export type AdminChallengeUpdateRequest = z.infer<typeof adminChallengeUpdateRequestSchema>;
export type AdminAchievementCreateRequest = z.infer<typeof adminAchievementCreateRequestSchema>;
export type AdminCatalogTitleUpdateRequest = z.infer<typeof adminCatalogTitleUpdateRequestSchema>;
export type AdminMapTitleRule = z.infer<typeof adminMapTitleRuleSchema>;
export type AdminMapTitleRuleListResponse = z.infer<typeof adminMapTitleRuleListResponseSchema>;
export type AdminMapTitleRuleCreateRequest = z.infer<typeof adminMapTitleRuleCreateRequestSchema>;
export type AdminMapTitleRuleUpdateRequest = z.infer<typeof adminMapTitleRuleUpdateRequestSchema>;
export type AdminMapTitleInheritanceResponse = z.infer<typeof adminMapTitleInheritanceResponseSchema>;
export type AdminMapTitleRuleExceptionUpsertRequest = z.infer<typeof adminMapTitleRuleExceptionUpsertRequestSchema>;
export type PlayerUploadSessionRequest = z.infer<typeof playerUploadSessionRequestSchema>;
export type PlayerUploadSessionResponse = z.infer<typeof playerUploadSessionResponseSchema>;
export type PlayerUploadCompleteRequest = z.infer<typeof playerUploadCompleteRequestSchema>;
export type AdminSubmission = z.infer<typeof adminSubmissionSchema>;
export type AdminSubmissionListResponse = z.infer<typeof adminSubmissionListResponseSchema>;
export type AdminSubmissionReviewRequest = z.infer<typeof adminSubmissionReviewRequestSchema>;
export type AdminSubmissionReviewResponse = z.infer<typeof adminSubmissionReviewResponseSchema>;
export type AdminSubmissionChallengeRequest = z.infer<typeof adminSubmissionChallengeRequestSchema>;
export type AdminSubmissionChallengeResponse = z.infer<typeof adminSubmissionChallengeResponseSchema>;
export type AdminSubmissionOcrRetryRequest = z.infer<typeof adminSubmissionOcrRetryRequestSchema>;
export type AdminSubmissionOcrRetryResponse = z.infer<typeof adminSubmissionOcrRetryResponseSchema>;
export type AdminSubmissionSpotCheckRequest = z.infer<typeof adminSubmissionSpotCheckRequestSchema>;
export type AdminSubmissionSpotCheckResponse = z.infer<typeof adminSubmissionSpotCheckResponseSchema>;
