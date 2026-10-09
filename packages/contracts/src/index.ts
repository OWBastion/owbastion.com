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
const gameVersionValue = z.string().trim().min(1).max(64).nullable();
const optionalGameVersion = gameVersionValue.optional();

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
export const qqBindingClaimVerifyResponseSchema = z.object({ contractVersion, status: z.literal("verified"), environment: z.enum(["production", "test"]) });
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
export const qqScreenshotSubmissionRequestSchema = z.object({
  contractVersion,
  commandMessageId: externalId,
  groupOpenId: externalId,
  memberOpenId: externalId,
  attachment: z.object({
    url: z.string().trim().url().max(2048),
    filename: z.string().trim().min(1).max(256),
    contentType: z.string().trim().min(1).max(128),
    size: z.number().int().positive().optional(),
  }).strict(),
}).strict();
export const qqScreenshotSubmissionResponseSchema = z.object({ contractVersion, submissionId: z.string().uuid(), status: z.literal("processing") });
const passkeyCredentialResponseSchema = z.record(z.string(), z.unknown());
const passkeyOptionsSchema = z.record(z.string(), z.unknown());
export const passkeyLoginOptionsRequestSchema = z.object({ contractVersion }).strict();
export const passkeyLoginOptionsResponseSchema = z.object({ contractVersion, challengeId: z.string().uuid(), options: passkeyOptionsSchema });
export const passkeyLoginVerifyRequestSchema = z.object({ contractVersion, challengeId: z.string().uuid(), credential: passkeyCredentialResponseSchema }).strict();
export const passkeyAuthenticatedRegistrationOptionsRequestSchema = z.object({ contractVersion, name: z.string().trim().min(1).max(64) }).strict();
export const passkeyPublicRegistrationOptionsRequestSchema = z.object({ contractVersion, token: z.string().min(32).max(256), name: z.string().trim().min(1).max(64) }).strict();
export const passkeyRegistrationOptionsResponseSchema = z.object({ contractVersion, challengeId: z.string().uuid(), options: passkeyOptionsSchema });
export const passkeyRegistrationVerifyRequestSchema = z.object({ contractVersion, challengeId: z.string().uuid(), credential: passkeyCredentialResponseSchema, name: z.string().trim().min(1).max(64) }).strict();
export const passkeyPublicRegistrationVerifyRequestSchema = z.object({ contractVersion, challengeId: z.string().uuid(), token: z.string().min(32).max(256), credential: passkeyCredentialResponseSchema, name: z.string().trim().min(1).max(64) }).strict();
export const passkeyCredentialSchema = z.object({ passkeyId: z.string().uuid(), name: z.string().trim().min(1).max(64), createdAt: z.number().int().positive(), lastUsedAt: z.number().int().positive().nullable() });
export const passkeyCredentialListResponseSchema = z.object({ contractVersion, items: z.array(passkeyCredentialSchema), qqBound: z.boolean() });
export const passkeyCredentialDeleteResponseSchema = z.object({ contractVersion, removed: z.literal(true) });
export const adminPasskeyRecoveryRequestSchema = z.object({ contractVersion, identityVerified: z.literal(true) }).strict();
export const adminPasskeyRecoveryResponseSchema = z.object({ contractVersion, recoveryUrl: z.string().url(), expiresAt: z.number().int().positive() });
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

const submissionStatus = z.enum(["upload_pending", "ocr_pending", "awaiting_player_confirmation", "ready_for_review", "ocr_review_required", "approved", "rejected", "resubmission_required"]);
export const verifiedRunDifficultySchema = z.enum(["简单", "一般", "困难", "专家", "传奇", "地狱"]);
const verifiedRunStatusSchema = z.enum(["active", "invalidated"]);
const masteryAcceptanceSourceSchema = z.enum(["submission_automatic", "submission_review"]);
const verifiedRunConflictFieldSchema = z.enum(["match_code", "map", "gameplay_revision", "map_variant", "difficulty", "game_version", "completion_duration", "deaths", "skips", "event_counters"]);
const gameplayRevisionLifecycleSchema = z.enum(["preparing", "default", "selectable", "historical"]);
const verifiedRunSubmissionOutcomeStatus = z.enum(["created", "reused", "ineligible", "conflict", "invalidated"]);
const playerVerifiedRunSubmissionOutcomeStatus = z.enum(["created", "reused", "ineligible", "invalidated"]);
const playerVerifiedRunSubmissionOutcomeSchema = z.object({
  status: playerVerifiedRunSubmissionOutcomeStatus,
  awardedXp: z.number().int().nonnegative(),
}).strict();
const adminVerifiedRunSubmissionOutcomeSchema = z.object({
  status: verifiedRunSubmissionOutcomeStatus,
  awardedXp: z.number().int().nonnegative(),
}).extend({
  verifiedRunId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  conflictFields: z.array(verifiedRunConflictFieldSchema),
}).strict();

export const mapChallengeSchema = z.object({
  challengeId: externalId,
  family: z.literal("map"),
  // A map challenge is a projection of an assignment onto one immutable
  // gameplay boundary. Callers must preserve this ID when selecting it.
  gameplayRevisionId: externalId,
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

// A progress Rule completes the Challenge from the player's authoritative
// Verified Runs instead of a single screenshot's OCR evidence. It is mutually
// exclusive with screenshot submission modes and with scope: "map" projection.
export const achievementProgressRuleSchema = z.object({
  type: z.literal("required_maps_completed"),
  // Omitted with a mode: every map of that standalone mode, following its map list.
  mapIds: z.array(externalId).min(1).max(256).optional(),
  difficultyAtLeast: z.string().trim().min(1).max(64).optional(),
  // Counts only runs on Gameplay Revisions of this standalone mode (e.g. 2026镜中回响);
  // without it only regular-mode runs count.
  mode: z.string().trim().min(1).max(64).optional(),
}).strict().refine((rule) => rule.mapIds || rule.mode, { message: "A progress rule needs maps or a standalone mode", path: ["mapIds"] });

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
  progressRule: achievementProgressRuleSchema.optional(),
});

export const challengeSchema = z.discriminatedUnion("family", [mapChallengeSchema, achievementChallengeSchema]);


export const mapSchema = z.object({
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  defaultGameplayRevisionId: externalId.nullable().optional(),
  gameVersion: z.string().trim().min(1).max(64),
  difficultyRating: z.enum(["T0", "T1", "T2", "T3", "T4", "T5"]).nullable(),
  mechanics: z.array(z.string().trim().min(1).max(64)).max(16),
  coverUrl: z.string().trim().url().max(2048).nullable(),
  backgroundUrl: z.string().trim().url().max(2048).nullable(),
});


const finiteCoordinate = z.number().refine(Number.isFinite, "Coordinate must be finite");
const vector3 = z.tuple([finiteCoordinate, finiteCoordinate, finiteCoordinate]);
const spatialPositions = z.array(vector3).max(128);
const requiredSpatialPositions = spatialPositions.min(1);
const spatialStageId = z.string().trim().regex(/^[a-z0-9][a-z0-9_-]*$/).max(64);
const controlSpatialConfigSchema = z.object({
  centerPositions: spatialPositions,
  jumpPositions: spatialPositions,
  respawnPositions: spatialPositions,
  respawnAxis: z.enum(["x", "y", "z"]).nullable(),
  respawnAxisThreshold: finiteCoordinate.refine((value) => value >= 0, "Threshold must be non-negative").nullable(),
}).strict().superRefine((value, context) => {
  if ((value.respawnAxis === null) !== (value.respawnAxisThreshold === null)) {
    context.addIssue({ code: "custom", path: ["respawnAxis"], message: "Control axis and threshold must be provided together" });
  }
  if (value.respawnAxis !== null && value.respawnPositions.length === 0) {
    context.addIssue({ code: "custom", path: ["respawnPositions"], message: "Control axis requires a respawn position" });
  }
});

const spatialConfigFields = {
  bastionPositions: requiredSpatialPositions,
  resetPosition: vector3,
  endPosition: vector3,
  thirdPersonPosition: vector3,
  creditsPosition: vector3,
  control: controlSpatialConfigSchema.nullable(),
  portalPositions: spatialPositions,
  springboardPositions: spatialPositions,
};
const alternateStageSetupDetectionSchema = z.object({
  position: vector3,
  radius: finiteCoordinate.refine((value) => value > 0, "Detection radius must be positive"),
}).strict();
const alternateSpatialStageSchema = z.object({
  stageId: spatialStageId,
  setupDetection: alternateStageSetupDetectionSchema,
  ...spatialConfigFields,
}).strict();

const legacyAgentSpatialConfigSchema = z.object({
  ...spatialConfigFields,
  alternateStages: z.array(alternateSpatialStageSchema).max(15).default([]),
}).strict().superRefine((value, context) => {
  const seen = new Set<string>();
  for (const [index, stage] of value.alternateStages.entries()) {
    if (seen.has(stage.stageId)) {
      context.addIssue({ code: "custom", path: ["alternateStages", index, "stageId"], message: "Duplicate alternate spatial stage" });
    }
    seen.add(stage.stageId);
  }
});

const legacyCompositeStageSchema = z.object({
  stageId: spatialStageId,
  setupDetection: alternateStageSetupDetectionSchema.optional(),
  ...spatialConfigFields,
}).strict();

const compositeCompositionSchema = z.object({
  selectionCount: z.number().int().min(2).max(16),
  firstStageSelection: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("setup_detection"), fallbackStageId: spatialStageId }).strict(),
    z.object({ mode: z.literal("random") }).strict(),
  ]),
  remainingStageSelection: z.enum(["random_unique", "stage_id_cycle"]),
}).strict();

const legacyCompositeSpatialConfigSchema = z.object({
  composition: compositeCompositionSchema.extend({ remainingStageSelection: z.literal("random_unique") }),
  stages: z.array(legacyCompositeStageSchema).min(2).max(16),
}).strict().superRefine((value, context) => {
  validateCompositeSelection(value, context);
});

const compositeStageControlSchema = z.object({
  centerPositions: spatialPositions,
  jumpPositions: spatialPositions.length(1),
  respawnPositions: spatialPositions.length(1),
}).strict();

const compositeRouteControlSchema = z.object({
  respawnAxis: z.enum(["x", "y", "z"]),
  respawnAxisThreshold: finiteCoordinate.refine((value) => value >= 0, "Threshold must be non-negative"),
}).strict();

const compositeStageSpatialFields = {
  bastionPositions: requiredSpatialPositions,
  control: compositeStageControlSchema,
  portalPositions: spatialPositions,
  springboardPositions: spatialPositions,
};

const compositeStageSchema = z.object({
  stageId: spatialStageId,
  setupDetection: alternateStageSetupDetectionSchema.optional(),
  ...compositeStageSpatialFields,
  resetPosition: vector3.optional(),
  thirdPersonPosition: vector3.optional(),
  creditsPosition: vector3.optional(),
  endPosition: vector3.optional(),
}).strict();

// Route-root anchors are defaults; a stage may override reset/third-person/credits
// (applied when it is the route's first stage) and end (when it is the last stage).
const compositeSpatialConfigSchema = z.object({
  resetPosition: vector3,
  endPosition: vector3,
  thirdPersonPosition: vector3,
  creditsPosition: vector3,
  control: compositeRouteControlSchema,
  composition: compositeCompositionSchema,
  stages: z.array(compositeStageSchema).min(2).max(16),
}).strict().superRefine((value, context) => {
  validateCompositeSelection(value, context);
});

function validateCompositeSelection(
  value: { composition: z.infer<typeof compositeCompositionSchema>; stages: Array<{ stageId: string; setupDetection?: z.infer<typeof alternateStageSetupDetectionSchema> }> },
  context: z.RefinementCtx,
) {
  const stagesById = new Map<string, (typeof value.stages)[number]>();
  for (const [index, stage] of value.stages.entries()) {
    if (stagesById.has(stage.stageId)) {
      context.addIssue({ code: "custom", path: ["stages", index, "stageId"], message: "Duplicate composite spatial stage" });
    }
    stagesById.set(stage.stageId, stage);
  }
  if (value.composition.selectionCount > value.stages.length) {
    context.addIssue({ code: "custom", path: ["composition", "selectionCount"], message: "Selection count exceeds the number of available stages" });
  }
  const firstStageSelection = value.composition.firstStageSelection;
  if (firstStageSelection.mode === "setup_detection") {
    const fallback = stagesById.get(firstStageSelection.fallbackStageId);
    if (!fallback) {
      context.addIssue({ code: "custom", path: ["composition", "firstStageSelection", "fallbackStageId"], message: "Fallback stage does not exist" });
    } else if (fallback.setupDetection) {
      context.addIssue({ code: "custom", path: ["stages", value.stages.indexOf(fallback), "setupDetection"], message: "Fallback stage cannot also be setup-detected" });
    }
    for (const [index, stage] of value.stages.entries()) {
      if (stage.stageId !== firstStageSelection.fallbackStageId && !stage.setupDetection) {
        context.addIssue({ code: "custom", path: ["stages", index, "setupDetection"], message: "Every non-fallback stage requires setup detection" });
      }
    }
  } else {
    for (const [index, stage] of value.stages.entries()) {
      if (stage.setupDetection) {
        context.addIssue({ code: "custom", path: ["stages", index, "setupDetection"], message: "Random first-stage selection cannot use setup detection" });
      }
    }
  }
}

export const agentSpatialConfigSchema = z.union([legacyAgentSpatialConfigSchema, legacyCompositeSpatialConfigSchema, compositeSpatialConfigSchema]);
export const agentProjectedSpatialConfigSchema = z.union([legacyAgentSpatialConfigSchema, compositeSpatialConfigSchema]);

export const agentMapChallengeRefSchema = z.object({ family: z.literal("map"), challengeId: externalId }).strict();
export const agentGameplayRevisionSchema = z.object({
  gameplayRevisionId: externalId,
  mapId: externalId,
  mapVariant: z.literal("classic").nullable(),
  lifecycle: z.enum(["default", "selectable"]),
  enabled: z.literal(true),
  isDefault: z.boolean(),
  isSelectable: z.boolean(),
  gameVersion: z.string().trim().min(1).max(64),
  spatialConfig: agentProjectedSpatialConfigSchema,
  challengeRefs: z.array(agentMapChallengeRefSchema).max(256),
}).strict().superRefine((value, context) => {
  if (value.lifecycle === "default" && (!value.isDefault || value.isSelectable)) {
    context.addIssue({ code: "custom", path: ["lifecycle"], message: "Default revisions must be default-only" });
  }
  if (value.lifecycle === "selectable" && (value.isDefault || !value.isSelectable)) {
    context.addIssue({ code: "custom", path: ["lifecycle"], message: "Selectable revisions must be selectable-only" });
  }
});

export const agentMapSchema = mapSchema.extend({ gameplayRevisions: z.array(agentGameplayRevisionSchema).max(32) }).strict();

const randomEventStatus = z.enum(["development", "implemented", "removed"]);
const randomEventVersionAvailability = z.enum(["available", "suspended"]);
const randomEventLinkSchema = z.object({ family: z.enum(["map", "achievement"]), challengeId: externalId });
const effectGlossaryTermSchema = z.object({ key: z.string().trim().min(1).max(64), nameZh: z.string().trim().min(1).max(128), aliases: z.array(z.string().trim().min(1).max(128)).max(16), category: z.string().trim().min(1).max(64), summary: z.string().trim().min(1).max(512), definition: z.string().trim().min(1).max(4096), rules: z.array(z.string().trim().min(1).max(512)).max(16), sourceVersion: z.string().trim().min(1).max(64) });
const randomEventEffectAnnotationSchema = z.object({ tag: z.string().trim().min(1).max(64), term: effectGlossaryTermSchema });
export const randomEventSchema = z.object({
  eventId: externalId, name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), rarity: z.string().trim().max(32), description: z.string().trim().min(1).max(4096),
  durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().nonnegative().nullable(), weight: z.number().nonnegative().nullable(),
  gameVersion: z.string().trim().min(1).max(64), eventGroup: z.string().max(64).nullable(), effectTags: z.array(z.string().trim().min(1).max(64)).max(16), effectAnnotations: z.array(randomEventEffectAnnotationSchema).max(16), releaseStatus: randomEventStatus, archived: z.boolean(), challenges: z.array(challengeSchema),
});
export const randomEventListResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) });
// Optional on write: omitting it leaves the group unchanged; an empty string clears it.
const randomEventGroupInput = z.string().trim().max(64).transform((value) => value || null).nullable().optional();
const randomEventWriteFields = z.object({ name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), description: z.string().trim().min(1).max(4096), durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().nonnegative().nullable(), weight: z.number().nonnegative().nullable(), gameVersion: z.string().trim().min(1).max(64), eventGroup: randomEventGroupInput, effectTags: z.array(z.string().trim().min(1).max(64)).max(16), releaseStatus: randomEventStatus, challengeLinks: z.array(randomEventLinkSchema).max(64) }).strict();
export const adminRandomEventCreateRequestSchema = z.object({ contractVersion }).merge(randomEventWriteFields);
export const adminRandomEventUpdateRequestSchema = z.object({ contractVersion }).merge(randomEventWriteFields);
// A batch changes only the listed fields of up to 100 distinct events, all or nothing; challenge links are not part of it.
const randomEventBatchUpdate = randomEventWriteFields.omit({ challengeLinks: true }).partial().extend({ eventId: externalId }).strict()
  .refine((update) => Object.keys(update).length > 1, "A batch update must change at least one field");
export const adminRandomEventBatchRequestSchema = z.object({ contractVersion, updates: z.array(randomEventBatchUpdate).min(1).max(100) }).strict()
  .refine((request) => new Set(request.updates.map((update) => update.eventId)).size === request.updates.length, "Each event may appear once");
export const adminRandomEventBatchResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) });
export const adminRandomEventImportRequestSchema = z.object({ contractVersion, fileName: z.string().trim().min(1).max(256), csv: z.string().min(1).max(512 * 1024) }).strict();
// mode names the standalone mode whose build owns this pool (set from that mode); null is the regular build.
export const randomEventVersionSchema = z.object({ gameVersion: z.string().trim().min(1).max(64), availability: randomEventVersionAvailability, mode: z.string().nullable(), eventCount: z.number().int().nonnegative() }).strict();
export const adminRandomEventVersionListResponseSchema = z.object({ contractVersion, items: z.array(randomEventVersionSchema) }).strict();
export const adminRandomEventVersionAvailabilityRequestSchema = z.object({ contractVersion, availability: randomEventVersionAvailability }).strict();

// A standalone mode is configured in one place: its maps (each played on the mode's own selectable
// Gameplay Revision, created and retired by the platform), the event pools its build owns, and the
// run-code event-weight total of that build.
export const adminStandaloneModeSchema = z.object({
  mode: z.string(),
  mapIds: z.array(externalId).max(128),
  eventPools: z.array(z.string()).max(32),
  eventWeightTotal: z.number().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict();
export const adminStandaloneModeListResponseSchema = z.object({ contractVersion, items: z.array(adminStandaloneModeSchema).max(64) }).strict();
export const adminStandaloneModeUpsertRequestSchema = z.object({
  contractVersion,
  mapIds: z.array(externalId).max(128),
  eventPools: z.array(z.string().trim().min(1).max(64)).max(32),
  eventWeightTotal: z.number().min(0).max(99.99).nullable(),
}).strict();

export const reviewTargetTypeSchema = z.enum(["event", "map"]);
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
  rating: z.number().int().min(1).max(5),
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
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(50),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).strict();
export const playerReviewSchema = z.object({
  reviewId: z.string().uuid(),
  targetType: reviewTargetTypeSchema,
  targetId: externalId,
  gameplayRevisionId: externalId.nullable(),
  rating: z.number().int().min(1).max(5),
  comment: reviewComment.nullable(),
  anonymous: z.boolean(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict();
export const playerReviewResponseSchema = z.object({ contractVersion, review: playerReviewSchema.nullable() }).strict();
export const playerReviewUpsertRequestSchema = z.object({
  contractVersion,
  rating: z.number().int().min(1).max(5),
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
  playerAccountId: z.string().uuid(),
  playerId,
  playerName: z.string().trim().min(1).max(64),
  rating: z.number().int().min(1).max(5),
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
export const adminReviewListResponseSchema = z.object({ contractVersion, items: z.array(adminReviewSchema).max(50), page: z.number().int().positive(), pageSize: z.number().int().positive().max(50), total: z.number().int().nonnegative(), hasMore: z.boolean() }).strict();
export const adminReviewDetailResponseSchema = z.object({ contractVersion, review: adminReviewSchema, audit: z.array(adminReviewAuditSchema).max(50) }).strict();
export const adminReviewCommentModerationRequestSchema = z.object({ contractVersion, action: z.enum(["hide", "restore"]), reason: z.string().trim().max(512).optional() }).strict();
export const adminReviewStateModerationRequestSchema = z.object({ contractVersion, action: z.enum(["invalidate", "restore"]), reason: z.string().trim().max(512).optional() }).strict();

export const adminMapMetadataUpdateRequestSchema = z.object({
  contractVersion,
  gameVersion: z.string().trim().min(1).max(64),
  difficultyRating: z.enum(["T0", "T1", "T2", "T3", "T4", "T5"]).nullable(),
  mechanics: z.array(z.string().trim().min(1).max(64)).max(16),
  coverUrl: z.string().trim().url().max(2048).nullable(),
  backgroundUrl: z.string().trim().url().max(2048).nullable(),
});

const adminMapRevisionLifecycle = z.enum(["preparing", "default", "selectable", "historical"]);
const adminMapRevisionChallengeFamily = z.enum(["map_challenge", "map_title_rule", "title_challenge"]);
const adminMapRevisionChallengeAssignmentInputSchema = z.object({
  challengeFamily: adminMapRevisionChallengeFamily,
  challengeId: externalId,
  enabled: z.boolean(),
  condition: z.string().trim().min(1).max(1024).nullable(),
  evidenceRule: z.string().trim().min(1).max(2048).nullable(),
  submissionMode: z.enum(["manual", "automatic"]).nullable(),
  slot: z.enum(["pioneer", "conqueror", "dominator"]).nullable(),
}).strict();
export const adminMapRevisionChallengeAssignmentSchema = adminMapRevisionChallengeAssignmentInputSchema.extend({
  assignmentId: externalId,
  gameplayRevisionId: externalId,
  mapId: externalId,
}).strict();
export const adminMapRevisionCreateRequestSchema = z.object({
  contractVersion,
  sourceRevisionId: externalId.nullable().optional(),
  resetReason: z.string().trim().max(512).transform((value) => value || null).nullable().optional(),
  gameVersion: z.string().trim().min(1).max(64).optional(),
  mapVariant: z.literal("classic").nullable(),
  copyConfiguration: z.boolean(),
  spatialConfig: agentSpatialConfigSchema.nullable().optional(),
  challengeAssignments: z.array(adminMapRevisionChallengeAssignmentInputSchema).max(256).optional(),
}).strict();
export const adminMapRevisionUpdateRequestSchema = z.object({
  contractVersion,
  lifecycle: adminMapRevisionLifecycle,
  gameVersion: z.string().trim().min(1).max(64),
  mapVariant: z.literal("classic").nullable(),
  spatialConfig: agentSpatialConfigSchema.nullable(),
  challengeAssignments: z.array(adminMapRevisionChallengeAssignmentInputSchema).max(256),
}).strict();
export const adminMapRevisionPromotionRequestSchema = z.object({
  contractVersion,
  replacedDefaultLifecycle: z.enum(["selectable", "historical"]).nullable(),
}).strict();

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
  lifecycle: z.enum(["draft", "active", "retired"]),
  publicVisibility: z.boolean().optional(),
  availability: z.enum(["active", "retired"]),
  scope: z.enum(["global", "map"]),
  displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]),
  mapId: externalId.optional(),
  slot: z.enum(["pioneer", "conqueror", "dominator"]).optional(),
  pioneerPrefixes: z.array(z.string().trim().min(1).max(256)).optional(),
  color: titleColorSchema.nullable(),
  gameVersion: z.string().trim().min(1).max(64),
});
export const agentTitleSchema = titleSchema.extend({
  gameVersion: z.string().trim().min(1).max(64).nullable(),
});


const agentPage = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});
const agentPageQuery = z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().positive().max(100).default(20) });
export const agentEventListResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) }).merge(agentPage);
export const agentMapListResponseSchema = z.object({ contractVersion, items: z.array(agentMapSchema) }).merge(agentPage);
export const agentAchievementListResponseSchema = z.object({ contractVersion, items: z.array(challengeSchema) }).merge(agentPage);
export const agentTitleListResponseSchema = z.object({ contractVersion, items: z.array(agentTitleSchema) }).merge(agentPage);
export const agentPlayerTitleGrantSchema = z.object({ playerId, playerName: z.string().trim().min(1).max(64), titleKeys: z.array(externalId), allTitles: z.boolean() });
export const agentPlayerTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(agentPlayerTitleGrantSchema) }).merge(agentPage);
export const agentMapTitleHolderSchema = z.object({ mapId: externalId, gameplayRevisionId: externalId, titleKey: externalId, slot: z.enum(["pioneer", "conqueror", "dominator"]).nullable(), slotSemantics: z.enum(["named", "none"]), playerId, playerName: z.string().trim().min(1).max(64) });
export const agentMapTitleHolderListResponseSchema = z.object({ contractVersion, items: z.array(agentMapTitleHolderSchema) }).merge(agentPage);
export const agentSearchResultSchema = z.object({ kind: z.enum(["event", "map", "achievement", "title"]), id: externalId, name: z.string().trim().min(1).max(256), summary: z.string().trim().min(1).max(4096) });
export const agentSearchResponseSchema = z.object({ contractVersion, items: z.array(agentSearchResultSchema) }).merge(agentPage);

export const ownedTitleSchema = z.object({
  grantId: z.string().uuid(), titleKey: externalId, label: z.string(), icon: achievementIcon, iconUrl: z.string().url().max(2048).nullable().optional(), category: z.string(),
  condition: z.string().trim().min(1).max(1024), scope: z.enum(["global", "map"]), mapId: externalId.optional(), gameplayRevisionId: externalId.optional(), mapName: z.string().optional(), slot: z.enum(["pioneer", "conqueror", "dominator"]).optional(), grantedAt: z.number().int(), equipped: z.boolean().optional(),
});
const equippedTitleGrantIdsSchema = z.object({ grantIds: z.array(z.string().uuid()).max(10) }).superRefine((value, context) => {
  if (new Set(value.grantIds).size !== value.grantIds.length) context.addIssue({ code: "custom", message: "Grant IDs must be unique" });
});
export const playerEquippedTitlesRequestSchema = equippedTitleGrantIdsSchema;
export const playerEquippedTitlesResponseSchema = z.object({ contractVersion, grantIds: z.array(z.string().uuid()).max(10) });
export const adminPlayerEquippedTitlesRequestSchema = z.object({ contractVersion, grantIds: z.array(z.string().uuid()).max(10) }).superRefine((value, context) => {
  if (new Set(value.grantIds).size !== value.grantIds.length) context.addIssue({ code: "custom", message: "Grant IDs must be unique" });
});
export const currentPlayerTitlesResponseSchema = z.object({ contractVersion, items: z.array(ownedTitleSchema), allTitles: z.boolean() });
export const playerActivityDaySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), runCount: z.number().int().nonnegative() });
export const playerActivityResponseSchema = z.object({ contractVersion, days: z.array(playerActivityDaySchema) });
export const historicalTitleGrantSchema = ownedTitleSchema.extend({ grantId: historicalTitleGrantId, holderName: z.string(), playerAccountId: z.string().uuid().optional(), playerName: z.string().optional(), playerId: playerId.optional(), status: z.enum(["unclaimed", "active", "revoked"]), revokeReason: z.string().optional() });
export const adminTitleGrantStatsSchema = z.object({ pendingHolderCount: z.number().int().nonnegative(), unclaimedGrantCount: z.number().int().nonnegative(), migratedGrantCount: z.number().int().nonnegative() });
export const adminHistoricalTitleHolderFilterSchema = z.enum(["all", "pending", "completed"]);
export const adminHistoricalTitleHolderSchema = z.object({
  holderName: z.string().min(1).max(256),
  totalCount: z.number().int().nonnegative(),
  unclaimedCount: z.number().int().nonnegative(),
  status: z.enum(["pending", "completed"]),
});
export const adminTitleGrantListResponseSchema = z.object({
  contractVersion,
  holders: z.array(adminHistoricalTitleHolderSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  filter: adminHistoricalTitleHolderFilterSchema,
  stats: adminTitleGrantStatsSchema,
});
export const adminTitleGrantHolderDetailResponseSchema = z.object({
  contractVersion,
  holder: adminHistoricalTitleHolderSchema,
  items: z.array(historicalTitleGrantSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
  grantStatus: z.enum(["all", "unclaimed", "active", "revoked"]).optional(),
});
export const historicalTitleGrantListResponseSchema = z.object({ contractVersion, items: z.array(historicalTitleGrantSchema) });
export const adminTitleGrantRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), historicalTitleGrantId });
export const adminTitleGrantBulkRequestSchema = z.object({ contractVersion, playerAccountId: z.string().uuid(), holderName: z.string().trim().min(1).max(256) });
export const adminTitleGrantBulkResponseSchema = z.object({ contractVersion, grantedCount: z.number().int().nonnegative(), skippedClaimedCount: z.number().int().nonnegative().default(0) });
export const adminTitleGrantRevokeRequestSchema = z.object({ contractVersion, reason: z.string().trim().max(256).optional() });
export const adminTitleGrantRestoreRequestSchema = z.object({ contractVersion, reason: z.string().trim().max(256).optional() });
export const adminManualTitleGrantTargetSchema = z.object({ titleKey: externalId, mapId: externalId.optional(), gameplayRevisionId: externalId.optional() }).strict();
export const adminManualTitleGrantRequestSchema = z.object({ contractVersion, playerAccountId: z.string().trim().uuid(), titleKey: externalId, mapId: externalId.optional(), gameplayRevisionId: externalId.optional(), reason: z.string().trim().min(1).max(512).optional() }).strict();
export const adminManualTitleGrantResponseSchema = z.object({ contractVersion, grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), mapId: externalId.nullable(), slot: z.enum(["pioneer", "conqueror", "dominator"]).nullable(), alreadyOwned: z.boolean() });
export const adminManualTitleGrantBatchRequestSchema = z.object({ contractVersion, playerAccountIds: z.array(z.string().trim().uuid()).min(1).max(500), targets: z.array(adminManualTitleGrantTargetSchema).min(1).max(500), reason: z.string().trim().min(1).max(512).optional() }).strict();
export const adminManualTitleGrantBatchItemSchema = z.object({ playerAccountId: z.string().uuid(), titleKey: externalId, mapId: externalId.nullable(), gameplayRevisionId: externalId.nullable(), grantId: z.string().uuid(), status: z.enum(["created", "already_owned"]) });
export const adminManualTitleGrantBatchResponseSchema = z.object({ contractVersion, batchId: z.string().uuid(), playerCount: z.number().int().nonnegative(), targetCount: z.number().int().nonnegative(), requestedCount: z.number().int().nonnegative(), createdCount: z.number().int().nonnegative(), alreadyOwnedCount: z.number().int().nonnegative(), items: z.array(adminManualTitleGrantBatchItemSchema) });

const adminMapChallengeSchema = mapChallengeSchema.extend({
  condition: z.string().trim().min(1).max(1024).optional(),
  evidenceRule: z.string().trim().min(1).max(2048).optional(),
  submissionMode: z.enum(["manual", "automatic"]).optional(),
  status: challengeStatus,
  introducedVersion: z.string().trim().min(1).max(64),
  retiredVersion: storedRetirementVersion.nullable(),
});
const adminAchievementChallengeSchema = achievementChallengeSchema.extend({
  gameVersion: gameVersionValue,
  categoryOverride: z.string().trim().min(1).max(128).nullable(),
  status: titleChallengeStatus,
  introducedVersion: z.string().trim().min(1).max(64).nullable(),
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
  lifecycle: z.enum(["draft", "active", "retired"]),
  publicVisibility: z.boolean(),
  availability: z.enum(["active", "retired"]),
  scope: z.enum(["global", "map"]),
  displayKind: z.enum(["fixed", "map_pioneer", "map_name_suffix"]),
  color: titleColorSchema.nullable().optional(),
  status: z.enum(["draft", "active", "retired"]),
  gameVersion: z.string().trim().min(1).max(64).nullable(),
  hasChallenge: z.boolean(),
});
export const adminChallengeSchema = z.discriminatedUnion("family", [adminMapChallengeSchema, adminAchievementChallengeSchema, adminCatalogTitleSchema]);
export const adminChallengeListResponseSchema = z.object({ contractVersion, items: z.array(adminChallengeSchema) });
export const adminMapEditorChallengeOptionSchema = z.object({
  challengeFamily: adminMapRevisionChallengeFamily,
  challengeId: externalId,
  label: z.string().trim().min(1).max(256),
  kind: z.string().trim().min(1).max(64),
  status: z.string().trim().min(1).max(32),
  gameVersion: z.string().trim().min(1).max(64),
}).strict();
export const adminMapRevisionSchema = z.object({
  revisionId: externalId,
  mapId: externalId,
  lifecycle: adminMapRevisionLifecycle,
  mapVariant: z.literal("classic").nullable(),
  mode: z.string().nullable(),
  copiedFromRevisionId: externalId.nullable(),
  resetReason: z.string().trim().max(512).nullable(),
  gameVersion: z.string().trim().min(1).max(64),
  spatialConfig: agentSpatialConfigSchema.nullable(),
  isDefault: z.boolean(),
  isSelectable: z.boolean(),
  challengeAssignments: z.array(adminMapRevisionChallengeAssignmentSchema).max(256),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
}).strict();
export const adminMapEditorAuditSchema = z.object({
  operation: z.string().trim().min(1).max(128),
  actorType: z.string().trim().min(1).max(32),
  actorId: z.string().trim().min(1).max(256),
  entityType: z.string().trim().min(1).max(64),
  entityId: externalId,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.number().int(),
}).strict();
export const adminMapEditorResponseSchema = z.object({
  contractVersion,
  map: mapSchema,
  revisions: z.array(adminMapRevisionSchema).max(32),
  challengeCatalog: z.array(adminMapEditorChallengeOptionSchema).max(512),
  audit: z.array(adminMapEditorAuditSchema).max(100),
}).strict();

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
  startsAt: scheduleTimestamp.nullable(), endsAt: scheduleTimestamp.nullable(),
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
  startsAt: scheduleTimestamp.nullable().optional(), endsAt: scheduleTimestamp.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.startsAt !== null && value.endsAt !== null && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  }
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
  gameVersion: optionalGameVersion,
  status: titleChallengeStatus,
  retiredVersion: optionalRetirementVersion,
  startsAt: optionalScheduleTimestamp,
  endsAt: optionalScheduleTimestamp,
  scope: z.enum(["global", "map"]).optional(),
  mapIds: z.array(externalId).max(256).optional(),
  mapVariant: z.literal("classic").optional(),
  progressRule: achievementProgressRuleSchema.nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.status === "active" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "An active challenge cannot have a retired version" });
  if (value.status !== "scheduled" && value.gameVersion === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gameVersion"], message: "Only scheduled future challenges may clear a game version" });
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  if (value.status !== "scheduled" && (value.startsAt !== undefined || value.endsAt !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Only scheduled challenges may have a time window" });
  if (value.scope === "global" && value.mapIds?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mapIds"], message: "Global challenges cannot target maps" });
  if (value.progressRule && value.submissionMode !== "manual") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["submissionMode"], message: "Progress challenges are not screenshot-evaluated" });
  if (value.progressRule && value.scope === "map") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scope"], message: "Progress challenges cannot target maps through scope" });
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
  gameVersion: optionalGameVersion,
  categoryOverride: z.string().trim().min(1).max(128).nullable().default(null),
  iconUrl: z.string().trim().url().max(2048).nullable().default(null),
  startsAt: optionalScheduleTimestamp,
  endsAt: optionalScheduleTimestamp,
  retiredVersion: optionalRetirementVersion,
  progressRule: achievementProgressRuleSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.status !== "scheduled" && !value.gameVersion) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gameVersion"], message: "Only scheduled future challenges may omit a game version" });
  if (value.scope === "global" && value.mapIds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mapIds"], message: "Global challenges cannot target maps" });
  if (value.progressRule && value.submissionMode !== "manual") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["submissionMode"], message: "Progress challenges are not screenshot-evaluated" });
  if (value.progressRule && value.scope === "map") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scope"], message: "Progress challenges cannot target maps through scope" });
  if (value.startsAt !== undefined && value.endsAt !== undefined && value.endsAt <= value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "The end time must be after the start time" });
  if (value.status === "sunsetting" && value.retiredVersion === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "Sunsetting challenges require a retired version" });
  if (value.status !== "scheduled" && (value.startsAt !== undefined || value.endsAt !== undefined)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Only scheduled challenges may have a time window" });
  if (value.status !== "sunsetting" && value.retiredVersion !== undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["retiredVersion"], message: "Only sunsetting challenges may have a retired version" });
});
export const adminCatalogTitleUpdateRequestSchema = z.object({
  contractVersion,
  status: titleChallengeStatus.optional(),
  lifecycle: z.enum(["draft", "active", "retired"]).optional(),
  publicVisibility: z.boolean().optional(),
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
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const playerUploadSessionResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  uploadId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.number().int(),
  maxBytes: z.number().int().positive(),
});

export const playerUploadCompleteRequestSchema = z.object({ contractVersion, uploadId: z.string().uuid() });

export const adminSubmissionChallengeSchema = z.union([
  z.object({ family: z.literal("map"), name: z.string(), mapName: z.string(), difficulty: z.string().nullable(), kind: z.enum(["difficulty_completion", "pioneer", "classic_completion", "map_title_achievement"]).optional(), mapVariant: z.literal("classic").optional() }),
  z.object({ family: z.literal("achievement"), titleName: z.string(), category: z.string(), condition: z.string(), evidenceRule: z.string(), mapVariant: z.literal("classic").optional() }),
]);
// Screenshot-level OCR accuracy marks (#253). A mark says whether one
// recognition result read the screenshot correctly; it is a sampling hint for
// OCRKit screenshot-set selection, never a transcription or training label.
export const ocrAccuracyMarkSchema = z.enum(["accurate", "inaccurate"]);

export const adminSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  status: submissionStatus,
  challengeId: externalId,
  gameplayRevisionId: externalId.nullable().optional(),
  challenge: adminSubmissionChallengeSchema.nullable().optional(),
  mapName: z.string(),
  difficulty: z.string(),
  playerAccountId: z.string().uuid(),
  playerName: z.string(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  ocrStatus: z.enum(["not_started", "pending", "completed", "matched", "mismatch", "review_required", "failed"]).optional(),
  ocrAttempt: z.number().int().nullable().optional(),
  ocrErrorCode: z.string().nullable().optional(),
  ocrResultId: z.string().uuid().nullable().optional(),
  // Current screenshot-level accuracy mark for that recognition (#253).
  ocrAccuracy: ocrAccuracyMarkSchema.nullable().optional(),
  ocr: z.record(z.string(), z.unknown()).nullable(),
  match: z.record(z.string(), z.unknown()).nullable().optional(),
  reason: z.string().nullable().optional(),
  evidenceUrl: z.string().url().nullable(),
  spotCheck: z.object({ status: z.enum(["pending", "confirmed", "revoked"]), sampledAt: z.number().int(), resolvedAt: z.number().int().nullable(), reviewer: z.string().nullable(), reason: z.string().nullable() }).nullable().optional(),
  review: z.object({ decision: z.enum(["approved", "rejected", "resubmission_required"]), automatic: z.boolean(), reason: z.string().nullable(), reviewedAt: z.number().int() }).nullable().optional(),
  activeTitleGrants: z.array(z.object({ grantId: z.string().min(1), titleKey: z.string(), titleName: z.string() })).optional(),
  verifiedRunOutcome: adminVerifiedRunSubmissionOutcomeSchema.optional(),
});

export const adminSubmissionListResponseSchema = z.object({ contractVersion, items: z.array(adminSubmissionSchema), page: z.number().int().positive(), pageSize: z.number().int().positive(), total: z.number().int().nonnegative(), hasMore: z.boolean() });
const submissionReviewFieldCorrectionsSchema = z.array(z.object({
  fieldKey: z.enum(["map_name", "difficulty", "viewer_player", "challenge_completed", "map_variant", "mode", "achievement_titles", "version", "run_code", "duration_seconds", "deaths", "skips"]),
  reviewedValue: z.string().trim().min(1).max(2048),
}).strict()).max(12).superRefine((corrections, ctx) => {
  if (new Set(corrections.map(({ fieldKey }) => fieldKey)).size !== corrections.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each OCR field may be confirmed only once" });
});
// Canonical Challenge IDs a maintainer visually confirmed from the screenshot.
// The platform revalidates them against the Submission's eligible Challenges on every use.
const confirmedChallengeIdsSchema = z.array(z.string().trim().min(1).max(512)).max(32).superRefine((ids, ctx) => {
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each Challenge may be confirmed only once" });
});
export const adminSubmissionReviewRequestSchema = z.object({
  contractVersion,
  decision: z.enum(["approved", "rejected", "resubmission_required"]),
  reason: z.string().trim().max(512).optional(),
  fieldCorrections: submissionReviewFieldCorrectionsSchema.optional(),
  confirmedChallengeIds: confirmedChallengeIdsSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.decision !== "approved" && value.confirmedChallengeIds?.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmedChallengeIds"], message: "Challenges can be confirmed only when approving" });
});
export const adminSubmissionReviewPreviewRequestSchema = z.object({
  contractVersion,
  fieldCorrections: submissionReviewFieldCorrectionsSchema.optional(),
  confirmedChallengeIds: confirmedChallengeIdsSchema.optional(),
}).strict();
const submissionReviewEvidenceFieldSchema = z.enum(["map_name", "difficulty", "challenge_completed", "map_variant", "achievement_titles"]);
export const adminSubmissionReviewCandidateSchema = z.object({
  challengeId: z.string().min(1).max(512),
  family: z.enum(["map", "achievement"]),
  kind: z.enum(["difficulty_completion", "pioneer", "classic_completion", "map_title_achievement", "title_achievement"]),
  label: z.string(),
  titleName: z.string().nullable(),
  mapName: z.string().nullable(),
  difficulty: z.string().nullable(),
  condition: z.string().nullable(),
  evidence: z.enum(["matched", "needs_confirmation", "not_matched", "unsupported"]),
  requiredFields: z.array(submissionReviewEvidenceFieldSchema),
  missingFields: z.array(submissionReviewEvidenceFieldSchema),
  selectedBy: z.enum(["conditions", "reviewer"]).nullable(),
}).strict();
export const adminSubmissionReviewPreviewResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  evidenceOutcome: z.enum(["automatic", "review", "resubmit"]),
  candidates: z.array(adminSubmissionReviewCandidateSchema),
  completions: z.array(z.object({
    challengeId: z.string().min(1).max(512),
    titleKey: externalId,
    titleName: z.string(),
    mapName: z.string().nullable(),
    basis: z.enum(["conditions", "reviewer", "satisfies"]),
  }).strict()),
  titles: z.array(z.object({
    titleKey: externalId,
    titleName: z.string(),
    mapName: z.string().nullable(),
    alreadyOwned: z.boolean(),
  }).strict()),
  verifiedRun: z.object({
    status: z.enum(["recorded", "eligible", "ineligible"]),
    reason: z.string().nullable(),
  }).strict(),
  approvable: z.boolean(),
  blockingCode: z.string().nullable(),
  // The configured Standalone Modes, offered when correcting the mode.
  knownModes: z.array(z.string()).max(64),
}).strict();
export const adminSubmissionReviewResponseSchema = z.object({
  contractVersion, submissionId: z.string().uuid(), decision: z.literal("approved"), grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), alreadyOwned: z.boolean(), grants: z.array(z.object({ grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), alreadyOwned: z.boolean() })).min(1).optional(), verifiedRunOutcome: playerVerifiedRunSubmissionOutcomeSchema.optional(),
}).or(z.object({
  contractVersion, submissionId: z.string().uuid(), decision: z.literal("approved"), grant: z.null(), verifiedRunOutcome: playerVerifiedRunSubmissionOutcomeSchema,
})).or(z.object({ contractVersion, submissionId: z.string().uuid(), decision: z.enum(["rejected", "resubmission_required"]), grant: z.null() }));
export const adminSubmissionOcrRetryRequestSchema = z.object({ contractVersion });
export const adminSubmissionOcrRetryResponseSchema = z.object({ contractVersion, submissionId: z.string().uuid(), status: z.literal("ocr_pending") });
export const adminSubmissionSpotCheckRequestSchema = z.object({ contractVersion, decision: z.enum(["confirmed", "revoked"]), reason: z.string().trim().max(512).optional() });
export const adminSubmissionSpotCheckResponseSchema = z.object({ contractVersion, submissionId: z.string().uuid(), status: z.enum(["confirmed", "revoked"]), grantId: z.string().uuid().nullable(), verifiedRunId: z.string().uuid().nullable() });

const verifiedRunEventCountersSchema = z.record(z.string().trim().min(1).max(128), z.number().int().nonnegative()).refine((value) => Object.keys(value).length <= 64, "Too many Verified Run event counters");
const verifiedRunXpInputSnapshotV1Schema = z.object({
  ruleVersion: z.literal("v1"),
  baseDifficultyXp: z.number().int().nonnegative(),
  mapFactor: z.number().positive(),
  performanceBonus: z.number().nonnegative(),
  performanceBonusReasons: z.array(z.enum(["no_deaths", "no_skips"])).max(2),
  challengeBonus: z.number().int().nonnegative(),
}).strict();
const verifiedRunXpInputSnapshotV2Schema = z.object({
  ruleVersion: z.literal("v2"),
  baseDifficultyXp: z.number().int().nonnegative(),
  mapFactor: z.number().positive(),
  performanceBonus: z.number().nonnegative(),
  performanceBonusReasons: z.array(z.enum(["no_deaths", "no_skips"])).max(2),
}).strict();
const verifiedRunXpInputSnapshotSchema = z.discriminatedUnion("ruleVersion", [verifiedRunXpInputSnapshotV1Schema, verifiedRunXpInputSnapshotV2Schema]);

export const adminVerifiedRunSchema = z.object({
  runId: z.string().uuid(),
  playerAccountId: z.string().uuid(),
  playerId,
  playerName: z.string().trim().min(1).max(64),
  sourceSubmissionId: z.string().uuid(),
  mapId: externalId,
  mapName: z.string().trim().min(1).max(256),
  gameplayRevisionId: externalId,
  gameplayRevisionLifecycle: gameplayRevisionLifecycleSchema,
  mapVariant: z.literal("classic").nullable(),
  difficulty: verifiedRunDifficultySchema,
  gameVersion: z.string().trim().min(1).max(64),
  matchCode: z.string().regex(/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/),
  completionDurationSeconds: z.number().int().positive(),
  deaths: z.number().int().nonnegative().nullable(),
  skips: z.number().int().nonnegative().nullable(),
  eventCounters: verifiedRunEventCountersSchema,
  acceptanceSource: masteryAcceptanceSourceSchema,
  acceptedAt: z.number().int().positive(),
  status: verifiedRunStatusSchema,
  invalidatedAt: z.number().int().positive().nullable(),
  invalidatedBy: z.string().trim().min(1).max(256).nullable(),
  invalidationReason: z.string().trim().max(512).nullable(),
  xpRuleVersion: z.enum(["v1", "v2"]),
  xpInputSnapshot: verifiedRunXpInputSnapshotSchema,
  awardedXp: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
}).strict().superRefine((run, ctx) => {
  if (run.xpRuleVersion !== run.xpInputSnapshot.ruleVersion) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["xpInputSnapshot", "ruleVersion"], message: "XP rule version must match its snapshot" });
});

const adminVerifiedRunDifficultyStatSchema = z.object({
  difficulty: verifiedRunDifficultySchema,
  verifiedRunCount: z.number().int().positive(),
  fastestCompletionSeconds: z.number().int().positive(),
}).strict();

export const adminVerifiedRunProjectionSchema = z.object({
  mapId: externalId,
  gameplayRevisionId: externalId,
  totalXp: z.number().int().nonnegative(),
  verifiedRunCount: z.number().int().nonnegative(),
  difficultyStats: z.array(adminVerifiedRunDifficultyStatSchema).max(6),
  lowestDeaths: z.number().int().nonnegative().nullable(),
  fewestSkips: z.number().int().nonnegative().nullable(),
  highestSingleRunXp: z.number().int().nonnegative().nullable(),
  highestCompletedDifficulty: verifiedRunDifficultySchema.nullable(),
}).strict();

export const adminVerifiedRunLifecycleEventSchema = z.object({
  transition: z.enum(["accepted", "invalidated", "restored"]),
  actorType: z.enum(["service", "user"]),
  actorId: z.string().trim().min(1).max(256),
  reason: z.string().trim().max(512).nullable(),
  createdAt: z.number().int().positive(),
}).strict();

export const adminVerifiedRunConflictSchema = z.object({
  submissionId: z.string().uuid(),
  submissionStatus: submissionStatus,
  playerAccountId: z.string().uuid(),
  playerName: z.string().trim().min(1).max(64),
  conflictFields: z.array(verifiedRunConflictFieldSchema).min(1),
  facts: z.object({
    mapName: z.string().trim().min(1).max(256).nullable(),
    mapVariant: z.literal("classic").nullable(),
    difficulty: verifiedRunDifficultySchema.nullable(),
    gameVersion: z.string().trim().min(1).max(64).nullable(),
    matchCode: z.string().regex(/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/).nullable(),
    completionDurationSeconds: z.number().int().positive().nullable(),
    deaths: z.number().int().nonnegative().nullable(),
    skips: z.number().int().nonnegative().nullable(),
  }).strict(),
  resolution: z.object({
    action: z.enum(["keep_existing", "invalidate_existing"]),
    actorType: z.enum(["service", "user"]),
    actorId: z.string().trim().min(1).max(256),
    reason: z.string().trim().max(512).nullable(),
    resolvedAt: z.number().int().positive(),
  }).strict().nullable(),
}).strict();

export const adminVerifiedRunListResponseSchema = z.object({
  contractVersion,
  items: z.array(adminVerifiedRunSchema).max(50),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(50),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).strict();
const verifiedRunCorrectionSnapshotSchema = z.object({
  mapId: externalId,
  gameplayRevisionId: externalId,
  mapVariant: z.literal("classic").nullable(),
  difficulty: verifiedRunDifficultySchema,
  gameVersion: z.string().trim().min(1).max(64),
  matchCode: z.string().regex(/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/),
  completionDurationSeconds: z.number().int().positive(),
  deaths: z.number().int().nonnegative().nullable(),
  skips: z.number().int().nonnegative().nullable(),
  eventCounters: verifiedRunEventCountersSchema,
  xpRuleVersion: z.enum(["v1", "v2"]),
  xpInputSnapshot: verifiedRunXpInputSnapshotSchema,
  awardedXp: z.number().int().nonnegative(),
}).strict();
export const adminVerifiedRunDetailResponseSchema = z.object({
  contractVersion,
  run: adminVerifiedRunSchema,
  projection: adminVerifiedRunProjectionSchema,
  sourceSubmission: adminSubmissionSchema,
  lifecycle: z.array(adminVerifiedRunLifecycleEventSchema).max(50),
  corrections: z.array(z.object({
    correctionId: z.string().uuid(),
    actorType: z.enum(["service", "user"]),
    actorId: z.string().trim().min(1).max(256),
    reason: z.string().trim().max(512).nullable(),
    createdAt: z.number().int().positive(),
    before: verifiedRunCorrectionSnapshotSchema,
    after: verifiedRunCorrectionSnapshotSchema,
  }).strict()).max(50),
  conflicts: z.array(adminVerifiedRunConflictSchema).max(50),
}).strict();
export const adminVerifiedRunStateRequestSchema = z.object({
  contractVersion,
  action: z.enum(["invalidate", "restore"]),
  reason: z.string().trim().max(512).optional(),
}).strict();
export const adminVerifiedRunStateResponseSchema = z.object({
  contractVersion,
  run: adminVerifiedRunSchema,
  projection: adminVerifiedRunProjectionSchema,
}).strict();
export const adminVerifiedRunConflictResolutionRequestSchema = z.object({
  contractVersion,
  action: z.enum(["keep_existing", "invalidate_existing"]),
  reason: z.string().trim().max(512).optional(),
}).strict();
export const adminVerifiedRunConflictResolutionResponseSchema = z.object({
  contractVersion,
  action: z.enum(["keep_existing", "invalidate_existing"]),
  run: adminVerifiedRunSchema,
  projection: adminVerifiedRunProjectionSchema,
}).strict();
export const adminVerifiedRunCorrectionRequestSchema = z.object({
  contractVersion,
  changes: z.object({
    mapId: externalId.optional(),
    gameplayRevisionId: externalId.optional(),
    difficulty: verifiedRunDifficultySchema.optional(),
    gameVersion: z.string().trim().min(1).max(64).optional(),
    matchCode: z.string().regex(/^[1-9]\d{3}(?:-[1-9]\d{3}){2}$/).optional(),
    completionDurationSeconds: z.number().int().positive().optional(),
    deaths: z.number().int().nonnegative().nullable().optional(),
    skips: z.number().int().nonnegative().nullable().optional(),
    eventCounters: verifiedRunEventCountersSchema.optional(),
  }).strict().superRefine((changes, ctx) => {
    if (!Object.keys(changes).length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one corrected fact is required" });
    if (Boolean(changes.mapId) !== Boolean(changes.gameplayRevisionId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gameplayRevisionId"], message: "Map and gameplay revision must be corrected together" });
  }),
  reason: z.string().trim().min(1).max(512).optional(),
}).strict();
export const adminVerifiedRunCorrectionResponseSchema = z.object({
  contractVersion,
  detail: adminVerifiedRunDetailResponseSchema,
  affectedProjections: z.array(adminVerifiedRunProjectionSchema).min(1).max(2),
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

export const playerSubmissionOcrSummarySchema = z.object({
  mapName: z.string().nullable(),
  difficulty: z.string().nullable(),
  playerName: z.string().nullable(),
  challengeCompleted: z.boolean().nullable(),
  achievementTitles: z.array(z.string()).optional(),
  // The recognition model that produced this summary, so a player can tell which model read their screenshot.
  modelVersion: z.string().optional(),
}).strict();

export const playerSubmissionOcrFeedbackSchema = z.object({
  // The recognition result this mark refers to; a re-recognition resets it.
  ocrResultId: z.string().uuid(),
  // The current mark, or null when nobody marked this recognition yet.
  accuracy: ocrAccuracyMarkSchema.nullable(),
}).strict();

// Shared by the player endpoint and the maintainer endpoint: the same mark
// shape, the same recognition binding.
export const ocrAccuracyFeedbackRequestSchema = z.object({
  contractVersion,
  ocrResultId: z.string().uuid(),
  accuracy: ocrAccuracyMarkSchema,
}).strict();

export const ocrAccuracyFeedbackResponseSchema = z.object({
  contractVersion,
  submissionId: z.string().uuid(),
  ocrResultId: z.string().uuid(),
  accuracy: ocrAccuracyMarkSchema,
  // True when this exact mark was already recorded (idempotent replay).
  alreadySubmitted: z.boolean(),
}).strict();

export const playerSubmissionDetailSchema = submissionStatusResponseSchema.extend({
  evidenceUrl: z.string().url().nullable().optional(),
  ocr: playerSubmissionOcrSummarySchema.optional(),
  ocrFailCount: z.number().int().nonnegative().optional(),
  manualReviewEligible: z.boolean().optional(),
  titleGrant: z.object({ grantId: z.string().uuid(), titleKey: externalId, titleName: z.string(), mapName: z.string().optional() }).optional(),
  feedback: playerSubmissionOcrFeedbackSchema.optional(),
});

export const adminPlayerRecentSubmissionSchema = submissionStatusResponseSchema.omit({ contractVersion: true }).extend({
  challenge: adminSubmissionChallengeSchema.nullable().optional(),
});

// ---- Immutable screenshot sets supplied to OCRKit for training (#255) ----
// Members are source screenshots selected by rule; a finalized set is the
// explicit approval that its members may be used for OCR training.

export const screenshotSetStatusSchema = z.enum(["draft", "finalized", "discarded"]);

export const screenshotSetCountsSchema = z.object({
  memberCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
}).strict();

export const adminScreenshotSetSchema = z.object({
  setId: z.string().uuid(),
  version: z.number().int().positive(),
  status: screenshotSetStatusSchema,
  createdBy: z.string(),
  createdAt: z.number().int(),
  finalizedBy: z.string().nullable(),
  finalizedAt: z.number().int().nullable(),
  discardedBy: z.string().nullable(),
  discardedAt: z.number().int().nullable(),
  note: z.string().nullable(),
  counts: screenshotSetCountsSchema,
}).strict();

export const adminScreenshotSetListResponseSchema = z.object({
  contractVersion,
  items: z.array(adminScreenshotSetSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).strict();

export const adminScreenshotSetCandidateSchema = z.object({
  sourceId: z.string().uuid(),
  submissionId: z.string().uuid(),
  mapName: z.string().trim().min(1),
  submissionStatus: z.string(),
  accuracy: ocrAccuracyMarkSchema.nullable(),
  layoutVersion: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  evidenceUrl: z.string().url().nullable(),
}).strict();

export const adminScreenshotSetCandidateListResponseSchema = z.object({
  contractVersion,
  items: z.array(adminScreenshotSetCandidateSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).strict();

export const adminScreenshotSetCreateRequestSchema = z.object({
  contractVersion,
  note: z.string().trim().max(1000).optional(),
  excludedSourceIds: z.array(z.string().uuid()).max(500).optional(),
}).strict();

export const adminScreenshotSetCreateResponseSchema = z.object({
  contractVersion,
  setId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.literal("draft"),
  counts: screenshotSetCountsSchema,
}).strict();

export const adminScreenshotSetFinalizeRequestSchema = z.object({
  contractVersion,
  note: z.string().trim().max(1000).optional(),
}).strict();

export const adminScreenshotSetFinalizeResponseSchema = z.object({
  contractVersion,
  setId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.literal("finalized"),
  finalizedAt: z.number().int(),
}).strict();

export const adminScreenshotSetDiscardRequestSchema = z.object({
  contractVersion,
  note: z.string().trim().max(1000).optional(),
}).strict();

export const adminScreenshotSetDiscardResponseSchema = z.object({
  contractVersion,
  setId: z.string().uuid(),
  version: z.number().int().positive(),
  status: z.literal("discarded"),
  discardedAt: z.number().int(),
}).strict();

export const adminScreenshotSetMemberSchema = z.object({
  sourceId: z.string().uuid(),
  submissionId: z.string().uuid(),
  mapName: z.string().trim().min(1),
  objectKey: z.string(),
  sha256: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  layoutVersion: z.string(),
  accuracy: ocrAccuracyMarkSchema.nullable(),
  evidenceUrl: z.string().url().nullable(),
}).strict();

export const adminScreenshotSetExclusionSchema = z.object({
  // Null when the excluded Submission had no stored screenshot at all.
  sourceId: z.string().uuid().nullable(),
  submissionId: z.string().uuid(),
  reason: z.string(),
}).strict();

export const adminScreenshotSetDetailResponseSchema = z.object({
  contractVersion,
  set: adminScreenshotSetSchema,
  members: z.array(adminScreenshotSetMemberSchema),
  exclusions: z.array(adminScreenshotSetExclusionSchema),
}).strict();

// Private OCRKit consumption payload: snake_case, per the snapshot contract.
// It carries only screenshot object facts and the accuracy hint — never player
// identity, QQ data, Submission decisions, Grant/mastery state, or risk data.
export const ocrkitScreenshotSetMemberSchema = z.object({
  source_id: z.string().uuid(),
  object_key: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/i),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  layout_version: z.string().min(1),
  accuracy: ocrAccuracyMarkSchema.nullable(),
}).strict();

export const ocrkitScreenshotSetResponseSchema = z.object({
  schema_version: z.literal(1),
  set_id: z.string().uuid(),
  version: z.number().int().positive(),
  finalized: z.literal(true),
  finalized_at: z.string(),
  members: z.array(ocrkitScreenshotSetMemberSchema),
}).strict();

export const adminPlayerRecentCompletionSchema = z.object({
  completionId: z.string().trim().min(1).max(256),
  challengeId: externalId,
  titleKey: externalId,
  titleName: z.string().trim().min(1).max(256),
  mapName: z.string().trim().min(1).max(256).nullable(),
  gameplayRevisionId: externalId.nullable(),
  gameVersion: z.string().trim().min(1).max(64).nullable(),
  status: z.enum(["active", "invalidated"]),
  sourceType: z.string().trim().min(1).max(64),
  completedAt: z.number().int(),
}).strict();

export const adminPlayerRecentVerifiedRunSchema = z.object({
  runId: z.string().uuid(),
  mapName: z.string().trim().min(1).max(256),
  gameplayRevisionId: externalId,
  gameVersion: z.string().trim().min(1).max(64),
  difficulty: verifiedRunDifficultySchema,
  awardedXp: z.number().int().nonnegative(),
  acceptedAt: z.number().int().positive(),
}).strict();

export const adminPlayerProgressionSchema = z.object({
  activeVerifiedRunCount: z.number().int().nonnegative(),
  recentVerifiedRuns: z.array(adminPlayerRecentVerifiedRunSchema).max(5),
}).strict();

export const adminPlayerDetailSchema = adminPlayerSummarySchema.extend({
  bindings: z.array(adminBindingSchema),
  recentSubmissions: z.array(adminPlayerRecentSubmissionSchema).max(10),
  recentCompletions: z.array(adminPlayerRecentCompletionSchema).max(10),
  progression: adminPlayerProgressionSchema,
  titleGrants: z.array(ownedTitleSchema.extend({ status: z.enum(["active", "revoked"]), revocationType: z.enum(["administrator", "evidence"]).nullable(), sourceType: z.enum(["historical", "submission", "manual", "automatic"]), grantedBy: z.string(), equipped: z.boolean(), equipable: z.boolean() })),
});

export const currentPlayerResponseSchema = z.object({
  contractVersion,
  player: z.object({
    playerId,
    playerName: z.string().trim().min(1).max(64),
    isAdmin: z.boolean().default(false),
  }),
  recentSubmissions: z.array(submissionStatusResponseSchema.omit({ contractVersion: true })).max(5),
});

export const playerVerifiedRunSchema = z.object({
  runId: z.string().uuid(),
  mapId: externalId,
  gameplayRevisionId: externalId,
  gameplayRevisionLifecycle: gameplayRevisionLifecycleSchema,
  mapVariant: z.literal("classic").nullable(),
  difficulty: verifiedRunDifficultySchema,
  completionDurationSeconds: z.number().int().positive(),
  deaths: z.number().int().nonnegative().nullable(),
  skips: z.number().int().nonnegative().nullable(),
  awardedXp: z.number().int().nonnegative(),
  acceptedAt: z.number().int().positive(),
  status: z.enum(["active", "invalidated"]),
}).strict();

export const playerVerifiedRunDifficultyStatSchema = z.object({
  difficulty: verifiedRunDifficultySchema,
  verifiedRunCount: z.number().int().positive(),
  fastestCompletionSeconds: z.number().int().positive(),
}).strict();

export const playerMasteryMapProfileSchema = z.object({
  mapId: externalId,
  gameplayRevisionId: externalId,
  gameplayRevisionLifecycle: gameplayRevisionLifecycleSchema,
  totalXp: z.number().int().nonnegative(),
  verifiedRunCount: z.number().int().positive(),
  difficultyStats: z.array(playerVerifiedRunDifficultyStatSchema).max(6),
  lowestDeaths: z.number().int().nonnegative().nullable(),
  fewestSkips: z.number().int().nonnegative().nullable(),
  highestSingleRunXp: z.number().int().nonnegative().nullable(),
  highestCompletedDifficulty: verifiedRunDifficultySchema.nullable(),
  recentRuns: z.array(playerVerifiedRunSchema).max(10),
}).strict();

export const currentPlayerMasteryResponseSchema = z.object({
  contractVersion,
  profiles: z.array(playerMasteryMapProfileSchema).max(100),
  runs: z.array(playerVerifiedRunSchema).max(50),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive().max(50),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
}).strict();

// Derived, privacy-safe per-player progress for aggregate Challenges. It
// exposes only required-map completion flags evaluated from authoritative
// Verified Runs — never Submission, OCR, or audit internals.
export const playerChallengeProgressSchema = z.object({
  challengeId: externalId,
  titleKey: externalId,
  titleName: z.string().trim().min(1).max(256),
  icon: achievementIcon,
  iconUrl: z.string().url().max(2048).nullable().optional(),
  status: z.enum(["scheduled", "active", "sunsetting"]),
  startsAt: scheduleTimestamp.optional(),
  endsAt: scheduleTimestamp.optional(),
  progressRule: achievementProgressRuleSchema,
  maps: z.array(z.object({ mapId: externalId, completed: z.boolean() }).strict()).max(256),
  completedMaps: z.number().int().nonnegative(),
  satisfied: z.boolean(),
}).strict();
export const playerChallengeProgressListResponseSchema = z.object({ contractVersion, items: z.array(playerChallengeProgressSchema).max(256) });

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
export type QqLoginAttemptRequest = z.infer<typeof qqLoginAttemptRequestSchema>;
export type QqLoginAttemptResponse = z.infer<typeof qqLoginAttemptResponseSchema>;
export type QqLoginStatusResponse = z.infer<typeof qqLoginStatusResponseSchema>;
export type QqLoginVerifyRequest = z.infer<typeof qqLoginVerifyRequestSchema>;
export type QqScreenshotSubmissionRequest = z.infer<typeof qqScreenshotSubmissionRequestSchema>;
export type QqScreenshotSubmissionResponse = z.infer<typeof qqScreenshotSubmissionResponseSchema>;
export type QqBindingClaimVerifyResponse = z.infer<typeof qqBindingClaimVerifyResponseSchema>;
export type AdminBindingClaimDecisionRequest = z.infer<typeof adminBindingClaimDecisionRequestSchema>;
export type AdminBindingClaimListResponse = z.infer<typeof adminBindingClaimListResponseSchema>;
export type PasskeyLoginOptionsResponse = z.infer<typeof passkeyLoginOptionsResponseSchema>;
export type PasskeyLoginVerifyRequest = z.infer<typeof passkeyLoginVerifyRequestSchema>;
export type PasskeyRegistrationVerifyRequest = z.infer<typeof passkeyRegistrationVerifyRequestSchema>;
export type PasskeyPublicRegistrationOptionsRequest = z.infer<typeof passkeyPublicRegistrationOptionsRequestSchema>;
export type PasskeyPublicRegistrationVerifyRequest = z.infer<typeof passkeyPublicRegistrationVerifyRequestSchema>;
export type PasskeyCredential = z.infer<typeof passkeyCredentialSchema>;
export type PasskeyCredentialListResponse = z.infer<typeof passkeyCredentialListResponseSchema>;
export type AdminPasskeyRecoveryRequest = z.infer<typeof adminPasskeyRecoveryRequestSchema>;
export type AdminPasskeyRecoveryResponse = z.infer<typeof adminPasskeyRecoveryResponseSchema>;
export type QqGroupAccessRequest = z.infer<typeof qqGroupAccessRequestSchema>;
export type QqGroupAccessResponse = z.infer<typeof qqGroupAccessResponseSchema>;
export type QqGroupRegistrationRequest = z.infer<typeof qqGroupRegistrationRequestSchema>;
export type AdminPlayerDetail = z.infer<typeof adminPlayerDetailSchema>;
export type AdminPlayerListResponse = z.infer<typeof adminPlayerListResponseSchema>;
export type AdminPlayerStatusRequest = z.infer<typeof adminPlayerStatusRequestSchema>;
export type AdminPlayerIdentityRequest = z.infer<typeof adminPlayerIdentityRequestSchema>;
export type SubmissionStatusResponse = z.infer<typeof submissionStatusResponseSchema>;
export type PlayerSubmissionStatus = SubmissionStatusResponse["status"];
export type PlayerSubmissionDetail = z.infer<typeof playerSubmissionDetailSchema>;
export type OcrAccuracyMark = z.infer<typeof ocrAccuracyMarkSchema>;
export type OcrAccuracyFeedbackRequest = z.infer<typeof ocrAccuracyFeedbackRequestSchema>;
export type OcrAccuracyFeedbackResponse = z.infer<typeof ocrAccuracyFeedbackResponseSchema>;
export type ScreenshotSetStatus = z.infer<typeof screenshotSetStatusSchema>;
export type AdminScreenshotSet = z.infer<typeof adminScreenshotSetSchema>;
export type AdminScreenshotSetListResponse = z.infer<typeof adminScreenshotSetListResponseSchema>;
export type AdminScreenshotSetCandidate = z.infer<typeof adminScreenshotSetCandidateSchema>;
export type AdminScreenshotSetCandidateListResponse = z.infer<typeof adminScreenshotSetCandidateListResponseSchema>;
export type AdminScreenshotSetCreateRequest = z.infer<typeof adminScreenshotSetCreateRequestSchema>;
export type AdminScreenshotSetCreateResponse = z.infer<typeof adminScreenshotSetCreateResponseSchema>;
export type AdminScreenshotSetFinalizeRequest = z.infer<typeof adminScreenshotSetFinalizeRequestSchema>;
export type AdminScreenshotSetFinalizeResponse = z.infer<typeof adminScreenshotSetFinalizeResponseSchema>;
export type AdminScreenshotSetDiscardRequest = z.infer<typeof adminScreenshotSetDiscardRequestSchema>;
export type AdminScreenshotSetDiscardResponse = z.infer<typeof adminScreenshotSetDiscardResponseSchema>;
export type AdminScreenshotSetMember = z.infer<typeof adminScreenshotSetMemberSchema>;
export type AdminScreenshotSetExclusion = z.infer<typeof adminScreenshotSetExclusionSchema>;
export type AdminScreenshotSetDetailResponse = z.infer<typeof adminScreenshotSetDetailResponseSchema>;
export type OcrkitScreenshotSetResponse = z.infer<typeof ocrkitScreenshotSetResponseSchema>;
export type CurrentPlayerResponse = z.infer<typeof currentPlayerResponseSchema>;
export type AchievementProgressRule = z.infer<typeof achievementProgressRuleSchema>;
export type PlayerChallengeProgress = z.infer<typeof playerChallengeProgressSchema>;
export type PlayerChallengeProgressListResponse = z.infer<typeof playerChallengeProgressListResponseSchema>;
export type CurrentPlayerTitlesResponse = z.infer<typeof currentPlayerTitlesResponseSchema>;
export type PlayerActivityDay = z.infer<typeof playerActivityDaySchema>;
export type PlayerActivityResponse = z.infer<typeof playerActivityResponseSchema>;
export type VerifiedRunDifficulty = z.infer<typeof verifiedRunDifficultySchema>;
export type PlayerVerifiedRun = z.infer<typeof playerVerifiedRunSchema>;
export type PlayerMasteryMapProfile = z.infer<typeof playerMasteryMapProfileSchema>;
export type CurrentPlayerMasteryResponse = z.infer<typeof currentPlayerMasteryResponseSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type Challenge = z.infer<typeof challengeSchema>;
export type Map = z.infer<typeof mapSchema>;
export type AgentSpatialConfig = z.infer<typeof agentSpatialConfigSchema>;
export type AgentMap = z.infer<typeof agentMapSchema>;
export type RandomEvent = z.infer<typeof randomEventSchema>;
export type RandomEventListResponse = z.infer<typeof randomEventListResponseSchema>;
export type ReviewTarget = z.infer<typeof reviewTargetSchema>;
export type PublicReviewComment = z.infer<typeof publicReviewCommentSchema>;
export type PublicReviewCommentPage = z.infer<typeof publicReviewCommentPageSchema>;
export type PlayerReview = z.infer<typeof playerReviewSchema>;
export type PlayerReviewResponse = z.infer<typeof playerReviewResponseSchema>;
export type AdminReview = z.infer<typeof adminReviewSchema>;
export type AdminReviewAudit = z.infer<typeof adminReviewAuditSchema>;
export type AdminReviewListResponse = z.infer<typeof adminReviewListResponseSchema>;
export type AdminRandomEventCreateRequest = z.infer<typeof adminRandomEventCreateRequestSchema>;
export type AdminRandomEventUpdateRequest = z.infer<typeof adminRandomEventUpdateRequestSchema>;
export type AdminRandomEventBatchRequest = z.infer<typeof adminRandomEventBatchRequestSchema>;
export type AdminRandomEventImportRequest = z.infer<typeof adminRandomEventImportRequestSchema>;
export type RandomEventVersion = z.infer<typeof randomEventVersionSchema>;
export type AdminRandomEventVersionListResponse = z.infer<typeof adminRandomEventVersionListResponseSchema>;
export type AdminRandomEventVersionAvailabilityRequest = z.infer<typeof adminRandomEventVersionAvailabilityRequestSchema>;
export type AdminStandaloneMode = z.infer<typeof adminStandaloneModeSchema>;
export type AdminStandaloneModeListResponse = z.infer<typeof adminStandaloneModeListResponseSchema>;
export type AdminStandaloneModeUpsertRequest = z.infer<typeof adminStandaloneModeUpsertRequestSchema>;
export type AdminMapMetadataUpdateRequest = z.infer<typeof adminMapMetadataUpdateRequestSchema>;
export type AdminMapRevisionChallengeAssignment = z.infer<typeof adminMapRevisionChallengeAssignmentSchema>;
export type AdminMapRevisionCreateRequest = z.infer<typeof adminMapRevisionCreateRequestSchema>;
export type AdminMapRevisionUpdateRequest = z.infer<typeof adminMapRevisionUpdateRequestSchema>;
export type AdminMapRevisionPromotionRequest = z.infer<typeof adminMapRevisionPromotionRequestSchema>;
export type AdminMapEditorChallengeOption = z.infer<typeof adminMapEditorChallengeOptionSchema>;
export type AdminMapRevision = z.infer<typeof adminMapRevisionSchema>;
export type AdminMapEditorAudit = z.infer<typeof adminMapEditorAuditSchema>;
export type AdminMapEditorResponse = z.infer<typeof adminMapEditorResponseSchema>;
export type Title = z.infer<typeof titleSchema>;
export type AgentTitle = z.infer<typeof agentTitleSchema>;
export type AgentEventListResponse = z.infer<typeof agentEventListResponseSchema>;
export type AgentMapListResponse = z.infer<typeof agentMapListResponseSchema>;
export type AgentAchievementListResponse = z.infer<typeof agentAchievementListResponseSchema>;
export type AgentTitleListResponse = z.infer<typeof agentTitleListResponseSchema>;
export type AgentPlayerTitleGrantListResponse = z.infer<typeof agentPlayerTitleGrantListResponseSchema>;
export type AgentMapTitleHolderListResponse = z.infer<typeof agentMapTitleHolderListResponseSchema>;
export type AgentSearchResult = z.infer<typeof agentSearchResultSchema>;
export type AgentSearchResponse = z.infer<typeof agentSearchResponseSchema>;
export type OwnedTitle = z.infer<typeof ownedTitleSchema>;
export type HistoricalTitleGrant = z.infer<typeof historicalTitleGrantSchema>;
export type AdminHistoricalTitleHolderFilter = z.infer<typeof adminHistoricalTitleHolderFilterSchema>;
export type AdminTitleGrantListResponse = z.infer<typeof adminTitleGrantListResponseSchema>;
export type AdminTitleGrantHolderDetailResponse = z.infer<typeof adminTitleGrantHolderDetailResponseSchema>;
export type AdminTitleGrantRequest = z.infer<typeof adminTitleGrantRequestSchema>;
export type AdminTitleGrantBulkRequest = z.infer<typeof adminTitleGrantBulkRequestSchema>;
export type AdminTitleGrantBulkResponse = z.infer<typeof adminTitleGrantBulkResponseSchema>;
export type AdminTitleGrantRestoreRequest = z.infer<typeof adminTitleGrantRestoreRequestSchema>;
export type AdminManualTitleGrantRequest = z.infer<typeof adminManualTitleGrantRequestSchema>;
export type AdminManualTitleGrantResponse = z.infer<typeof adminManualTitleGrantResponseSchema>;
export type AdminManualTitleGrantTarget = z.infer<typeof adminManualTitleGrantTargetSchema>;
export type AdminManualTitleGrantBatchRequest = z.infer<typeof adminManualTitleGrantBatchRequestSchema>;
export type AdminManualTitleGrantBatchResponse = z.infer<typeof adminManualTitleGrantBatchResponseSchema>;
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
export type AdminSubmission = z.infer<typeof adminSubmissionSchema>;
export type AdminSubmissionListResponse = z.infer<typeof adminSubmissionListResponseSchema>;
export type AdminSubmissionReviewRequest = z.infer<typeof adminSubmissionReviewRequestSchema>;
export type AdminSubmissionReviewResponse = z.infer<typeof adminSubmissionReviewResponseSchema>;
export type AdminSubmissionReviewPreviewRequest = z.infer<typeof adminSubmissionReviewPreviewRequestSchema>;
export type AdminSubmissionReviewPreviewResponse = z.infer<typeof adminSubmissionReviewPreviewResponseSchema>;
export type AdminSubmissionReviewCandidate = z.infer<typeof adminSubmissionReviewCandidateSchema>;
export type AdminSubmissionOcrRetryResponse = z.infer<typeof adminSubmissionOcrRetryResponseSchema>;
export type AdminSubmissionSpotCheckRequest = z.infer<typeof adminSubmissionSpotCheckRequestSchema>;
export type AdminSubmissionSpotCheckResponse = z.infer<typeof adminSubmissionSpotCheckResponseSchema>;
export type AdminVerifiedRun = z.infer<typeof adminVerifiedRunSchema>;
export type AdminVerifiedRunProjection = z.infer<typeof adminVerifiedRunProjectionSchema>;
export type AdminVerifiedRunConflict = z.infer<typeof adminVerifiedRunConflictSchema>;
export type AdminVerifiedRunListResponse = z.infer<typeof adminVerifiedRunListResponseSchema>;
export type AdminVerifiedRunDetailResponse = z.infer<typeof adminVerifiedRunDetailResponseSchema>;
export type AdminVerifiedRunStateRequest = z.infer<typeof adminVerifiedRunStateRequestSchema>;
export type AdminVerifiedRunStateResponse = z.infer<typeof adminVerifiedRunStateResponseSchema>;
export type AdminVerifiedRunConflictResolutionRequest = z.infer<typeof adminVerifiedRunConflictResolutionRequestSchema>;
export type AdminVerifiedRunConflictResolutionResponse = z.infer<typeof adminVerifiedRunConflictResolutionResponseSchema>;
export type AdminVerifiedRunCorrectionRequest = z.infer<typeof adminVerifiedRunCorrectionRequestSchema>;
export type AdminVerifiedRunCorrectionResponse = z.infer<typeof adminVerifiedRunCorrectionResponseSchema>;

export const ocrkitRecognitionResultSchema = z.object({
  schema_version: z.literal("1"),
  ok: z.boolean(),
  request_id: z.string().uuid(),
  model_version: z.string().optional(),
  layout_version: z.string().optional(),
  warnings: z.unknown().optional(),
  quality: z.object({ warnings: z.unknown().optional(), layout_version: z.string().optional(), cropped: z.boolean().optional() }).passthrough().optional(),
  fields: z.record(z.string(), z.object({ confidence: z.number().min(0).max(1).optional(), status: z.string().optional(), value: z.unknown().optional() }).passthrough()),
  data: z.object({
    map_name: z.string().nullable().optional(), map_variant: z.string().nullable().optional(),
    difficulty: z.string().nullable().optional(), challenge_completed: z.boolean().nullable().optional(),
    viewer_player: z.string().nullable().optional(), achievement_titles: z.array(z.string()).optional(),
    achievement_panel_text: z.string().nullable().optional(), version: z.string().nullable().optional(),
    run_code: z.string().nullable().optional(), duration_seconds: z.number().nullable().optional(),
    deaths: z.number().nullable().optional(), skips: z.number().nullable().optional(),
    event: z.object({ name: z.string().nullable(), duration_seconds: z.number().nullable(), description: z.array(z.string()), numbers: z.array(z.object({ text: z.string(), value: z.number(), unit: z.string().nullable() })), text: z.string() }).nullable().optional(),
    ai_mark_detected: z.boolean().nullable().optional(), mode: z.string().nullable().optional(),
    restart_in_seconds: z.number().nullable().optional(), uptime_seconds: z.number().nullable().optional(), server_load: z.number().nullable().optional(),
  }).passthrough().nullable(),
}).passthrough();
export const ocrkitJobCallbackSchema = z.union([
  z.object({ contractVersion, result: ocrkitRecognitionResultSchema }).strict(),
  z.object({ contractVersion, errorCode: z.enum(["OCR_RECOGNITION_FAILED", "OCR_JOB_EXPIRED"]) }).strict(),
]);
export type OcrkitJobCallback = z.infer<typeof ocrkitJobCallbackSchema>;
