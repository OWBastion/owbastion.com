import { count, desc, eq, and, or, inArray, isNull, isNotNull, ne, lte, lt, gte, notExists, sql, asc } from "drizzle-orm";

import { drizzle } from "drizzle-orm/d1";
import { createPasskeyAuthenticationOptions, createPasskeyRegistrationOptions, passkeyUserHandleMatches, verifyPasskeyAuthentication, verifyPasskeyRegistration } from "@owbastion/auth";
import { buildMasteryMapProfile, buildMasteryProfiles, calculateVerifiedRunXpV3, difficultyAtLeastSatisfied, isVerifiedRunGameVersionSupported, isVerifiedRunOcrLayoutSupported, isWellFormedGameVersion, matchGameMode, normalizeGameMode, regularGameModeLabel, eventWeightTotalCode, runCodeEventWeightTotal, parseCanonicalChallengeConditions, parseChallengeProgressRule, randomEventRarityForWeight, verifiedRunDifficulties, verifiedRunEvidenceCompatibilityV1, normalizeMatchCode, publicTitleChallengeStatus } from "@owbastion/domain";
export { publicTitleChallengeStatus } from "@owbastion/domain";
import type { AdminVerifiedRunQuery, AgentAchievementQuery, AgentEventQuery, AgentMapQuery, AgentSearchQuery, AgentTitleQuery, AgentPlayerTitleGrantQuery, AgentMapTitleHolderQuery, AuthContext, ChallengeCondition, ChallengeProgressRule, VerifiedRunDifficulty, VerifiedRunEventCounters, VerifiedRunEvidenceCompatibilityV1, MasteryMapProfile, VerifiedRunActor, VerifiedRunConflictField, VerifiedRunForProjection, VerifiedRunXpSnapshot, PlatformServices, PublicReviewCommentPage, PublicReviewCommentQuery, RecordVerifiedRunResult, ReviewRating, ReviewRecord, ReviewSummary, ReviewSummaryBatchInput, ReviewTarget, ReviewTargetType, ReviewUpsertInput, AdminReviewDetail, AdminReviewQuery, VerifiedRun, VerifiedRunInput } from "@owbastion/domain";
import { agentGameplayRevisionSchema, agentProjectedSpatialConfigSchema, agentSpatialConfigSchema } from "@owbastion/contracts";
import type { AdminRandomEventBatchRequest, AdminStandaloneMode, AdminStandaloneModeListResponse, AdminChallenge, AdminChallengeUpdateRequest, AdminCatalogTitleUpdateRequest, AdminMapMetadataUpdateRequest, AdminMapEditorChallengeOption, AdminMapEditorResponse, AdminMapRevision, AdminMapRevisionChallengeAssignment, AdminMapRevisionCreateRequest, AdminMapRevisionUpdateRequest, AdminMapTitleRule, AdminMapTitleRuleCreateRequest, AdminMapTitleRuleUpdateRequest, AdminMapTitleRuleExceptionUpsertRequest, AdminRandomEventCreateRequest, AdminRandomEventImportRequest, AdminRandomEventUpdateRequest, AdminRandomEventVersionAvailabilityRequest, AdminRandomEventVersionListResponse, AdminScreenshotSetCandidateListResponse, AdminScreenshotSetCreateRequest, AdminScreenshotSetCreateResponse, AdminScreenshotSetDetailResponse, AdminScreenshotSetDiscardResponse, AdminScreenshotSetFinalizeResponse, AdminScreenshotSetListResponse, AdminSubmissionOcrReevaluateResponse, AdminSubmissionOcrRetryResponse, AdminSubmissionReopenResponse, AdminSubmissionReviewCandidate, AdminSubmissionReviewPreviewResponse, AdminSubmissionReviewRequest, AdminSubmissionReviewResponse, AdminSubmissionSpotCheckResponse, AdminManualTitleGrantRequest, AdminManualTitleGrantResponse, AdminManualTitleGrantTarget, AdminManualTitleGrantBatchRequest, AdminManualTitleGrantBatchResponse, AdminVerifiedRun, AdminVerifiedRunConflict, AdminVerifiedRunDetailResponse, AdminVerifiedRunProjection, AdminVerifiedRunStateResponse, AdminVerifiedRunConflictResolutionResponse, AdminVerifiedRunCorrectionRequest, AdminVerifiedRunCorrectionResponse, AdminReview, AgentMap, AgentSearchResult, AgentSpatialConfig, AgentTitle, Challenge, CurrentPlayerMasteryResponse, Map, OcrAccuracyFeedbackRequest, OcrAccuracyFeedbackResponse, OcrAccuracyMark, OcrkitScreenshotSetResponse, PlayerChallengeProgressListResponse, PlayerProfileVisibilityResponse, PlayerSubmissionStatus, QqGroupAccessRequest, QqLoginAttemptRequest, QqLoginVerifyRequest, QqScreenshotSubmissionRequest, QqScreenshotSubmissionResponse, RandomEvent, RandomEventVersion, ScreenshotSetStatus, Title } from "@owbastion/contracts";
import { achievementChallengeMaps, achievementChallenges, attachments, auditEvents, bindingClaims, bindingInvites, bindingInviteHistoricalTitleGrants, bindings, challengeCompletions, challengeSatisfies, challenges, effectGlossaryTerms, gameplayRevisionChallengeAssignments, gameplayRevisions, historicalTitleGrants, identities, idempotencyKeys, mapMetadata, mapTitleRewards, mapTitleRuleCompat, mapTitleRuleExceptions, mapTitleRules, maps, ocrAccuracyFeedback, ocrResults, passkeyChallenges, passkeyCredentials, passkeyRecoveryGrants, playerAccounts, playerEquippedTitles, playerTitleEntitlements, playerTitleGrants, portalSessions, qqGroupAccess, qqGroupPolicyOutbox, qqLoginAttempts, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, randomEventVersions, reviews, standaloneModes, screenshotSetMembers, screenshotSets, submissionOutcomes, submissionReviews, submissionSpotChecks, submissions, titleCatalog, titleChallenges, uploadSessions, verifiedRunConflictResolutions, verifiedRunLifecycleEvents, verifiedRuns } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { fetchQqAttachmentImage } from "./qq-attachment";
import { createPlayerUploadServices, maxUploadBytes, playerSubmissionStatus } from "./player-upload-service";
import { matchOcrAgainstChallenges, type AutoMatchCandidate, type CanonicalOcrChallenge } from "./ocr-auto-match";
import { assessVerifiedRunOcrEvidence, hasReliableVerifiedRunField, normalizeOcrDifficulty, standaloneOcrMode, type OcrResponse } from "./ocr-response";
import { createCanonicalChallengeServices, type CanonicalChallengeInput, type CanonicalChallengePlan, type CanonicalChallengeResolver } from "./canonical-challenge-service";
import { createChallengeCompletionServices, type ChallengeCompletionAward } from "./challenge-completion-service";
import { hashRequest, resolvePortalSession } from "./portal-session";
import { createPlatformCache, instrumentDatabase } from "./platform-cache";
import { createReviewServices } from "./review-service";
import { createLeaderboardServices } from "./leaderboard-service";
import { createPlayerHandleServices } from "./player-handle-service";
import { createSeasonServices } from "./season-service";
import { createAdminPlayerServices } from "./admin-player-service";
import { createQqGroupServices } from "./qq-group-service";
import { createAgentServices } from "./agent-service";
import { createRandomEventServices } from "./random-event-service";
import { createMapRevisionServices, pioneerExceptionHasValidWindow } from "./map-revision-service";
import { createPlayerTitleServices, type ManualTitleGrantResolution } from "./player-title-service";
import { createBindingServices } from "./binding-service";
import { createPortalAuthenticationServices } from "./portal-authentication-service";
import { activeMasteryProfiles, asVerifiedRun, loadActiveVerifiedRuns, loadPlayerMasteryHistory, loadVerifiedRunXpContext, masteryConflictFields, playerMasteryProfileView, playerActivityDays, playerVerifiedRunView, prepareVerifiedRun } from "./mastery-query";
import { pageResult, paginate } from "./page-result";
import { createChallengeSnapshotServices, type MapTitleRuleSnapshot } from "./challenge-snapshot-service";
import { createChallengeCatalogServices } from "./challenge-catalog-service";
import { createAdminVerifiedRunServices } from "./admin-verified-run-service";
import { createAdminMapServices } from "./admin-map-service";
import { createAdminCatalogServices } from "./admin-catalog-service";
import { createSubmissionOcrServices } from "./submission-ocr-service";
import { createSubmissionReviewPersistence } from "./submission-review-persistence";
import type { VerifiedRunSubmissionOutcome, VerifiedRunSubmissionOutcomeStatus } from "./submission-ocr-service";

export { maxReviewCommentLength, reviewSampleThreshold } from "./review-service";
export { assessVerifiedRunOcrEvidence } from "./ocr-response";
export { pioneerExceptionHasValidWindow } from "./map-revision-service";
export type { VerifiedRunOcrEvidenceAssessment } from "./ocr-response";

const now = () => Date.now();
const ocrRetryEnqueueingPrefix = "ocr-retry-enqueueing:";
const qqScreenshotEnqueueingPrefix = "qq-screenshot-enqueueing:";
const qqScreenshotResumeAfterMs = 60_000;
// Bastion builds are YY.MMDD.N; with no known build the day's first build number stands in.
const formatDayBuildVersion = (timestamp = now()) => { const date = new Date(timestamp).toISOString().slice(2, 10).split("-"); return `${date[0]}.${date[1]}${date[2]}.1`; };

const normalizedOcrLabel = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

const digestHex = async (value: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const logOcrEvent = (event: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ layer: "ocr", event, ...fields }));
const errorDetails = (error: unknown) => ({ errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256) });
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// The stored object key is `.../<version>.<extension>`; the version segment is minted once at
// upload time and is what the versioned public route matches against, so a previously issued
// immutable URL can never be answered with a later upload's bytes — it either still matches the
// current object or 404s once that object is replaced.
export const titleIconVersionOf = (objectKey: string): string => {
  const fileName = objectKey.slice(objectKey.lastIndexOf("/") + 1);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
};
// Public availability derives from lifecycle and open window: draft or archived
// never projects, a future start is "scheduled", a retiredVersion is "sunsetting".
export const titleChallengeIsSubmittable = (status: string, startsAt: number | null, endsAt: number | null, timestamp: number, gameVersion: string | null | undefined = "known") => {
  const publicStatus = publicTitleChallengeStatus(status, startsAt, endsAt, timestamp, gameVersion);
  return publicStatus === "active" || publicStatus === "sunsetting";
};
export const pioneerExceptionIsSubmittable = (enabled: number, startsAt: number | null, endsAt: number | null, timestamp: number) => enabled === 1 && pioneerExceptionHasValidWindow(startsAt, endsAt) && timestamp >= startsAt! && timestamp < endsAt!;
const bytesToHex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const sha256 = (value: BufferSource) => crypto.subtle.digest("SHA-256", value);
const randomToken = (bytes = 32) => {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
};

const randomCode = (length: number) => {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
};

const hexToBytes = (value: string) => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
};
const bindingInviteCodeKey = async (secret?: string) => {
  if (!secret) throw new Error("BINDING_INVITE_CODE_ENCRYPTION_NOT_CONFIGURED");
  const raw = await sha256(new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};
const encryptBindingInviteCode = async (code: string, secret?: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await bindingInviteCodeKey(secret), new TextEncoder().encode(code));
  return `${bytesToHex(iv)}.${bytesToHex(new Uint8Array(ciphertext))}`;
};
const decryptBindingInviteCode = async (value: string, secret?: string) => {
  const [iv, ciphertext, ...extra] = value.split(".");
  if (!iv || !ciphertext || extra.length) throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(iv) }, await bindingInviteCodeKey(secret), hexToBytes(ciphertext));
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    if (error instanceof Error && error.message === "BINDING_INVITE_CODE_ENCRYPTION_NOT_CONFIGURED") throw error;
    throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
  }
};

// Marks a Verified Run invalidated because its approved submission was reopened for correction.
const submissionReopenedReason = "submission_reopened";

const replayOrConflict = async <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => {
  const existing = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.id, `${actorId}:${operation}:${key}`))).get();
  if (!existing) return null;
  const requestHash = await hashRequest(input);
  if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
  return JSON.parse(existing.responseJson) as T;
};

const recordIdempotency = async (db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown, response: unknown) => {
  await db.insert(idempotencyKeys).values({
    id: `${actorId}:${operation}:${key}`,
    actorId,
    operation,
    requestHash: await hashRequest(input),
    responseJson: JSON.stringify(response),
    createdAt: now(),
  });
};

const recordAudit = async (db: ReturnType<typeof drizzle>, auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => {
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
    actorType: auth.actorType,
    actorId: auth.subject,
    operation,
    entityType,
    entityId,
    payloadJson: JSON.stringify(payload),
    createdAt: now(),
  });
};

const normalizePlayerName = (name: string) => name.trim().toLocaleLowerCase();

const titleColor = (value: string) => JSON.parse(value) as { kind: "heroColor"; index: number } | { kind: "rgb"; value: [number, number, number] } | { kind: "palette"; name: "orange" | "red" | "purple" | "gold" | "blue" } | null;
const titleCatalogView = (row: typeof titleCatalog.$inferSelect): Omit<Title, "scope" | "mapId" | "slot" | "pioneerPrefixes" | "gameVersion"> => ({
  titleKey: row.key,
  label: row.label,
  icon: row.icon,
  iconUrl: row.iconUrl,
  category: row.category,
  condition: row.condition,
  lifecycle: row.lifecycle as Title["lifecycle"],
  publicVisibility: row.publicVisibility === 1,
  // No stored retired state: whether a title is still obtainable is derived per path.
  availability: "active",
  displayKind: row.displayKind as Title["displayKind"],
  color: titleColor(row.colorJson),
});
const toAgentTitle = (row: typeof titleCatalog.$inferSelect): AgentTitle => ({
  ...titleCatalogView(row),
  scope: row.scope as Title["scope"],
  gameVersion: row.gameVersion?.trim() || null,
});

const playerManualReviewReason = "玩家申请人工处理";

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export const createPlatformServices = (rawDatabase: D1Database, evidenceBucket?: R2Bucket, uploadOrigin = "https://api.owbastion.com", ocrkitBaseUrl?: string, ocrkitApiToken?: string, ocrQueue?: Queue, qqPolicyQueue?: Queue, bindingInviteCodeEncryptionKey?: string, ocrManualReviewThreshold = 1, ocrAutoReviewSampleRate = 0, masteryEvidenceCompatibility: VerifiedRunEvidenceCompatibilityV1 = verifiedRunEvidenceCompatibilityV1, evidencePublicOrigin?: string, cacheKv?: KVNamespace): PlatformServices => {
  const platformCache = createPlatformCache(cacheKv);
  const database = instrumentDatabase(rawDatabase, platformCache);
  const db = drizzle(database);
  const {
    enabledMapChallengeAssignment,
    fetchAllPublicChallenges,
    fetchPlayerAutoMatchChallenges,
    loadChallengeMapIds,
    loadMapScopedTitleChallenges,
    loadMapTitleRuleChallenges,
    loadTitleChallengeRevisions,
    mapChallengeQuery,
    listPublicAchievements, publicEventChallenges,
    publicTitleChallengeFields,
    toPublicMapChallenge,
    toPublicTitleChallenge,
    toTitleChallengeBase,
    validateChallengeMapScope,
  } = createChallengeCatalogServices({ db, now, platformCache, pioneerExceptionIsSubmittable, publicTitleChallengeStatus });
  const { batchResolveAutomaticSnapshots, resolveLegacyProjection, resolveMapTitleProjection, resolveMapTitleProjections, selectGameplayRevision, snapshotTitleChallenge } = createChallengeSnapshotServices({ db, now, pioneerExceptionIsSubmittable, pioneerExceptionHasValidWindow });
  const databaseServiceDependencies = {
    now,
    platformCache,
    hashRequest,
    replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => replayOrConflict<T>(db, actorId, operation, key, input),
    recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => recordIdempotency(db, actorId, operation, key, input, response),
    recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => recordAudit(db, auth, operation, entityType, entityId, payload),
  };
  const randomEventServices = createRandomEventServices(database, db, {
    now,
    platformCache,
    hashRequest,
    replayOrConflict,
    recordIdempotency,
    recordAudit,
    publicEventChallenges: (eventId) => publicEventChallenges(eventId),
    fetchAllPublicChallenges: () => fetchAllPublicChallenges(),
  });
  const expiredAuthRowRetentionMs = 10 * 60 * 1000;
  const pruneExpiredPortalSessions = async (timestamp: number) => {
    await database.prepare("DELETE FROM portal_sessions WHERE expires_at <= ?").bind(timestamp).run();
  };
  const pruneExpiredBindingClaims = async (timestamp: number) => {
    const staleBefore = timestamp - expiredAuthRowRetentionMs;
    await database.batch([
      database.prepare("UPDATE binding_claims SET status = 'expired' WHERE status = 'pending_confirmation' AND expires_at <= ?").bind(timestamp),
      database.prepare("DELETE FROM binding_claims WHERE status = 'expired' AND expires_at <= ?").bind(staleBefore),
    ]);
  };
  const publicEvidenceBase = evidencePublicOrigin?.replace(/\/$/, "");
  const publicEvidenceUrl = (objectKey: string | null | undefined) => publicEvidenceBase && objectKey ? `${publicEvidenceBase}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : null;
  const findEquipableGrantIds = async (playerAccountId: string, grantIds: string[]) => {
    if (!grantIds.length) return [];
    const grants = await db.select({ id: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey }).from(playerTitleGrants)
      .innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key))
      .leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
      .where(and(
        inArray(playerTitleGrants.id, grantIds),
        eq(playerTitleGrants.playerAccountId, playerAccountId),
        eq(playerTitleGrants.status, "active"),
        isNotNull(titleCatalog.gameVersion),
        eq(titleCatalog.scope, "global"),
        or(
          and(isNull(playerTitleGrants.mapId), isNull(playerTitleGrants.gameplayRevisionId)),
          and(eq(playerTitleGrants.mapId, gameplayRevisions.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])),
        ),
      ));
    if (grants.length !== grantIds.length || new Set(grants.map((grant) => grant.titleKey)).size !== grants.length) throw new Error("EQUIPPED_TITLE_GRANT_INVALID");
    return grants;
  };
  const listGlobalAgentTitles = async () => (await platformCache.cached("catalog", "agent-global-titles", () => db.select().from(titleCatalog)
    .where(eq(titleCatalog.scope, "global"))
    .orderBy(titleCatalog.key))).map(toAgentTitle);

  const reconcileStaleOcrJobs = async (input: { olderThan: number }) => {
    const staleSubmissions = await db.select({ id: submissions.id, updatedAt: submissions.updatedAt })
      .from(submissions)
      .where(and(eq(submissions.status, "ocr_pending"), lte(submissions.updatedAt, input.olderThan)))
      .orderBy(asc(submissions.updatedAt), asc(submissions.id))
      .limit(100);
    // Fetch every pending OCR result once instead of one select per
    // submission; the per-submission batch then carries only writes.
    const pendingRows = staleSubmissions.length
      ? await db.select({ id: ocrResults.id, submissionId: ocrResults.submissionId })
        .from(ocrResults)
        .where(and(inArray(ocrResults.submissionId, staleSubmissions.map((submission) => submission.id)), eq(ocrResults.status, "pending")))
      : [];
    const pendingBySubmission = new globalThis.Map<string, string[]>();
    for (const row of pendingRows) pendingBySubmission.set(row.submissionId, [...(pendingBySubmission.get(row.submissionId) ?? []), row.id]);
    let recoveredCount = 0;
    for (const submission of staleSubmissions) {
      const pendingResults = pendingBySubmission.get(submission.id) ?? [];
      const timestamp = Math.max(now(), submission.updatedAt + 1);
      const recoveryResultId = crypto.randomUUID();
      const statements = [
        database.prepare(`UPDATE ocr_results
          SET status = 'error', error_code = 'OCR_QUEUE_STALLED', created_at = ?
          WHERE submission_id = ? AND status = 'pending'
            AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending' AND updated_at <= ?)`)
          .bind(timestamp, submission.id, submission.id, input.olderThan),
        database.prepare(`INSERT INTO ocr_results (id, submission_id, attempt, status, error_code, created_at)
          SELECT ?, ?, 0, 'error', 'OCR_QUEUE_STALLED', ?
          WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending' AND updated_at <= ?)`)
          .bind(recoveryResultId, submission.id, timestamp, submission.id, input.olderThan),
        database.prepare(`UPDATE submissions
          SET status = 'resubmission_required', review_reason = ?, ocr_fail_count = ocr_fail_count + 1, updated_at = ?
          WHERE id = ? AND status = 'ocr_pending' AND updated_at <= ?`)
          .bind("截图暂时无法处理，请重新提交截图。", timestamp, submission.id, input.olderThan),
        ...pendingResults.map((id) => database.prepare(`DELETE FROM idempotency_keys
          WHERE operation = 'submission.ocr.retry' AND response_json = ?
            AND EXISTS (SELECT 1 FROM ocr_results WHERE id = ? AND status = 'error' AND error_code = 'OCR_QUEUE_STALLED')`)
          .bind(`${ocrRetryEnqueueingPrefix}${id}`, id)),
      ];
      // The recovery INSERT is statement index 1; meta.changes tells whether
      // this submission was still stale when the batch executed, replacing the
      // former verify-by-select round trip.
      const results = await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      if ((results[1]?.meta.changes ?? 0) > 0) {
        recoveredCount += 1;
        logOcrEvent("stale_job_recovered", { submissionId: submission.id, errorCode: "OCR_QUEUE_STALLED" });
      }
    }
    return recoveredCount;
  };

  const resolveManualTitleGrantTarget = async (input: Pick<AdminManualTitleGrantRequest, "titleKey" | "mapId" | "gameplayRevisionId">): Promise<ManualTitleGrantResolution> => {
    const title = await db.select({ key: titleCatalog.key, label: titleCatalog.label, scope: titleCatalog.scope, lifecycle: titleCatalog.lifecycle })
      .from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
    if (!title) throw new Error("TITLE_NOT_FOUND");
    if (title.scope === "global" && (input.mapId || input.gameplayRevisionId)) throw new Error("GLOBAL_TITLE_CANNOT_HAVE_MAP");
    if (title.scope === "map" && !input.mapId) throw new Error("MAP_TITLE_REQUIRES_MAP");
    const manualChallengeId = `manual:${title.key}`;
    if (!input.mapId) return { title, mapId: null, gameplayRevisionId: null, slot: null, manualChallengeId };

    const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
    if (!map) throw new Error("MAP_NOT_FOUND");
    const revision = await selectGameplayRevision({ mapId: input.mapId, mapVariant: null, gameplayRevisionId: input.gameplayRevisionId, allowHistorical: Boolean(input.gameplayRevisionId) });
    if (!revision) throw new Error(input.gameplayRevisionId ? "GAMEPLAY_REVISION_INVALID" : "GAMEPLAY_REVISION_NOT_FOUND");

    const rule = await db.select({ ruleId: mapTitleRules.id }).from(mapTitleRules)
      .where(and(eq(mapTitleRules.titleKey, title.key), ne(mapTitleRules.status, "archived"))).get();
    const projection = rule ? await resolveMapTitleProjection(rule.ruleId, input.mapId, revision.id, now(), { allowLapsedPioneerWindow: true }) : null;
    if (projection) return { title, mapId: input.mapId, gameplayRevisionId: revision.id, slot: projection.slot, manualChallengeId };

    const titleChallengeRows = await db.select({ challenge: titleChallenges, catalog: titleCatalog }).from(titleChallenges)
      .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
      .where(and(eq(titleChallenges.titleKey, title.key), eq(titleChallenges.scope, "map")));
    for (const row of titleChallengeRows) {
      const challengeProjection = await snapshotTitleChallenge(row.challenge, row.catalog, input.mapId, revision.id);
      if (challengeProjection) return { title, mapId: input.mapId, gameplayRevisionId: revision.id, slot: challengeProjection.slot, manualChallengeId };
    }

    const reward = await db.select({ slot: mapTitleRewards.slot }).from(mapTitleRewards)
      .where(and(eq(mapTitleRewards.mapId, input.mapId), eq(mapTitleRewards.titleKey, title.key))).get();
    if (reward) return { title, mapId: input.mapId, gameplayRevisionId: revision.id, slot: reward.slot, manualChallengeId };
    throw new Error("TITLE_MAP_REWARD_NOT_CONFIGURED");
  };

  const insertDefaultMapTitleRuleAssignment = (revisionId: string, mapId: string, ruleId: string, timestamp: number) => database.prepare(
    "INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, 'map_title_rule', ?, 1, NULL, NULL, NULL, NULL, ?, ?) ON CONFLICT (gameplay_revision_id, challenge_family, challenge_id) DO NOTHING",
  ).bind(`assignment:${revisionId}:map_title_rule:${ruleId}`, revisionId, mapId, ruleId, timestamp, timestamp);

  const getPlayerOwnedSubmission = async (submissionId: string, sessionToken: string) => {
    const current = await getCurrentPortalPlayer(sessionToken);
    if (!current) throw new Error("UNAUTHENTICATED");
    const submission = await db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
    if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
    if (submission.playerAccountId !== current.player.id) throw new Error("SUBMISSION_NOT_FOUND");
    return { player: current, submission };
  };

  // Accuracy feedback is offered only when the submission carries usable OCR
  // evidence. Unsupported/cropped/unusable records already live in the
  // resubmission/manual-review path.
  const ocrFeedbackEligibleStatuses = new Set(["approved", "ready_for_review", "ocr_review_required", "awaiting_player_confirmation"]);

  const applySubmissionFieldCorrections = (response: OcrResponse, corrections: AdminSubmissionReviewRequest["fieldCorrections"]): OcrResponse => {
    const data = { ...response.data };
    const fields = { ...response.fields };
    for (const correction of corrections ?? []) {
      const value = correction.reviewedValue.trim();
      switch (correction.fieldKey) {
        case "map_name": data.map_name = value; break;
        case "difficulty": data.difficulty = value; break;
        case "viewer_player": data.viewer_player = value; break;
        case "challenge_completed": {
          const normalizedValue = value.toLocaleLowerCase();
          if (["true", "完成", "已完成"].includes(normalizedValue)) data.challenge_completed = true;
          else if (["false", "未完成", "未通关"].includes(normalizedValue)) data.challenge_completed = false;
          else throw new Error("SUBMISSION_CORRECTION_INVALID");
          break;
        }
        case "map_variant": {
          const normalizedValue = value.toLocaleLowerCase();
          if (normalizedValue === "classic" || normalizedValue === "经典") data.map_variant = "classic";
          else if (["standard", "default", "none", "正式", "标准", "无"].includes(normalizedValue)) data.map_variant = null;
          else throw new Error("SUBMISSION_CORRECTION_INVALID");
          break;
        }
        case "mode": data.mode = value; break;
        case "version": data.version = value; break;
        case "run_code": data.run_code = value; break;
        case "duration_seconds":
        case "deaths":
        case "skips": {
          if (!/^\d+$/u.test(value)) throw new Error("SUBMISSION_CORRECTION_INVALID");
          data[correction.fieldKey] = Number(value);
          break;
        }
        case "achievement_titles":
          data.achievement_titles = value.split(/[、,，\n]/u).map((title) => title.trim()).filter(Boolean);
          break;
      }
      const corrected = correction.fieldKey === "achievement_titles" ? data.achievement_titles
        : correction.fieldKey === "challenge_completed" ? data.challenge_completed
        : correction.fieldKey === "map_variant" ? data.map_variant
        : data[correction.fieldKey];
      fields[correction.fieldKey] = { ...fields[correction.fieldKey], value: corrected, status: "ok", confidence: 1 };
    }
    return { ...response, data, fields };
  };

  // The match code is the room's shared identity: teammates' Submissions and
  // recorded Verified Runs on the same map/version around the same time carry
  // it, so a code the platform saw near this Submission's timestamp is offered
  // for association instead of forcing a retype. Candidates are read-only
  // suggestions; the reviewer still verifies the value against the screenshot.
  const matchCodeCandidateWindowMs = 3 * 24 * 60 * 60 * 1000;
  const listReviewMatchCodeCandidates = async (row: typeof submissions.$inferSelect, response: OcrResponse): Promise<string[]> => {
    const data = response.data ?? {};
    const evidenceMapName = typeof data.map_name === "string" ? data.map_name.trim() : "";
    const matchingMaps = evidenceMapName ? (await loadActiveMaps()).filter((map) => normalizedOcrLabel(map.name) === normalizedOcrLabel(evidenceMapName)) : [];
    const mapId = matchingMaps.length === 1 ? matchingMaps[0]!.id : row.targetMapId;
    if (!mapId) return [];
    const mapName = matchingMaps[0]?.name ?? (await db.select({ name: maps.name }).from(maps).where(eq(maps.id, mapId)).get())?.name ?? "";
    const gameVersion = typeof data.version === "string" && isWellFormedGameVersion(data.version.trim()) ? data.version.trim() : null;
    const windowStart = row.createdAt - matchCodeCandidateWindowMs;
    const windowEnd = row.createdAt + matchCodeCandidateWindowMs;
    const distanceByCode = new Map<string, number>();
    const collect = (value: unknown, at: number | null | undefined) => {
      if (typeof value !== "string" || at === null || at === undefined) return;
      let code: string;
      try { code = normalizeMatchCode(value); } catch { return; }
      const distance = Math.abs(at - row.createdAt);
      if (distance < (distanceByCode.get(code) ?? Infinity)) distanceByCode.set(code, distance);
    };
    const [runRows, siblingRows] = await Promise.all([
      // A Run's play time lives on its source Submission; acceptance can lag days behind.
      db.select({ code: verifiedRuns.matchCode, at: submissions.createdAt })
        .from(verifiedRuns).innerJoin(submissions, eq(verifiedRuns.sourceSubmissionId, submissions.id))
        .where(and(
          eq(verifiedRuns.mapId, mapId),
          ne(verifiedRuns.sourceSubmissionId, row.id),
          gte(submissions.createdAt, windowStart),
          lte(submissions.createdAt, windowEnd),
          ...(gameVersion ? [eq(verifiedRuns.gameVersion, gameVersion)] : []),
        ))
        .limit(100)
        .all(),
      db.select({
        code: sql<string | null>`json_extract(${ocrResults.responseJson}, '$.data.run_code')`,
        mapName: sql<string | null>`json_extract(${ocrResults.responseJson}, '$.data.map_name')`,
        version: sql<string | null>`json_extract(${ocrResults.responseJson}, '$.data.version')`,
        status: sql<string | null>`json_extract(${ocrResults.responseJson}, '$.fields.run_code.status')`,
        at: submissions.createdAt,
      }).from(ocrResults).innerJoin(submissions, eq(ocrResults.submissionId, submissions.id))
        .where(and(ne(submissions.id, row.id), ne(submissions.status, "rejected"), gte(submissions.createdAt, windowStart), lte(submissions.createdAt, windowEnd)))
        .limit(200)
        .all(),
    ]);
    for (const run of runRows) collect(run.code, run.at);
    if (mapName) for (const sibling of siblingRows) {
      if (sibling.status !== "ok") continue;
      if (normalizedOcrLabel(sibling.mapName) !== normalizedOcrLabel(mapName)) continue;
      if (gameVersion && sibling.version?.trim() !== gameVersion) continue;
      collect(sibling.code, sibling.at);
    }
    return [...distanceByCode.entries()].sort((left, right) => left[1] - right[1]).slice(0, 12).map(([code]) => code);
  };

  // The player-facing accuracy state is just the current mark bound to the
  // latest recognition result; a re-recognition produces a fresh unmarked
  // result id.
  const buildPlayerOcrFeedbackState = async (submissionId: string, result: typeof ocrResults.$inferSelect) => {
    const mark = await db.select({ accuracy: ocrAccuracyFeedback.accuracy }).from(ocrAccuracyFeedback).where(and(eq(ocrAccuracyFeedback.submissionId, submissionId), eq(ocrAccuracyFeedback.ocrResultId, result.id))).get();
    return { ocrResultId: result.id, accuracy: (mark?.accuracy ?? null) as OcrAccuracyMark | null };
  };

  const getCurrentPortalPlayer = (sessionToken: string) => resolvePortalSession(db, sessionToken);

  // Screenshot-set membership rule (#255): the latest stored screenshot of
  // every approved Submission, plus the latest stored screenshot of any
  // Submission whose current OCR result carries an `inaccurate` accuracy mark.
  // A stale mark on an older result does not qualify the screenshot. Members
  // need retrievable evidence (object key, sha256, size, type) and a layout
  // version from the current recognition; anything missing is an automatic
  // exclusion so the gap is auditable on the set.
  type ScreenshotSetCandidate = {
    sourceId: string;
    submissionId: string;
    ocrResultId: string | null;
    mapName: string;
    submissionStatus: string;
    objectKey: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
    layoutVersion: string;
    accuracy: OcrAccuracyMark | null;
  };
  const loadScreenshotSetEligibility = async () => {
    // The candidate rule stays inside SQL as a subquery: binding every
    // candidate Submission id into IN (?, ...) would exceed D1's 100 bound
    // parameters per query once there are more than ~100 candidates.
    const candidateRule = or(
      eq(submissions.status, "approved"),
      inArray(submissions.id, db.select({ submissionId: ocrAccuracyFeedback.submissionId }).from(ocrAccuracyFeedback).where(eq(ocrAccuracyFeedback.accuracy, "inaccurate"))),
    );
    const candidateIds = () => db.select({ id: submissions.id }).from(submissions).where(candidateRule);
    const candidateSubmissions = await db.select({ id: submissions.id, status: submissions.status, mapName: submissions.mapName, createdAt: submissions.createdAt })
      .from(submissions)
      .where(candidateRule)
      .orderBy(asc(submissions.createdAt), asc(submissions.id))
      .all();
    const [attachmentRows, ocrRows, feedbackRows] = await Promise.all([
      db.select().from(attachments).where(and(inArray(attachments.submissionId, candidateIds()), eq(attachments.uploadStatus, "stored"))).all(),
      db.select().from(ocrResults).where(inArray(ocrResults.submissionId, candidateIds())).orderBy(desc(ocrResults.createdAt), desc(ocrResults.id)).all(),
      db.select().from(ocrAccuracyFeedback).where(inArray(ocrAccuracyFeedback.submissionId, candidateIds())).all(),
    ]);
    const latestAttachmentBySubmission = new Map<string, typeof attachments.$inferSelect>();
    for (const row of [...attachmentRows].sort((left, right) => left.createdAt - right.createdAt)) latestAttachmentBySubmission.set(row.submissionId, row);
    const latestOcrBySubmission = new Map<string, typeof ocrResults.$inferSelect>();
    for (const row of ocrRows) if (!latestOcrBySubmission.has(row.submissionId)) latestOcrBySubmission.set(row.submissionId, row);
    const accuracyByResult = new Map(feedbackRows.map((row) => [`${row.submissionId}:${row.ocrResultId}`, row.accuracy as OcrAccuracyMark]));

    const candidates: ScreenshotSetCandidate[] = [];
    const exclusions: Array<{ sourceId: string | null; submissionId: string; reason: string }> = [];
    for (const submission of candidateSubmissions) {
      const result = latestOcrBySubmission.get(submission.id);
      const mark = result ? accuracyByResult.get(`${submission.id}:${result.id}`) ?? null : null;
      if (submission.status !== "approved" && mark !== "inaccurate") continue;
      const attachment = latestAttachmentBySubmission.get(submission.id);
      if (!attachment?.objectKey || !attachment.sha256 || attachment.byteSize === null) {
        exclusions.push({ sourceId: attachment?.id ?? null, submissionId: submission.id, reason: "missing_evidence" });
        continue;
      }
      let layoutVersion: string | null = null;
      if (result?.responseJson) {
        try {
          const response = JSON.parse(result.responseJson) as OcrResponse;
          layoutVersion = response.layout_version ?? response.quality?.layout_version ?? null;
        } catch { /* malformed history is an exclusion, not a crash */ }
      }
      if (!layoutVersion) {
        exclusions.push({ sourceId: attachment.id, submissionId: submission.id, reason: "missing_layout_version" });
        continue;
      }
      candidates.push({
        sourceId: attachment.id,
        submissionId: submission.id,
        ocrResultId: result?.id ?? null,
        mapName: submission.mapName,
        submissionStatus: submission.status,
        objectKey: attachment.objectKey,
        sha256: attachment.sha256,
        mimeType: attachment.contentType,
        sizeBytes: attachment.byteSize,
        layoutVersion,
        accuracy: mark,
      });
    }
    return { candidates, exclusions };
  };

  const masterySubmissionOutcomeStatuses = new Set<VerifiedRunSubmissionOutcomeStatus>(["created", "reused", "ineligible", "conflict", "invalidated"]);
  const masteryConflictFieldSet = new Set<VerifiedRunConflictField>(["match_code", "map", "gameplay_revision", "map_variant", "difficulty", "game_version", "completion_duration", "deaths", "skips", "event_counters"]);

  const parseMasteryOutcomeDetails = (value: string) => {
    try {
      const details = JSON.parse(value) as { reason?: unknown; conflictFields?: unknown };
      return {
        reason: typeof details.reason === "string" ? details.reason : null,
        conflictFields: Array.isArray(details.conflictFields)
          ? details.conflictFields.filter((field): field is VerifiedRunConflictField => typeof field === "string" && masteryConflictFieldSet.has(field as VerifiedRunConflictField))
          : [],
      };
    } catch {
      return { reason: null, conflictFields: [] as VerifiedRunConflictField[] };
    }
  };

  const asVerifiedRunSubmissionOutcome = (row: typeof submissionOutcomes.$inferSelect): VerifiedRunSubmissionOutcome => {
    if (row.outcomeType !== "verified_run" || !masterySubmissionOutcomeStatuses.has(row.status as VerifiedRunSubmissionOutcomeStatus)) throw new Error("SUBMISSION_OUTCOME_DATA_INVALID");
    const details = parseMasteryOutcomeDetails(row.detailsJson);
    return {
      status: row.status as VerifiedRunSubmissionOutcomeStatus,
      verifiedRunId: row.entityId,
      awardedXp: row.awardedXp,
      ...details,
    };
  };

  const loadVerifiedRunSubmissionOutcome = async (submissionId: string) => {
    const row = await db.select().from(submissionOutcomes).where(and(eq(submissionOutcomes.submissionId, submissionId), eq(submissionOutcomes.outcomeKey, "verified_run"))).get();
    return row ? asVerifiedRunSubmissionOutcome(row) : null;
  };

  const loadVerifiedRunSubmissionOutcomes = async (submissionIds: string[]) => {
    if (!submissionIds.length) return new globalThis.Map<string, VerifiedRunSubmissionOutcome>();
    const rows = await db.select().from(submissionOutcomes).where(and(inArray(submissionOutcomes.submissionId, submissionIds), eq(submissionOutcomes.outcomeKey, "verified_run")));
    return new globalThis.Map(rows.map((row) => [row.submissionId, asVerifiedRunSubmissionOutcome(row)]));
  };

  const playerVerifiedRunSubmissionOutcome = (outcome: VerifiedRunSubmissionOutcome) => outcome.status === "conflict"
    ? null
    : { status: outcome.status, awardedXp: outcome.status === "created" ? outcome.awardedXp : 0 };

  const playerVerifiedRunSubmissionOutcomeFields = (outcome: VerifiedRunSubmissionOutcome | null | undefined) => {
    const safeOutcome = outcome ? playerVerifiedRunSubmissionOutcome(outcome) : null;
    return safeOutcome ? { verifiedRunOutcome: safeOutcome } : {};
  };

  const masterySubmissionOutcomeStatement = (submissionId: string, outcome: VerifiedRunSubmissionOutcome) => {
    const timestamp = now();
    return database.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES (?, ?, 'verified_run', 'verified_run', ?, ?, ?, ?, ?, ?) ON CONFLICT(submission_id, outcome_key) DO UPDATE SET status = excluded.status, entity_id = excluded.entity_id, awarded_xp = excluded.awarded_xp, details_json = excluded.details_json, updated_at = excluded.updated_at")
      .bind(crypto.randomUUID(), submissionId, outcome.status, outcome.verifiedRunId, outcome.awardedXp, JSON.stringify({ reason: outcome.reason, conflictFields: outcome.conflictFields }), timestamp, timestamp);
  };

  const approvedSubmissionOutcomeStatement = (input: {
    submissionId: string;
    outcomeKey: string;
    outcomeType: "title_grant" | "challenge";
    status: "created" | "reused";
    entityId: string | null;
    details: Record<string, unknown>;
  }) => {
    const timestamp = now();
    return database.prepare("INSERT OR IGNORE INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, 0, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved')")
      .bind(crypto.randomUUID(), input.submissionId, input.outcomeKey, input.outcomeType, input.status, input.entityId, JSON.stringify(input.details), timestamp, timestamp, input.submissionId);
  };

  const existingMasteryOutcome = (outcome: VerifiedRunSubmissionOutcome) => ({ ...outcome, conflictFields: [...outcome.conflictFields] });

  const requiredMasteryMapVariant = async (row: typeof submissions.$inferSelect): Promise<"classic" | null> => {
    if (row.ruleSnapshotJson) {
      try {
        const snapshot = JSON.parse(row.ruleSnapshotJson) as { mapVariant?: unknown };
        if (Object.hasOwn(snapshot, "mapVariant")) return snapshot.mapVariant === "classic" ? "classic" : null;
      } catch {
        // Older malformed snapshots continue through the authoritative challenge lookup below.
      }
    }
    if (row.challengeType === "title_achievement" && row.challengeId) {
      const challenge = await db.select({ mapVariant: titleChallenges.mapVariant }).from(titleChallenges).where(eq(titleChallenges.id, row.challengeId)).get();
      return challenge?.mapVariant === "classic" ? "classic" : null;
    }
    if (!row.challengeId) return null;
    if (row.targetMapId) {
      const projection = await resolveLegacyProjection(row.challengeId, row.targetMapId, snapshotGameplayRevisionId(row), row.createdAt);
      if (projection) return projection.mapVariant;
    }
    const challenge = await db.select({ type: achievementChallenges.type }).from(achievementChallenges).where(eq(achievementChallenges.id, row.challengeId)).get();
    return challenge?.type === "classic_completion" ? "classic" : null;
  };

  const snapshotGameplayRevisionId = (row: typeof submissions.$inferSelect) => {
    if (row.gameplayRevisionId) return row.gameplayRevisionId;
    if (!row.ruleSnapshotJson) return null;
    try {
      const snapshot = JSON.parse(row.ruleSnapshotJson) as { gameplayRevisionId?: unknown };
      return typeof snapshot.gameplayRevisionId === "string" && snapshot.gameplayRevisionId.trim()
        ? snapshot.gameplayRevisionId.trim()
        : null;
    } catch {
      return null;
    }
  };

  const resolveMasteryGameplayRevision = async (input: { mapId: string; mapVariant: "classic" | null; mode: string | null; gameplayRevisionId: string | null }) => {
    if (input.gameplayRevisionId) {
      const revision = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.id, input.gameplayRevisionId)).get();
      if (!revision || revision.mapId !== input.mapId) return null;
      if ((revision.legacyMapVariant ?? null) !== input.mapVariant || (revision.mode ?? null) !== input.mode) return null;
      return revision;
    }
    if (input.mode) {
      return input.mapVariant === null
        ? await db.select().from(gameplayRevisions).where(and(
          eq(gameplayRevisions.mapId, input.mapId),
          eq(gameplayRevisions.mode, input.mode),
          eq(gameplayRevisions.lifecycle, "selectable"),
        )).get()
        : undefined;
    }
    return input.mapVariant === "classic"
      ? await db.select().from(gameplayRevisions).where(and(
        eq(gameplayRevisions.mapId, input.mapId),
        eq(gameplayRevisions.legacyMapVariant, "classic"),
        eq(gameplayRevisions.lifecycle, "selectable"),
      )).get()
      : await db.select().from(gameplayRevisions).where(and(
        eq(gameplayRevisions.mapId, input.mapId),
        eq(gameplayRevisions.lifecycle, "default"),
      )).get();
  };

  const loadActiveMaps = () => platformCache.cached("catalog", "active-maps", () => db.select().from(maps).where(eq(maps.status, "active")));

  type VerifiedRunRecordPlan = {
    result: RecordVerifiedRunResult;
    statements: D1PreparedStatement[];
    row: typeof verifiedRuns.$inferSelect | null;
    candidate: ReturnType<typeof prepareVerifiedRun>;
    superseded?: { runId: string; conflictFields: VerifiedRunConflictField[] };
  };

  // supersedeConflicting is a maintainer's reviewed approval: a recorded Run from another
  // Submission whose facts differ is invalidated (audited) and this Submission records the Run.
  const planVerifiedRunRecord = async (input: VerifiedRunInput, rejectConcurrentInsert = false, restampRevision = false, supersedeConflicting = false): Promise<VerifiedRunRecordPlan> => {
    const candidate = prepareVerifiedRun(input, now());
    const source = await db.select({ playerAccountId: submissions.playerAccountId, gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions)
      .where(eq(submissions.id, candidate.sourceSubmissionId)).get();
    if (!source) throw new Error("VERIFIED_RUN_SUBMISSION_NOT_FOUND");
    if (source.playerAccountId !== candidate.playerAccountId) throw new Error("VERIFIED_RUN_SUBMISSION_PLAYER_MISMATCH");
    if (!restampRevision && source.gameplayRevisionId && source.gameplayRevisionId !== candidate.gameplayRevisionId) throw new Error("VERIFIED_RUN_SUBMISSION_REVISION_MISMATCH");
    const [player, map, revision] = await Promise.all([
      db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, candidate.playerAccountId)).get(),
      db.select({ id: maps.id }).from(maps).where(eq(maps.id, candidate.mapId)).get(),
      db.select({ id: gameplayRevisions.id, mapId: gameplayRevisions.mapId, legacyMapVariant: gameplayRevisions.legacyMapVariant }).from(gameplayRevisions).where(eq(gameplayRevisions.id, candidate.gameplayRevisionId)).get(),
    ]);
    if (!player) throw new Error("VERIFIED_RUN_PLAYER_NOT_FOUND");
    if (!map) throw new Error("VERIFIED_RUN_MAP_NOT_FOUND");
    if (!revision || revision.mapId !== candidate.mapId || (revision.legacyMapVariant ?? null) !== candidate.mapVariant) throw new Error("VERIFIED_RUN_GAMEPLAY_REVISION_NOT_FOUND");

    const bySource = await db.select().from(verifiedRuns).where(eq(verifiedRuns.sourceSubmissionId, candidate.sourceSubmissionId)).get();
    const xpContext = await loadVerifiedRunXpContext(db, { playerAccountId: candidate.playerAccountId, mapId: candidate.mapId, difficulty: candidate.difficulty, acceptedAt: candidate.acceptedAt, exceptRunId: bySource?.id });
    const awardFor = () => calculateVerifiedRunXpV3({ difficulty: candidate.difficulty, achievementCount: candidate.achievementCount, ...xpContext });
    const keyMatch = and(
      eq(verifiedRuns.playerAccountId, candidate.playerAccountId),
      eq(verifiedRuns.mapId, candidate.mapId),
      eq(verifiedRuns.gameVersion, candidate.gameVersion),
      eq(verifiedRuns.matchCode, candidate.matchCode),
    );
    const invalidateRun = (row: typeof verifiedRuns.$inferSelect, reason: string) => prepareVerifiedRunTransitionStatements({
      row,
      actor: { actorType: "service", actorId: candidate.acceptanceSource },
      nextStatus: "invalidated",
      reason,
    });
    // Rewrites the Submission's own Run in place from the candidate (restoring it as active); `before`
    // runs first in the same batch, so it can free the match code or invalidate the Run being rewritten.
    const rewriteOwnRun = (own: typeof verifiedRuns.$inferSelect, before: D1PreparedStatement[], superseded?: VerifiedRunRecordPlan["superseded"]): VerifiedRunRecordPlan => {
      const award = awardFor();
      const restoredAt = now();
      const run: VerifiedRun = {
        ...asVerifiedRun(own),
        mapId: candidate.mapId,
        gameplayRevisionId: candidate.gameplayRevisionId,
        mapVariant: candidate.mapVariant,
        difficulty: candidate.difficulty,
        gameVersion: candidate.gameVersion,
        matchCode: candidate.matchCode,
        completionDurationSeconds: candidate.completionDurationSeconds,
        deaths: candidate.deaths,
        skips: candidate.skips,
        eventCounters: candidate.eventCounters,
        acceptanceSource: candidate.acceptanceSource,
        acceptedAt: candidate.acceptedAt,
        status: "active",
        invalidatedAt: null,
        invalidatedBy: null,
        invalidationReason: null,
        xpRuleVersion: award.snapshot.ruleVersion,
        xpInputSnapshot: award.snapshot,
        awardedXp: award.awardedXp,
      };
      return {
        result: { outcome: "created", run },
        ...(superseded ? { superseded } : {}),
        statements: [
          ...before,
          database.prepare("UPDATE mastery_runs SET map_id = ?, gameplay_revision_id = ?, map_variant = ?, difficulty = ?, game_version = ?, run_code = ?, completion_duration_seconds = ?, deaths = ?, skips = ?, event_counters_json = ?, acceptance_source = ?, accepted_at = ?, status = 'active', invalidated_at = NULL, invalidated_by = NULL, invalidation_reason = NULL, xp_rule_version = ?, xp_input_snapshot_json = ?, awarded_xp = ? WHERE id = ? AND status = 'invalidated'")
            .bind(run.mapId, run.gameplayRevisionId, run.mapVariant, run.difficulty, run.gameVersion, run.matchCode, run.completionDurationSeconds, run.deaths, run.skips, JSON.stringify(run.eventCounters), run.acceptanceSource, run.acceptedAt, run.xpRuleVersion, JSON.stringify(run.xpInputSnapshot), run.awardedXp, run.runId),
          database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) SELECT ?, ?, 'restored', 'service', ?, NULL, ? WHERE changes() = 1").bind(crypto.randomUUID(), run.runId, candidate.acceptanceSource, restoredAt),
        ],
        row: null,
        candidate,
      };
    };

    // A reviewed approval is the maintainer's decision about whichever other Run holds this match code.
    const holder = supersedeConflicting
      ? await db.select().from(verifiedRuns).where(and(keyMatch, eq(verifiedRuns.status, "active"), ...(bySource ? [ne(verifiedRuns.id, bySource.id)] : []))).get()
      : undefined;
    let superseded: VerifiedRunRecordPlan["superseded"];
    let supersedeStatements: D1PreparedStatement[] = [];
    if (holder) {
      const holderFields = masteryConflictFields(asVerifiedRun(holder), candidate);
      const retireOwn = bySource?.status === "active" ? invalidateRun(bySource, `Superseded by active Run ${holder.id}`) : [];
      if (!holderFields.length) {
        // A duplicate of the active Run: reuse it, and retire the Submission's own stale Run so it earns nothing twice.
        return {
          result: { outcome: "reused", run: asVerifiedRun(holder) },
          ...(bySource ? { superseded: { runId: bySource.id, conflictFields: [] } } : {}),
          statements: retireOwn,
          row: holder,
          candidate,
        };
      }
      const displaceHolder = invalidateRun(holder, `Superseded by reviewed Submission ${candidate.sourceSubmissionId} (${holderFields.join(", ")})`);
      superseded = { runId: holder.id, conflictFields: holderFields };
      if (bySource) return rewriteOwnRun(bySource, [...displaceHolder, ...retireOwn], superseded);
      supersedeStatements = displaceHolder;
    }
    const existing = holder ? undefined : bySource ?? await db.select().from(verifiedRuns).where(keyMatch).get();
    const reopened = existing?.status === "invalidated" && existing.invalidationReason === submissionReopenedReason;
    // A reviewed approval of the Submission that already owns an active Run with differing facts
    // (e.g. recorded before the reviewer filled deaths and skips) rewrites that Run the same way.
    const ownConflictFields = existing && existing === bySource && supersedeConflicting && existing.status === "active" ? masteryConflictFields(asVerifiedRun(existing), candidate) : [];
    if (existing && existing === bySource && (reopened || ownConflictFields.length)) {
      // The maintainer reopened this approved submission and has now re-approved it with
      // corrected evidence: the same run is restored and rewritten from that evidence.
      return rewriteOwnRun(
        existing,
        ownConflictFields.length ? invalidateRun(existing, `Rewritten by reviewed approval (${ownConflictFields.join(", ")})`) : [],
        ownConflictFields.length ? { runId: existing.id, conflictFields: ownConflictFields } : undefined,
      );
    }
    if (existing) {
      const run = asVerifiedRun(existing);
      const conflictFields = masteryConflictFields(run, candidate);
      if (!(supersedeConflicting && conflictFields.length && existing.sourceSubmissionId !== candidate.sourceSubmissionId)) {
        return {
          result: conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run },
          statements: [],
          row: existing,
          candidate,
        };
      }
      superseded = { runId: existing.id, conflictFields };
    }

    const award = awardFor();
    const runId = crypto.randomUUID();
    const run: VerifiedRun = {
      runId,
      playerAccountId: candidate.playerAccountId,
      sourceSubmissionId: candidate.sourceSubmissionId,
      mapId: candidate.mapId,
      gameplayRevisionId: candidate.gameplayRevisionId,
      mapVariant: candidate.mapVariant,
      difficulty: candidate.difficulty,
      gameVersion: candidate.gameVersion,
      matchCode: candidate.matchCode,
      completionDurationSeconds: candidate.completionDurationSeconds,
      deaths: candidate.deaths,
      skips: candidate.skips,
      eventCounters: candidate.eventCounters,
      acceptanceSource: candidate.acceptanceSource,
      acceptedAt: candidate.acceptedAt,
      status: "active",
      invalidatedAt: null,
      invalidatedBy: null,
      invalidationReason: null,
      xpRuleVersion: award.snapshot.ruleVersion,
      xpInputSnapshot: award.snapshot,
      awardedXp: award.awardedXp,
    };
    return {
      result: { outcome: "created", run },
      ...(superseded ? { superseded } : {}),
      statements: [
        ...supersedeStatements,
        database.prepare(`${rejectConcurrentInsert ? "INSERT" : "INSERT OR IGNORE"} INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`).bind(runId, candidate.playerAccountId, candidate.sourceSubmissionId, candidate.mapId, candidate.gameplayRevisionId, candidate.mapVariant, candidate.difficulty, candidate.gameVersion, candidate.matchCode, candidate.completionDurationSeconds, candidate.deaths, candidate.skips, JSON.stringify(candidate.eventCounters), candidate.acceptanceSource, candidate.acceptedAt, award.snapshot.ruleVersion, JSON.stringify(award.snapshot), award.awardedXp, candidate.acceptedAt),
        database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) SELECT ?, ?, 'accepted', 'service', ?, NULL, ? WHERE EXISTS (SELECT 1 FROM mastery_runs WHERE id = ?)").bind(crypto.randomUUID(), runId, candidate.acceptanceSource, candidate.acceptedAt, runId),
      ],
      row: null,
      candidate,
    };
  };

  type VerifiedRunSubmissionPlan = {
    outcome: VerifiedRunSubmissionOutcome;
    statements: D1PreparedStatement[];
    recorded: boolean;
    recordInput?: VerifiedRunInput;
    superseded?: { runId: string; conflictFields: VerifiedRunConflictField[] };
  };

  const planVerifiedRunSubmissionOutcome = async (
    row: typeof submissions.$inferSelect,
    response: OcrResponse,
    acceptanceSource: "submission_automatic" | "submission_review",
    humanConfirmed = false,
    rejectConcurrentInsert = false,
    achievementCount = 0,
  ): Promise<VerifiedRunSubmissionPlan> => {
    const plan = (outcome: VerifiedRunSubmissionOutcome, statements: D1PreparedStatement[] = [], recorded = false, recordInput?: VerifiedRunInput, superseded?: VerifiedRunSubmissionPlan["superseded"]): VerifiedRunSubmissionPlan => ({ outcome, statements, recorded, ...(recordInput ? { recordInput } : {}), ...(superseded ? { superseded } : {}) });
    const existing = await loadVerifiedRunSubmissionOutcome(row.id);
    const evidence = assessVerifiedRunOcrEvidence(response, masteryEvidenceCompatibility, humanConfirmed);
    if (evidence.outcome === "ineligible") {
      if (existing && ["created", "reused", "invalidated"].includes(existing.status)) {
        const outcome = existingMasteryOutcome(existing);
        return plan(outcome, [], outcome.status === "created" || outcome.status === "reused");
      }
      return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: evidence.reason, conflictFields: [] });
    }

    const requiredMapVariant = await requiredMasteryMapVariant(row);
    if (requiredMapVariant === "classic" && evidence.mapVariant !== requiredMapVariant) {
      return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "required_map_variant_mismatch", conflictFields: [] });
    }

    const owner = await db.select({ playerAccountId: playerAccounts.id }).from(playerAccounts)
      .where(and(eq(playerAccounts.id, row.playerAccountId), eq(playerAccounts.status, "active"))).get();
    if (!owner) {
      if (existing && ["created", "reused", "invalidated"].includes(existing.status)) {
        const outcome = existingMasteryOutcome(existing);
        return plan(outcome, [], outcome.status === "created" || outcome.status === "reused");
      }
      return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "player_not_active", conflictFields: [] });
    }
    const matchingMaps = (await loadActiveMaps())
      .filter((map) => normalizedOcrLabel(map.name) === normalizedOcrLabel(evidence.mapName));
    if (matchingMaps.length !== 1) return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: matchingMaps.length ? "ambiguous_map" : "canonical_map_not_found", conflictFields: [] });
    if (row.targetMapId && row.targetMapId !== matchingMaps[0].id) return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "submission_map_mismatch", conflictFields: [] });

    const resolveRevision = (gameplayRevisionId: string | null) => resolveMasteryGameplayRevision({
      mapId: matchingMaps[0].id,
      mapVariant: evidence.mapVariant,
      mode: evidence.mode,
      gameplayRevisionId,
    });
    let revision = await resolveRevision(snapshotGameplayRevisionId(row));
    // A revision stamped on an untargeted submission that is still in review was only a provisional read
    // (e.g. taken before the mode was configured or corrected); the reviewed evidence decides instead.
    const restamp = !revision && Boolean(row.gameplayRevisionId) && !row.targetMapId && !row.ruleSnapshotJson && row.status !== "approved";
    if (restamp) revision = await resolveRevision(null);
    if (!revision) return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "gameplay_revision_not_found", conflictFields: [] });
    const currentRevision = await db.select({ gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions).where(eq(submissions.id, row.id)).get();
    if (!restamp && currentRevision?.gameplayRevisionId && currentRevision.gameplayRevisionId !== revision.id) return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "submission_revision_mismatch", conflictFields: [] });

    const recordInput: VerifiedRunInput = {
      playerAccountId: owner.playerAccountId,
      sourceSubmissionId: row.id,
      mapId: matchingMaps[0].id,
      gameplayRevisionId: revision.id,
      mapVariant: evidence.mapVariant,
      difficulty: evidence.difficulty,
      gameVersion: evidence.gameVersion,
      matchCode: evidence.matchCode,
      completionDurationSeconds: evidence.completionDurationSeconds,
      deaths: evidence.deaths,
      skips: evidence.skips,
      eventCounters: {},
      acceptanceSource,
      achievementCount,
    };
    const recorded = await planVerifiedRunRecord(recordInput, rejectConcurrentInsert, restamp, humanConfirmed && acceptanceSource === "submission_review");
    const statements = [
      ...(restamp ? [database.prepare("UPDATE submissions SET gameplay_revision_id = ? WHERE id = ?").bind(revision.id, row.id)]
        : !currentRevision?.gameplayRevisionId ? [database.prepare("UPDATE submissions SET gameplay_revision_id = ? WHERE id = ? AND gameplay_revision_id IS NULL").bind(revision.id, row.id)] : []),
      ...recorded.statements,
    ];
    if (recorded.result.outcome === "conflict") {
      return plan({ status: "conflict", verifiedRunId: recorded.result.run.runId, awardedXp: 0, reason: "conflicting_run_code_evidence", conflictFields: recorded.result.conflictFields }, statements);
    }
    if (recorded.result.run.status === "invalidated") {
      if (existing?.status === "invalidated" && recorded.result.run.sourceSubmissionId === row.id) {
        const runRow = recorded.row;
        if (!runRow) throw new Error("VERIFIED_RUN_NOT_FOUND");
        const activeDuplicate = await db.select({ id: verifiedRuns.id }).from(verifiedRuns).where(and(
          eq(verifiedRuns.playerAccountId, runRow.playerAccountId),
          eq(verifiedRuns.mapId, runRow.mapId),
          eq(verifiedRuns.gameVersion, runRow.gameVersion),
          eq(verifiedRuns.matchCode, runRow.matchCode),
          eq(verifiedRuns.status, "active"),
          ne(verifiedRuns.id, runRow.id),
        )).get();
        if (activeDuplicate) throw new Error("VERIFIED_RUN_MATCH_CODE_CONFLICT");
        return plan({ status: "created", verifiedRunId: recorded.result.run.runId, awardedXp: recorded.result.run.awardedXp, reason: null, conflictFields: [] }, [
          ...statements,
          ...prepareVerifiedRunTransitionStatements({ row: runRow, actor: { actorType: "service", actorId: acceptanceSource }, nextStatus: "active", reason: "OCR evidence revalidated" }),
        ]);
      }
      return plan({ status: "invalidated", verifiedRunId: recorded.result.run.runId, awardedXp: 0, reason: existing?.reason ?? "mastery_run_invalidated", conflictFields: [] }, statements);
    }

    const sourceOwnsRun = recorded.result.run.sourceSubmissionId === row.id;
    const status: VerifiedRunSubmissionOutcomeStatus = recorded.result.outcome === "created" || sourceOwnsRun ? "created" : "reused";
    return plan({
      status,
      verifiedRunId: recorded.result.run.runId,
      awardedXp: status === "created" ? recorded.result.run.awardedXp : 0,
      reason: status === "reused" ? "same_player_run_code" : null,
      conflictFields: [],
    }, statements, recorded.statements.length === 0, recordInput, recorded.superseded);
  };

  const resolveVerifiedRunSubmissionOutcome = async (
    row: typeof submissions.$inferSelect,
    response: OcrResponse,
    acceptanceSource: "submission_automatic" | "submission_review",
    humanConfirmed = false,
    achievementCount = 0,
  ): Promise<VerifiedRunSubmissionOutcome> => {
    const planned = await planVerifiedRunSubmissionOutcome(row, response, acceptanceSource, humanConfirmed, false, achievementCount);
    if (planned.statements.length) await database.batch(planned.statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    if (!planned.recordInput) {
      // A plan can revalidate an invalidated run in place; that path bypasses
      // recordVerifiedRun, so reconcile progress Challenges here as well.
      if (planned.outcome.verifiedRunId && (planned.outcome.status === "created" || planned.outcome.status === "reused")) {
        await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [planned.outcome.verifiedRunId], actorId: acceptanceSource });
      }
      return planned.outcome;
    }
    const recorded = await recordVerifiedRun(planned.recordInput);
    if (recorded.outcome === "conflict") return { status: "conflict", verifiedRunId: recorded.run.runId, awardedXp: 0, reason: "conflicting_run_code_evidence", conflictFields: recorded.conflictFields };
    if (recorded.run.status === "invalidated") return { status: "invalidated", verifiedRunId: recorded.run.runId, awardedXp: 0, reason: planned.outcome.reason ?? "mastery_run_invalidated", conflictFields: [] };
    const status: VerifiedRunSubmissionOutcomeStatus = recorded.outcome === "created" || recorded.run.sourceSubmissionId === row.id ? "created" : "reused";
    return { status, verifiedRunId: recorded.run.runId, awardedXp: status === "created" ? recorded.run.awardedXp : 0, reason: status === "reused" ? "same_player_run_code" : null, conflictFields: [] };
  };

  const resolveAutoMatchGameplayRevisionId = async (row: typeof submissions.$inferSelect, response: OcrResponse) => {
    const mapName = typeof response.data?.map_name === "string" ? response.data.map_name.trim() : "";
    const rawMapVariant = typeof response.data?.map_variant === "string" ? response.data.map_variant.trim() : "";
    if (!mapName || (rawMapVariant && rawMapVariant !== "classic")) return null;
    const matchingMaps = (await loadActiveMaps())
      .filter((map) => normalizedOcrLabel(map.name) === normalizedOcrLabel(mapName));
    if (matchingMaps.length !== 1 || (row.targetMapId && row.targetMapId !== matchingMaps[0]?.id)) return null;
    const mapVariant = rawMapVariant === "classic" ? "classic" : await requiredMasteryMapVariant(row);
    const revision = await resolveMasteryGameplayRevision({
      mapId: matchingMaps[0]!.id,
      mapVariant,
      mode: standaloneOcrMode(response),
      gameplayRevisionId: snapshotGameplayRevisionId(row),
    });
    return revision?.id ?? null;
  };

  type AdminSubmissionChallenge =
    | { family: "map"; name: string; mapName: string; difficulty: string | null; kind?: "difficulty_completion" | "pioneer" | "classic_completion" | "map_title_achievement"; mapVariant?: "classic" }
    | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string; mapVariant?: "classic" };

  const countPendingSubmissionsByPlayer = async (playerAccountIds: string[]) => {
    if (!playerAccountIds.length) return new Map<string, number>();
    const rows = await db.select({ playerAccountId: submissions.playerAccountId, total: count() }).from(submissions)
      .where(and(inArray(submissions.playerAccountId, playerAccountIds), inArray(submissions.status, ["ready_for_review", "ocr_review_required"])))
      .groupBy(submissions.playerAccountId);
    return new Map(rows.map((row) => [row.playerAccountId, row.total]));
  };

  const resolveAdminSubmissionDetails = async (submissionRows: Array<typeof submissions.$inferSelect>) => {
    const submissionIds = submissionRows.map((row) => row.id);
    const allSelectionRows = submissionRows.filter((row) => row.challengeId).map((row) => ({
      id: `legacy:${row.id}`, submissionId: row.id, position: 0, challengeType: row.challengeType,
      challengeId: row.challengeId!, targetMapId: row.targetMapId, gameplayRevisionId: row.gameplayRevisionId,
      mapName: row.mapName, difficulty: row.difficulty, ruleSnapshotJson: row.ruleSnapshotJson,
    }));
    const mapChallengeIds = allSelectionRows.filter((selection) => selection.challengeType !== "title_achievement" && selection.challengeId).map((selection) => selection.challengeId);
    const titleChallengeIds = allSelectionRows.filter((selection) => selection.challengeType === "title_achievement" && selection.challengeId).map((selection) => selection.challengeId);
    const snapshots = allSelectionRows.flatMap((selection) => {
      if (!selection.ruleSnapshotJson || !selection.challengeId) return [];
      try { return [{ challengeId: selection.challengeId, snapshot: JSON.parse(selection.ruleSnapshotJson) as MapTitleRuleSnapshot }]; } catch { return []; }
    });
    const snapshotTitleKeys = [...new Set(snapshots.map(({ snapshot }) => snapshot.titleKey))];
    const playerAccountIds = [...new Set(submissionRows.map((row) => row.playerAccountId))];
    const [mapRows, titleRows, snapshotTitleRows, ocrRows, spotCheckRows, playerRows, verifiedRunOutcomes, reviewRows, grantRows, accuracyRows] = await Promise.all([
      mapChallengeIds.length ? db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(inArray(achievementChallenges.id, mapChallengeIds)) : [],
      titleChallengeIds.length ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(inArray(titleChallenges.id, titleChallengeIds)) : [],
      snapshotTitleKeys.length ? db.select().from(titleCatalog).where(inArray(titleCatalog.key, snapshotTitleKeys)) : [],
      // The existing submission/created index traverses timestamp ties by
      // descending rowid. Keep that winner when fetching one payload per item.
      submissionIds.length ? db.select().from(ocrResults).where(sql`${ocrResults.id} IN (
        SELECT (SELECT latest.id FROM ocr_results AS latest
          WHERE latest.submission_id = requested_submission.value
          ORDER BY latest.created_at DESC, latest.rowid DESC LIMIT 1)
        FROM json_each(${JSON.stringify(submissionIds)}) AS requested_submission
      )`) : [],
      submissionIds.length ? db.select().from(submissionSpotChecks).where(inArray(submissionSpotChecks.submissionId, submissionIds)) : [],
      playerAccountIds.length ? db.select({ id: playerAccounts.id }).from(playerAccounts).where(inArray(playerAccounts.id, playerAccountIds)) : [],
      loadVerifiedRunSubmissionOutcomes(submissionIds),
      submissionIds.length ? db.select().from(submissionReviews).where(sql`${submissionReviews.id} IN (
        SELECT (SELECT latest.id FROM submission_reviews AS latest
          WHERE latest.submission_id = requested_submission.value
          ORDER BY latest.created_at DESC, latest.rowid DESC LIMIT 1)
        FROM json_each(${JSON.stringify(submissionIds)}) AS requested_submission
      )`) : [],
      submissionIds.length ? db.select({ submissionId: playerTitleGrants.sourceId, grantId: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey, titleName: titleCatalog.label }).from(playerTitleGrants).innerJoin(titleCatalog, eq(titleCatalog.key, playerTitleGrants.titleKey)).where(and(inArray(playerTitleGrants.sourceType, ["automatic", "submission"]), inArray(playerTitleGrants.sourceId, submissionIds), eq(playerTitleGrants.status, "active"))).orderBy(playerTitleGrants.grantedAt, playerTitleGrants.id) : [],
      submissionIds.length ? db.select().from(ocrAccuracyFeedback).where(inArray(ocrAccuracyFeedback.submissionId, submissionIds)) : [],
    ]);
    const challenges = new Map<string, AdminSubmissionChallenge>();
    const latestOcr = new Map<string, typeof ocrResults.$inferSelect>();
    for (const { challenge, map } of mapRows) {
      const value = { family: "map" as const, name: challenge.name, mapName: map.name, difficulty: challenge.difficulty ?? "", ...(challenge.type === "classic_completion" ? { mapVariant: "classic" as const } : {}) };
      challenges.set(challenge.id, value);
    }
    for (const { challenge, title } of titleRows) challenges.set(challenge.id, { family: "achievement", titleName: title.label, category: challenge.categoryOverride ?? title.category, condition: challenge.condition, evidenceRule: challenge.evidenceRule, ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}) });
    const snapshotTitlesByKey = new Map(snapshotTitleRows.map((title) => [title.key, title]));
    for (const { challengeId, snapshot } of snapshots) {
      const title = snapshotTitlesByKey.get(snapshot.titleKey);
      if (title) challenges.set(challengeId, { family: "achievement", titleName: title.label, category: title.category, condition: snapshot.condition, evidenceRule: snapshot.evidenceRule, ...(snapshot.mapVariant ? { mapVariant: snapshot.mapVariant } : {}) });
    }
    for (const result of ocrRows) if (!latestOcr.has(result.submissionId)) latestOcr.set(result.submissionId, result);
    // A mark binds to one OCR result, so it is only surfaced while that result
    // remains the latest recognition for the submission.
    const ocrAccuracy = new Map(accuracyRows.map((row) => [`${row.submissionId}:${row.ocrResultId}`, row.accuracy]));
    const activeTitleGrants = new Map<string, Array<{ grantId: string; titleKey: string; titleName: string }>>();
    for (const { submissionId, ...grant } of grantRows) activeTitleGrants.set(submissionId, [...(activeTitleGrants.get(submissionId) ?? []), grant]);
    return { activeTitleGrants, challenges, latestOcr, ocrAccuracy, spotChecks: new Map(spotCheckRows.map((spotCheck) => [spotCheck.submissionId, spotCheck])), latestReviews: new Map(reviewRows.map((review) => [review.submissionId, review])), playerAccountIds: new Set(playerRows.map((player) => player.id)), verifiedRunOutcomes };
  };

  const adminSubmissionReview = (review: typeof submissionReviews.$inferSelect | undefined) => review
    ? { decision: review.decision as "approved" | "rejected" | "resubmission_required", automatic: review.reviewer.startsWith("system:"), reason: review.reason, reviewedAt: review.createdAt }
    : null;

  const asAdminSubmission = (row: typeof submissions.$inferSelect, details: Awaited<ReturnType<typeof resolveAdminSubmissionDetails>>) => {
    const ocr = details.latestOcr.get(row.id);
    const parseJsonObject = (value: string | null | undefined): Record<string, unknown> | null => {
      if (!value) return null;
      try { return JSON.parse(value) as Record<string, unknown>; } catch { return null; }
    };
    const match = parseJsonObject(ocr?.matchJson);
    return {
      submissionId: row.id,
      status: row.status as never,
      challengeId: row.challengeId ?? "",
      gameplayRevisionId: row.gameplayRevisionId,
      challenge: row.challengeId ? details.challenges.get(row.challengeId) ?? null : null,
      mapName: row.mapName,
      difficulty: row.difficulty ?? "",
      playerAccountId: details.playerAccountIds.has(row.playerAccountId) ? row.playerAccountId : "",
      playerName: row.playerName ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ocrStatus: (ocr?.status ?? (row.status === "ocr_pending" ? "pending" : "not_started")) as never,
      ocrAttempt: ocr?.attempt ?? null,
      ocrErrorCode: ocr?.errorCode ?? null,
      ocrResultId: ocr?.id ?? null,
      ocrAccuracy: (ocr ? details.ocrAccuracy.get(`${row.id}:${ocr.id}`) ?? null : null) as OcrAccuracyMark | null,
      ocr: parseJsonObject(ocr?.responseJson),
      match,
      reason: row.reviewReason,
      evidenceUrl: null,
      spotCheck: details.spotChecks.get(row.id) ? { status: details.spotChecks.get(row.id)!.status as "pending" | "confirmed" | "revoked", sampledAt: details.spotChecks.get(row.id)!.sampledAt, resolvedAt: details.spotChecks.get(row.id)!.resolvedAt, reviewer: details.spotChecks.get(row.id)!.reviewer, reason: details.spotChecks.get(row.id)!.reason } : null,
      review: adminSubmissionReview(details.latestReviews.get(row.id)),
      activeTitleGrants: details.activeTitleGrants.get(row.id) ?? [],
      ...(details.verifiedRunOutcomes.get(row.id) ? { verifiedRunOutcome: details.verifiedRunOutcomes.get(row.id)! } : {}),
    };
  };

  const loadAdminSubmission = async (row: typeof submissions.$inferSelect) => {
    const [details, attachment] = await Promise.all([
      resolveAdminSubmissionDetails([row]),
      db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, row.id)).orderBy(desc(attachments.createdAt)).limit(1).get(),
    ]);
    return { ...asAdminSubmission(row, details), evidenceUrl: publicEvidenceUrl(attachment?.objectKey) };
  };

  const {
    batchPlanCanonicalChallenges,
    materializingCanonicalChallenges,
    planningCanonicalChallenges,
    loadCanonicalChallenges,
  } = createCanonicalChallengeServices(db);

  const assertProgressRuleTargets = async (rule: { mapIds?: string[]; mode?: string }) => {
    if (rule.mapIds) {
      const requiredMapIds = [...new Set(rule.mapIds)];
      const requiredMaps = await db.select({ id: maps.id, status: maps.status }).from(maps).where(inArray(maps.id, requiredMapIds));
      if (requiredMaps.length !== requiredMapIds.length) throw new Error("MAP_NOT_FOUND");
      if (requiredMaps.some((map) => map.status !== "active")) throw new Error("MAP_NOT_ACTIVE");
    }
    const mode = normalizeGameMode(rule.mode);
    if (mode && !await db.select({ mode: standaloneModes.mode }).from(standaloneModes).where(eq(standaloneModes.mode, mode)).get()) throw new Error("STANDALONE_MODE_NOT_FOUND");
  };

  // The maps a standalone mode currently plays are its selectable Gameplay Revisions.
  const standaloneModeMapIds = async (modes: readonly string[]) => {
    const rows = modes.length ? await db.select({ mode: gameplayRevisions.mode, mapId: gameplayRevisions.mapId }).from(gameplayRevisions)
      .where(and(inArray(gameplayRevisions.mode, [...modes]), eq(gameplayRevisions.lifecycle, "selectable"))) : [];
    return new globalThis.Map(modes.map((mode) => [mode, rows.filter((row) => row.mode === mode).map((row) => row.mapId).sort()]));
  };
  // A rule without its own map list follows every map of its standalone mode.
  const progressRuleMapIds = async (rule: ChallengeProgressRule) =>
    [...new Set(rule.mapIds ?? (rule.mode ? (await standaloneModeMapIds([rule.mode])).get(rule.mode) ?? [] : []))];

  // One grouped read for every affected player instead of a per-player query;
  // the reconciliation loop pairs each player with their precomputed set. The
  // map list resolves through progressRuleMapIds so a rule without explicit
  // mapIds follows every map of its standalone mode.
  const d1InChunk = 500;
  const chunked = <T>(items: T[]): T[][] => { const out: T[][] = []; for (let i = 0; i < items.length; i += d1InChunk) out.push(items.slice(i, i + d1InChunk)); return out; };

  const loadEligibleProgressRunMaps = async (input: { playerAccountIds: string[]; rule: ChallengeProgressRule; startsAt: number | null; endsAt: number | null }) => {
    const requiredMapIds = await progressRuleMapIds(input.rule);
    const empty = new globalThis.Map(input.playerAccountIds.map((id) => [id, { completed: new Set<string>(), satisfied: false }]));
    if (!requiredMapIds.length || !input.playerAccountIds.length) return empty;
    // `chunked` keeps IN (...) under the SQLite variable limit for large
    // player sets; slices of a static list are safe to run in parallel.
    const rows = (await Promise.all(chunked(input.playerAccountIds).map((playerAccountIds) => db.select({ playerAccountId: verifiedRuns.playerAccountId, mapId: verifiedRuns.mapId, difficulty: verifiedRuns.difficulty })
      .from(verifiedRuns)
      .innerJoin(submissions, eq(verifiedRuns.sourceSubmissionId, submissions.id))
      .innerJoin(gameplayRevisions, eq(verifiedRuns.gameplayRevisionId, gameplayRevisions.id))
      .where(and(
        inArray(verifiedRuns.playerAccountId, playerAccountIds),
        eq(verifiedRuns.status, "active"),
        inArray(verifiedRuns.mapId, requiredMapIds),
        input.rule.mode ? eq(gameplayRevisions.mode, input.rule.mode) : isNull(gameplayRevisions.mode),
        input.startsAt !== null ? gte(submissions.createdAt, input.startsAt) : undefined,
        input.endsAt !== null ? lt(submissions.createdAt, input.endsAt) : undefined,
      ))))).flat();
    const byPlayer = new globalThis.Map<string, Set<string>>();
    for (const run of rows) {
      if (input.rule.difficultyAtLeast && !difficultyAtLeastSatisfied(run.difficulty, input.rule.difficultyAtLeast)) continue;
      byPlayer.set(run.playerAccountId, (byPlayer.get(run.playerAccountId) ?? new Set()).add(run.mapId));
    }
    const result = new globalThis.Map<string, { completed: Set<string>; satisfied: boolean }>();
    for (const playerAccountId of input.playerAccountIds) {
      const completed = byPlayer.get(playerAccountId) ?? new Set<string>();
      result.set(playerAccountId, { completed, satisfied: requiredMapIds.every((mapId) => completed.has(mapId)) });
    }
    return result;
  };

  const loadProgressChallenges = async (challengeId?: string) => (await db.select({ challenge: titleChallenges })
    .from(titleChallenges)
    .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
    .where(and(
      isNotNull(titleChallenges.progressRule),
      eq(titleChallenges.status, "active"),
      eq(titleCatalog.lifecycle, "active"),
      challengeId ? eq(titleChallenges.id, challengeId) : undefined,
    )))
    .flatMap(({ challenge }) => {
      const rule = parseChallengeProgressRule(challenge.progressRule);
      return rule ? [{ challenge, rule }] : [];
    });

  // Reconciles the derived Completion -> Grant chain for one player against one
  // progress Challenge. The completion row mirrors satisfaction; grant work is
  // skipped while the title is already owned at global scope or was
  // administratively revoked (matching the chain's `owned`/`grantable` rules).
  // Every statement is idempotent and lands in a single D1 batch.
  // Prefetched per-player facts for one progress Challenge: the completion
  // mirror rows, the global-scope grants, and the eligible run map sets. One
  // bulk read each replaces the per-(challenge, player) round trips.
  type ProgressChallengeFacts = {
    // globalThis.Map/Set: the imported contracts `Map` type shadows the builtins.
    completions: globalThis.Map<string, Array<{ id: string; challengeId: string; status: string }>>;
    grants: globalThis.Map<string, { activeGrant: { id: string; completionId: string | null; sourceType: string; sourceId: string } | null; administrativelyRevoked: boolean }>;
    eligibility: globalThis.Map<string, { completed: Set<string>; satisfied: boolean }>;
  };

  const loadProgressChallengeFacts = async (input: {
    playerAccountIds: string[];
    challenge: typeof titleChallenges.$inferSelect;
    rule: ChallengeProgressRule;
  }): Promise<ProgressChallengeFacts> => {
    const { playerAccountIds, challenge, rule } = input;
    if (!playerAccountIds.length) return { completions: new Map(), grants: new Map(), eligibility: new Map() };
    // Chunk the player list: a popular map rule can concern more accounts than
    // the SQLite variable limit a single IN (...) accepts.
    const playerChunks = chunked(playerAccountIds);
    const [eligibility, completionRows, grantRows] = await Promise.all([
      loadEligibleProgressRunMaps({ playerAccountIds, rule, startsAt: challenge.startsAt, endsAt: challenge.endsAt }),
      // Derived completions from every canonical rule version of this legacy
      // Challenge, not only the current one: an admin edit mints a new
      // canonical identity, and completions recorded under a superseded
      // identity still mirror satisfaction and hold the grant chain.
      Promise.all(playerChunks.map((ids) => db.select({ playerAccountId: challengeCompletions.playerAccountId, id: challengeCompletions.id, challengeId: challengeCompletions.challengeId, status: challengeCompletions.status })
        .from(challengeCompletions)
        .innerJoin(challenges, eq(challengeCompletions.challengeId, challenges.id))
        .where(and(
          inArray(challengeCompletions.playerAccountId, ids),
          eq(challengeCompletions.sourceType, "verified_run_progress"),
          eq(challenges.sourceFamily, "title_challenge"),
          eq(challenges.sourceId, challenge.id),
        )))).then((parts) => parts.flat()),
      Promise.all(playerChunks.map((ids) => db.select({ playerAccountId: playerTitleGrants.playerAccountId, id: playerTitleGrants.id, completionId: playerTitleGrants.completionId, status: playerTitleGrants.status, revocationType: playerTitleGrants.revocationType, sourceType: playerTitleGrants.sourceType, sourceId: playerTitleGrants.sourceId })
        .from(playerTitleGrants)
        .where(and(
          inArray(playerTitleGrants.playerAccountId, ids),
          eq(playerTitleGrants.titleKey, challenge.titleKey),
          isNull(playerTitleGrants.mapId),
          isNull(playerTitleGrants.gameplayRevisionId),
        )))).then((parts) => parts.flat()),
    ]);
    const completions = new globalThis.Map<string, Array<{ id: string; challengeId: string; status: string }>>();
    for (const row of completionRows) completions.set(row.playerAccountId, [...(completions.get(row.playerAccountId) ?? []), row]);
    const grants = new globalThis.Map<string, { activeGrant: { id: string; completionId: string | null; sourceType: string; sourceId: string } | null; administrativelyRevoked: boolean }>();
    for (const playerAccountId of playerAccountIds) if (!grants.has(playerAccountId)) grants.set(playerAccountId, { activeGrant: null, administrativelyRevoked: false });
    for (const row of grantRows) {
      const entry = grants.get(row.playerAccountId)!;
      if (row.status === "active" && !entry.activeGrant) entry.activeGrant = { id: row.id, completionId: row.completionId, sourceType: row.sourceType, sourceId: row.sourceId };
      else if (row.status === "revoked" && row.revocationType === "administrator") entry.administrativelyRevoked = true;
    }
    return { completions, grants, eligibility };
  };

  // Pure statement emission from prefetched facts; keeps the original
  // per-(challenge, player) ordering so batched writes land identically.
  // `revokingOwners` maps
  // `${playerAccountId}\n${titleKey}` to the progress Challenge ids whose plan
  // revokes the player's automatic grant this batch. A sibling path can still
  // satisfy the title while the Challenge that issued the active grant loses
  // it, so a satisfied sibling must re-issue instead of keeping a grant that
  // is about to be revoked.
  const planPlayerProgressChallenge = (input: {
    playerAccountId: string;
    challenge: typeof titleChallenges.$inferSelect;
    rule: ChallengeProgressRule;
    canonicalChallengeId: string;
    actorId: string;
    reason: string | null;
    timestamp: number;
    facts: ProgressChallengeFacts;
    revokingOwners: globalThis.Map<string, Set<string>>;
    statements: D1PreparedStatement[];
  }) => {
    const { playerAccountId, challenge, rule, canonicalChallengeId, actorId, reason, timestamp, facts, revokingOwners, statements } = input;
    const eligibility = facts.eligibility.get(playerAccountId) ?? { completed: new Set<string>(), satisfied: false };
    const completions = facts.completions.get(playerAccountId) ?? [];
    const { activeGrant, administrativelyRevoked } = facts.grants.get(playerAccountId) ?? { activeGrant: null, administrativelyRevoked: false };
    const activeCompletions = completions.filter((completion) => completion.status === "active");
    const staleCompletions = activeCompletions.filter((completion) => completion.challengeId !== canonicalChallengeId);
    const currentCompletion = completions.find((completion) => completion.challengeId === canonicalChallengeId);
    const payload = (action: string) => JSON.stringify({ challengeId: canonicalChallengeId, legacyChallengeId: challenge.id, titleKey: challenge.titleKey, action, reason });
    if (eligibility.satisfied) {
      // The active derived completion lives under the canonical rule version
      // currently in force; completions under superseded identities are
      // invalidated as mirrors of a retired rule version.
      for (const completion of staleCompletions) {
        statements.push(
          database.prepare("UPDATE challenge_completions SET status = 'invalidated', invalidated_by = ?, invalidated_at = ?, invalidation_reason = 'superseded_progress_rule' WHERE id = ? AND status = 'active'").bind(actorId, timestamp, completion.id),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'challenge.completion.progress', 'challenge_completion', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, completion.id, payload("superseded"), timestamp),
          database.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = ?, revoked_at = ?, revoke_reason = 'superseded_progress_rule' WHERE status = 'active' AND completion_id = ?").bind(actorId, timestamp, completion.id),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'title_grant.revoke', 'player_title_grant', id, ?, ? FROM player_title_grants WHERE completion_id = ? AND status = 'revoked' AND changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, payload("superseded"), timestamp, completion.id),
        );
      }
      const completionId = currentCompletion?.id ?? crypto.randomUUID();
      if (currentCompletion?.status === "invalidated") {
        statements.push(
          database.prepare("UPDATE challenge_completions SET status = 'active', invalidated_by = NULL, invalidated_at = NULL, invalidation_reason = NULL, completed_at = ? WHERE id = ? AND status = 'invalidated'").bind(timestamp, currentCompletion.id),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'challenge.completion.progress', 'challenge_completion', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, currentCompletion.id, payload("restored"), timestamp),
        );
      } else if (!currentCompletion) {
        statements.push(
          database.prepare("INSERT OR IGNORE INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, source_type, source_id, status, completed_at, created_at) VALUES (?, ?, ?, NULL, 'verified_run_progress', ?, 'active', ?, ?)").bind(completionId, playerAccountId, canonicalChallengeId, playerAccountId, timestamp, timestamp),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'challenge.completion.progress', 'challenge_completion', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, completionId, payload("created"), timestamp),
        );
      }
      // The derived grant keys its source to the legacy Challenge plus the
      // player account, so exactly one grant row exists per player and rule
      // across canonical versions; restoration relinks it to the current
      // completion. The player-scoped source id keeps the table-wide
      // (source_type, source_id, title_key) uniqueness intact per award.
      const grantSourceId = `${challenge.id}:${playerAccountId}`;
      // The grant is kept only when it is not about to be revoked: either this
      // plan invalidates its backing completion, or another progress Challenge
      // that issued it (`<challengeId>:<player>`) revokes it this batch.
      const grantOwner = activeGrant?.sourceType === "automatic" ? activeGrant.sourceId.slice(0, activeGrant.sourceId.lastIndexOf(":")) : null;
      const revoking = grantOwner ? (revokingOwners.get(`${playerAccountId}\n${challenge.titleKey}`)?.has(grantOwner) ?? false) : false;
      const keepGrant = activeGrant && !revoking && !staleCompletions.some((completion) => completion.id === activeGrant.completionId);
      if (!administrativelyRevoked && !keepGrant) {
        const grantId = crypto.randomUUID();
        statements.push(
          database.prepare("UPDATE player_title_grants SET status = 'active', revocation_type = NULL, revoked_by = NULL, revoked_at = NULL, revoke_reason = NULL, completion_id = ? WHERE status = 'revoked' AND revocation_type = 'evidence' AND source_type = 'automatic' AND source_id = ? AND title_key = ? AND player_account_id = ? AND NOT EXISTS (SELECT 1 FROM player_title_grants active WHERE active.player_account_id = player_title_grants.player_account_id AND active.title_key = player_title_grants.title_key AND active.map_id IS player_title_grants.map_id AND active.gameplay_revision_id IS player_title_grants.gameplay_revision_id AND active.status = 'active')").bind(completionId, grantSourceId, challenge.titleKey, playerAccountId),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'verified_run_progress.grant', 'player_title_grant', id, ?, ? FROM player_title_grants WHERE player_account_id = ? AND source_id = ? AND title_key = ? AND status = 'active' AND changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, payload("restored"), timestamp, playerAccountId, grantSourceId, challenge.titleKey),
          database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) VALUES (?, ?, ?, NULL, NULL, NULL, 'active', 'automatic', ?, 'system:verified_run_progress', ?, ?)").bind(grantId, playerAccountId, challenge.titleKey, grantSourceId, timestamp, completionId),
          database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'verified_run_progress.grant', 'player_title_grant', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, grantId, payload("granted"), timestamp),
        );
      }
      return;
    }
    for (const completion of activeCompletions) {
      statements.push(
        database.prepare("UPDATE challenge_completions SET status = 'invalidated', invalidated_by = ?, invalidated_at = ?, invalidation_reason = ? WHERE id = ? AND status = 'active'").bind(actorId, timestamp, reason, completion.id),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'challenge.completion.progress', 'challenge_completion', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, completion.id, payload("invalidated"), timestamp),
      );
    }
    if (activeCompletions.length) {
      statements.push(
        database.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE status = 'active' AND source_type = 'automatic' AND source_id = ? AND title_key = ? AND player_account_id = ?").bind(actorId, timestamp, reason, `${challenge.id}:${playerAccountId}`, challenge.titleKey, playerAccountId),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', ?, 'title_grant.revoke', 'player_title_grant', id, ?, ? FROM player_title_grants WHERE player_account_id = ? AND source_id = ? AND title_key = ? AND status = 'revoked' AND revoked_at = ? AND changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), actorId, payload("revoked"), timestamp, playerAccountId, `${challenge.id}:${playerAccountId}`, challenge.titleKey, timestamp),
      );
    }
  };

  // Prefetch facts for every progress Challenge, then decide which of them
  // revoke the player's automatic grant this batch. Sibling paths must see
  // that decision before they decide to keep the grant.
  const loadReconciliation = async (playerIds: string[], timestamp: number) => {
    const progressChallenges = await loadProgressChallenges();
    const plans: Array<{ challenge: typeof titleChallenges.$inferSelect; rule: ChallengeProgressRule; canonicalChallengeId: string; facts: ProgressChallengeFacts }> = [];
    const revokingOwners = new globalThis.Map<string, Set<string>>();
    for (const { challenge, rule } of progressChallenges) {
      const [canonicalChallengeId] = await materializingCanonicalChallenges.resolveMany([{
        legacyChallengeId: challenge.id,
        titleKey: challenge.titleKey,
        mapId: null,
        gameplayRevisionId: null,
        timestamp,
      }]);
      // Bulk-prefetch every player's facts once per challenge: 3 grouped reads
      // replace the ~4 queries each player used to pay.
      const facts = await loadProgressChallengeFacts({ playerAccountIds: playerIds, challenge, rule });
      plans.push({ challenge, rule, canonicalChallengeId, facts });
      for (const playerAccountId of playerIds) {
        const eligibility = facts.eligibility.get(playerAccountId);
        const activeCompletions = (facts.completions.get(playerAccountId) ?? []).filter((completion) => completion.status === "active");
        if (!eligibility?.satisfied && activeCompletions.length) {
          const key = `${playerAccountId}\n${challenge.titleKey}`;
          revokingOwners.set(key, new Set([...(revokingOwners.get(key) ?? []), challenge.id]));
        }
      }
    }
    return { plans, revokingOwners };
  };

  // Re-evaluates every progress Challenge for the owners of runs whose
  // authoritative facts just changed. Runs after the mutating write commits.
  // Corrections can move a run across required-map boundaries, so evaluation
  // is not pre-filtered by the run's current map.
  const reconcileVerifiedRunProgressChallenges = async (input: { verifiedRunIds: string[]; actorId: string; reason?: string | null }) => {
    const runIds = [...new Set(input.verifiedRunIds)];
    if (!runIds.length) return;
    const runs = await db.select({ playerAccountId: verifiedRuns.playerAccountId })
      .from(verifiedRuns)
      .where(inArray(verifiedRuns.id, runIds));
    const playerIds = [...new Set(runs.map((run) => run.playerAccountId))];
    if (!playerIds.length) return;
    const timestamp = now();
    const reason = input.reason?.trim() || null;
    const { plans, revokingOwners } = await loadReconciliation(playerIds, timestamp);
    if (!plans.length) return;
    const statements: D1PreparedStatement[] = [];
    for (const { challenge, rule, canonicalChallengeId, facts } of plans) {
      for (const playerAccountId of playerIds) {
        planPlayerProgressChallenge({ playerAccountId, challenge, rule, canonicalChallengeId, actorId: input.actorId, reason, timestamp, facts, revokingOwners, statements });
      }
    }
    if (statements.length) await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  // Retroactively reconciles one progress Challenge for every player the rule
  // could concern: owners of an active run on a required map plus holders of a
  // derived completion under any canonical identity (an edit mints a new one,
  // and players who no longer satisfy must still be found to invalidate their
  // mirror). Used when an admin creates or edits the rule.
  const reconcileProgressChallengePlayers = async (input: { challenge: typeof titleChallenges.$inferSelect; rule: ChallengeProgressRule; actorId: string; reason?: string | null }) => {
    const timestamp = now();
    const [canonicalChallengeId] = await materializingCanonicalChallenges.resolveMany([{
      legacyChallengeId: input.challenge.id,
      titleKey: input.challenge.titleKey,
      mapId: null,
      gameplayRevisionId: null,
      timestamp,
    }]);
    const requiredMapIds = await progressRuleMapIds(input.rule);
    const [runPlayers, completionPlayers] = await Promise.all([
      requiredMapIds.length ? db.selectDistinct({ playerAccountId: verifiedRuns.playerAccountId })
        .from(verifiedRuns)
        .where(and(eq(verifiedRuns.status, "active"), inArray(verifiedRuns.mapId, requiredMapIds))) : Promise.resolve([] as Array<{ playerAccountId: string }>),
      db.selectDistinct({ playerAccountId: challengeCompletions.playerAccountId })
        .from(challengeCompletions)
        .innerJoin(challenges, eq(challengeCompletions.challengeId, challenges.id))
        .where(and(
          eq(challengeCompletions.sourceType, "verified_run_progress"),
          eq(challenges.sourceFamily, "title_challenge"),
          eq(challenges.sourceId, input.challenge.id),
        )),
    ]);
    const players = [...new Set([...runPlayers, ...completionPlayers].map(({ playerAccountId }) => playerAccountId))];
    if (!players.length) return;
    // Plan the target challenge with the incoming rule (an edit may not have
    // committed the stored rule yet), plus every sibling path sharing its
    // title so a re-issued grant replaces the one this path now revokes.
    const { plans, revokingOwners } = await loadReconciliation(players, timestamp);
    const own = { challenge: input.challenge, rule: input.rule, canonicalChallengeId, facts: await loadProgressChallengeFacts({ playerAccountIds: players, challenge: input.challenge, rule: input.rule }) };
    const otherPlans = plans.filter(({ challenge }) => challenge.id !== input.challenge.id);
    // The edited challenge's revocation set must come from the incoming rule,
    // not the stale stored one `loadReconciliation` read.
    for (const playerAccountId of players) {
      const eligibility = own.facts.eligibility.get(playerAccountId);
      const activeCompletions = (own.facts.completions.get(playerAccountId) ?? []).filter((completion) => completion.status === "active");
      const key = `${playerAccountId}\n${input.challenge.titleKey}`;
      const owners = new Set([...(revokingOwners.get(key) ?? [])].filter((id) => id !== input.challenge.id));
      if (!eligibility?.satisfied && activeCompletions.length) owners.add(input.challenge.id);
      if (owners.size) revokingOwners.set(key, owners);
      else revokingOwners.delete(key);
    }
    const statements: D1PreparedStatement[] = [];
    for (const playerAccountId of players) {
      planPlayerProgressChallenge({ playerAccountId, challenge: own.challenge, rule: own.rule, canonicalChallengeId, actorId: input.actorId, reason: input.reason?.trim() || null, timestamp, facts: own.facts, revokingOwners, statements });
    }
    for (const { challenge, rule, canonicalChallengeId: siblingCanonicalId, facts } of otherPlans) {
      for (const playerAccountId of players) {
        planPlayerProgressChallenge({ playerAccountId, challenge, rule, canonicalChallengeId: siblingCanonicalId, actorId: input.actorId, reason: input.reason?.trim() || null, timestamp, facts, revokingOwners, statements });
      }
    }
    if (statements.length) await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };



  const prepareCanonicalAutoMatchChallenges = async (items: Challenge[], eligibilityAt: number) => {
    const resolved: CanonicalOcrChallenge[] = [];
    const snapshots = new Map<string, MapTitleRuleSnapshot>();
    const itemSnapshots = await batchResolveAutomaticSnapshots(items, eligibilityAt);
    const candidateIndices: number[] = [];
    const planInputs: CanonicalChallengeInput[] = [];
    items.forEach((challenge, i) => {
      if (!challenge.titleKey) return;
      const snapshot = itemSnapshots[i];
      if (!snapshot?.titleKey) return;
      candidateIndices.push(i);
      planInputs.push({
        snapshot,
        legacyChallengeId: challenge.challengeId,
        titleKey: snapshot.titleKey,
        mapId: snapshot.mapId,
        gameplayRevisionId: snapshot.gameplayRevisionId,
        timestamp: eligibilityAt,
      });
    });
    const plans = await batchPlanCanonicalChallenges(planInputs);
    candidateIndices.forEach((i, planIndex) => {
      const challenge = items[i];
      const snapshot = itemSnapshots[i]!;
      const canonicalChallengeId = plans[planIndex].row.id;
      const conditions = parseCanonicalChallengeConditions(plans[planIndex].row.conditionsJson);
      resolved.push({ challenge, canonicalChallengeId, conditions });
      snapshots.set(canonicalChallengeId, snapshot);
    });

    const titleKeys = [...new Set(resolved.flatMap(({ conditions }) => conditions?.conditions.flatMap((condition) => condition.type === "achievement_title" ? [condition.titleKey] : []) ?? []))];
    const titleRows = titleKeys.length ? await db.select({ key: titleCatalog.key, label: titleCatalog.label }).from(titleCatalog).where(sql`${titleCatalog.key} IN (SELECT value FROM json_each(${JSON.stringify(titleKeys)}))`) : [];
    const titleNamesByKey = new Map(titleRows.map(({ key, label }) => [key, label]));
    for (const { challenge } of resolved) {
      if (challenge.family === "achievement" && challenge.titleKey) titleNamesByKey.set(challenge.titleKey, challenge.titleName);
      else if (challenge.family === "map" && challenge.titleKey) titleNamesByKey.set(challenge.titleKey, challenge.name);
    }
    const activeMaps = await loadActiveMaps();
    const mapIdsByName = new Map<string, string>();
    const ambiguousMapNames = new Set<string>();
    for (const map of activeMaps) {
      const key = map.name.trim().toLocaleLowerCase();
      if (mapIdsByName.has(key)) ambiguousMapNames.add(key);
      else mapIdsByName.set(key, map.id);
    }
    for (const key of ambiguousMapNames) mapIdsByName.delete(key);
    const canonicalChallengePlans = new globalThis.Map(plans.map((plan) => [plan.row.id, plan]));
    return { candidates: resolved, snapshots, canonicalChallengePlans, titleNamesByKey, mapIdsByName };
  };

  const preparePlayerAutoMatchChallenges = async (row: typeof submissions.$inferSelect, response: OcrResponse) => {
    const [items, gameplayRevisionId] = await Promise.all([
      fetchPlayerAutoMatchChallenges(row.playerAccountId, row.createdAt),
      resolveAutoMatchGameplayRevisionId(row, response),
    ]);
    return prepareCanonicalAutoMatchChallenges(
      items.filter((challenge) => challenge.family !== "map" || challenge.gameplayRevisionId === gameplayRevisionId),
      row.createdAt,
    );
  };

  const {
    titleGrantScopeKey,
    addChallengeCompletionAward,
    selectCompletionGrantAwards,
    submissionCompletionStatements,
    challengeCompletionChains,
  } = createChallengeCompletionServices(database, db, loadCanonicalChallenges);

  type ReviewEvidenceSelection = { challengeId: string; targetMapId: string | null; gameplayRevisionId: string | null; challengeType: string; ruleSnapshotJson: string | null; canonicalChallengeId: string; basis: "conditions" | "reviewer" };
  type ReviewReward = { challengeId: string; titleKey: string; titleName: string; mapId: string | null; gameplayRevisionId: string | null; slot: string | null; snapshot: MapTitleRuleSnapshot | null };

  // Re-evaluates the latest OCR evidence with the maintainer's field corrections and
  // resolves which eligible Challenges approval would complete: every canonical
  // Conditions match plus explicit maintainer confirmations from the same eligible set.
  // Titles this Submission already granted stay with the player across later review decisions,
  // so re-approving it can rely on them instead of requiring new rewards.
  const loadRetainedSubmissionGrants = (submissionId: string) => db
    .select({ grantId: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey, titleName: titleCatalog.label, mapId: playerTitleGrants.mapId })
    .from(playerTitleGrants)
    .innerJoin(titleCatalog, eq(titleCatalog.key, playerTitleGrants.titleKey))
    .where(and(inArray(playerTitleGrants.sourceType, ["automatic", "submission"]), eq(playerTitleGrants.sourceId, submissionId), eq(playerTitleGrants.status, "active")))
    .orderBy(playerTitleGrants.grantedAt, playerTitleGrants.id);

  const planReviewedEvidence = async (row: typeof submissions.$inferSelect, fieldCorrections: AdminSubmissionReviewRequest["fieldCorrections"], confirmedChallengeIds: readonly string[] = []) => {
    const latestOcr = await db.select({ responseJson: ocrResults.responseJson }).from(ocrResults)
      .where(eq(ocrResults.submissionId, row.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get();
    let rawResponse: OcrResponse | null = null;
    try { rawResponse = latestOcr?.responseJson ? JSON.parse(latestOcr.responseJson) as OcrResponse : null; } catch { rawResponse = null; }
    if (rawResponse) rawResponse = await withCanonicalMode(rawResponse);
    // A failed recognition leaves no evidence; the reviewer's own field corrections then stand in for it.
    if (!rawResponse && !fieldCorrections?.length) throw new Error("SUBMISSION_NOT_REVIEWABLE");
    const correctedResponse = applySubmissionFieldCorrections(rawResponse ?? { ok: true, data: {}, fields: {} }, fieldCorrections);
    const [evidencePrepared, linkablePrepared] = await Promise.all([
      preparePlayerAutoMatchChallenges(row, correctedResponse),
      prepareCanonicalAutoMatchChallenges(await fetchPlayerAutoMatchChallenges(row.playerAccountId, row.createdAt), row.createdAt),
    ]);
    const decision = matchOcrAgainstChallenges(evidencePrepared.candidates, correctedResponse, evidencePrepared.mapIdsByName, evidencePrepared.titleNamesByKey, true);
    // A maintainer may also link any Challenge the player can currently complete, whatever map or
    // revision the evidence resolves to. Those are never matched from evidence (which would let a
    // mirror-mode clear satisfy regular map Challenges again); they count only when confirmed.
    const evidenceIds = new Set(decision.candidates.map((candidate) => candidate.canonicalChallengeId));
    const linkable: AutoMatchCandidate[] = linkablePrepared.candidates.filter((candidate) => !evidenceIds.has(candidate.canonicalChallengeId)).map((candidate) => ({
      ...candidate,
      evaluation: { supported: true, matched: false, requiredFields: [] },
      quality: { accepted: false, requiredFields: [], reasons: [] },
      grantable: Boolean(candidate.challenge.titleKey),
    }));
    const prepared = {
      ...evidencePrepared,
      snapshots: new globalThis.Map([...linkablePrepared.snapshots, ...evidencePrepared.snapshots]),
      canonicalChallengePlans: new globalThis.Map([...linkablePrepared.canonicalChallengePlans, ...evidencePrepared.canonicalChallengePlans]),
      titleNamesByKey: new globalThis.Map([...linkablePrepared.titleNamesByKey, ...evidencePrepared.titleNamesByKey]),
    };
    const candidatesById = new globalThis.Map([...decision.candidates, ...linkable].map((candidate) => [candidate.canonicalChallengeId, candidate]));
    const ineligibleConfirmations = confirmedChallengeIds.filter((challengeId) => !candidatesById.has(challengeId));
    const chosen = new globalThis.Map<string, { candidate: AutoMatchCandidate; basis: ReviewEvidenceSelection["basis"] }>();
    for (const candidate of decision.exact) chosen.set(candidate.canonicalChallengeId, { candidate, basis: "conditions" });
    for (const challengeId of confirmedChallengeIds) {
      const candidate = candidatesById.get(challengeId);
      if (candidate && !chosen.has(challengeId)) chosen.set(challengeId, { candidate, basis: "reviewer" });
    }
    const selections: ReviewEvidenceSelection[] = [...chosen.values()].flatMap(({ candidate, basis }) => {
      const snapshot = prepared.snapshots.get(candidate.canonicalChallengeId);
      if (!snapshot) return [];
      return [{
        challengeType: candidate.challenge.family === "achievement" ? "title_achievement" : "map_title_achievement",
        challengeId: candidate.challenge.challengeId,
        targetMapId: snapshot.mapId,
        gameplayRevisionId: snapshot.gameplayRevisionId ?? null,
        ruleSnapshotJson: JSON.stringify(snapshot),
        canonicalChallengeId: candidate.canonicalChallengeId,
        basis,
      }];
    });
    return { correctedResponse, prepared, decision, linkable, selections, ineligibleConfirmations };
  };

  // Resolves the Completion -> Grant chain that approving the selections would write,
  // without writing it. Throws the same business errors approval must surface.
  const planApprovalRewards = async (row: typeof submissions.$inferSelect, selectedRows: readonly ReviewEvidenceSelection[], timestamp: number, canonicalChallenges: CanonicalChallengeResolver = materializingCanonicalChallenges, preparedPlans?: ReadonlyMap<string, CanonicalChallengePlan>) => {
    const snapshotsBySelection = selectedRows.map((selection) => selection.ruleSnapshotJson ? JSON.parse(selection.ruleSnapshotJson) as MapTitleRuleSnapshot : null);

    // Prefetch every resolution input the selection loop needs so the per-row
    // work below is pure lookups: 4 grouped reads instead of ~3-7 round trips
    // per selection.
    const titleAchievementIds = [...new Set(selectedRows.filter((selection, index) => !snapshotsBySelection[index] && selection.challengeType === "title_achievement").map((selection) => selection.challengeId))];
    const legacyCandidates = selectedRows.filter((selection, index) => !snapshotsBySelection[index] && selection.challengeType !== "title_achievement");
    const legacyIds = [...new Set(legacyCandidates.map((selection) => selection.challengeId))];
    const compatRows = legacyIds.length ? await db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId, mapId: mapTitleRuleCompat.mapId, ruleId: mapTitleRuleCompat.ruleId })
      .from(mapTitleRuleCompat)
      .where(inArray(mapTitleRuleCompat.legacyChallengeId, legacyIds)) : [];
    // Keyed by challengeId + targetMapId: the same legacy challenge can serve
    // several selections pointing at different maps.
    const compatKeyOf = (selection: ReviewEvidenceSelection) => `${selection.challengeId}:${selection.targetMapId ?? ""}`;
    const compatBySelection = new globalThis.Map(legacyCandidates.flatMap((selection) => {
      const row = compatRows.find((compat) => compat.legacyChallengeId === selection.challengeId && compat.mapId === selection.targetMapId);
      return row && selection.targetMapId ? [[compatKeyOf(selection), row] as const] : [];
    }));
    const compatSnaps = await resolveMapTitleProjections(legacyCandidates.flatMap((selection) => {
      const compat = compatBySelection.get(compatKeyOf(selection));
      return compat ? [{ ruleId: compat.ruleId, mapId: selection.targetMapId!, gameplayRevisionId: selection.gameplayRevisionId, eligibilityAt: row.createdAt }] : [];
    }));
    const compatSnapBySelection = new globalThis.Map<string, MapTitleRuleSnapshot>();
    {
      let compatIndex = 0;
      for (const selection of legacyCandidates) {
        if (!compatBySelection.has(compatKeyOf(selection))) continue;
        const snap = compatSnaps[compatIndex++];
        if (snap) compatSnapBySelection.set(compatKeyOf(selection), snap);
      }
    }

    const [titleChallengeRows, titleNameRows, mapChallengeRows] = await Promise.all([
      titleAchievementIds.length ? db.select({ id: titleChallenges.id, titleKey: titleChallenges.titleKey, titleName: titleCatalog.label, scope: titleChallenges.scope }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(inArray(titleChallenges.id, titleAchievementIds)) : Promise.resolve([]),
      (() => {
        const titleKeys = [...new Set([
          ...snapshotsBySelection.flatMap((snapshot) => snapshot ? [snapshot.titleKey] : []),
          ...[...compatSnapBySelection.values()].map((snap) => snap.titleKey),
        ])];
        return titleKeys.length ? db.select({ key: titleCatalog.key, label: titleCatalog.label }).from(titleCatalog).where(sql`${titleCatalog.key} IN (SELECT value FROM json_each(${JSON.stringify(titleKeys)}))`) : Promise.resolve([]);
      })(),
      legacyIds.length ? db.select({ id: achievementChallenges.id, titleKey: achievementChallenges.rewardTitleKey, titleName: titleCatalog.label, mapId: achievementChallenges.mapId, slot: mapTitleRewards.slot }).from(achievementChallenges).leftJoin(titleCatalog, eq(achievementChallenges.rewardTitleKey, titleCatalog.key)).leftJoin(mapTitleRewards, and(eq(mapTitleRewards.mapId, achievementChallenges.mapId), eq(mapTitleRewards.titleKey, achievementChallenges.rewardTitleKey))).where(inArray(achievementChallenges.id, legacyIds)) : Promise.resolve([]),
    ]);
    const titleChallengeById = new globalThis.Map(titleChallengeRows.map((challenge) => [challenge.id, challenge]));
    const titleNames = new globalThis.Map(titleNameRows.map(({ key, label }) => [key, label]));
    const mapChallengeById = new globalThis.Map(mapChallengeRows.map((challenge) => [challenge.id, challenge]));

    const rewards: ReviewReward[] = [];
    for (const [selectionIndex, selection] of selectedRows.entries()) {
      let reward: ReviewReward | null = null;
      const snapshot = snapshotsBySelection[selectionIndex];
      if (snapshot) {
        reward = { challengeId: selection.challengeId, titleKey: snapshot.titleKey, titleName: titleNames.get(snapshot.titleKey) ?? snapshot.titleKey, mapId: snapshot.mapId, gameplayRevisionId: snapshot.gameplayRevisionId ?? selection.gameplayRevisionId ?? null, slot: snapshot.slot, snapshot };
      } else if (selection.challengeType === "title_achievement") {
        const challenge = titleChallengeById.get(selection.challengeId);
        if (!challenge || challenge.scope === "map" || !challenge.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
        reward = { challengeId: selection.challengeId, titleKey: challenge.titleKey, titleName: challenge.titleName, mapId: null, gameplayRevisionId: null, slot: null, snapshot: null };
      } else {
        const snap = selection.targetMapId ? compatSnapBySelection.get(compatKeyOf(selection)) ?? null : null;
        if (snap) {
          reward = { challengeId: selection.challengeId, titleKey: snap.titleKey, titleName: titleNames.get(snap.titleKey) ?? snap.titleKey, mapId: snap.mapId, gameplayRevisionId: snap.gameplayRevisionId, slot: snap.slot, snapshot: snap };
        } else {
          const challenge = mapChallengeById.get(selection.challengeId);
          if (!challenge?.titleKey || !challenge.titleName) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
          reward = { challengeId: selection.challengeId, titleKey: challenge.titleKey, titleName: challenge.titleName, mapId: challenge.mapId, gameplayRevisionId: selection.gameplayRevisionId, slot: challenge.slot, snapshot: null };
        }
      }
      if (!reward) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
      if (reward.mapId && !reward.gameplayRevisionId) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
      if (reward.gameplayRevisionId && row.gameplayRevisionId && reward.gameplayRevisionId !== row.gameplayRevisionId && selection.gameplayRevisionId !== reward.gameplayRevisionId) throw new Error("SUBMISSION_REVISION_MISMATCH");
      rewards.push(reward);
    }

    const selectedPlans = selectedRows.map((selection) => preparedPlans?.get(selection.canonicalChallengeId));
    const canonicalChallengeIds = selectedPlans.every((plan): plan is CanonicalChallengePlan => Boolean(plan))
      ? await canonicalChallenges.resolvePlans(selectedPlans)
      : await canonicalChallenges.resolveMany(rewards.map((reward) => ({ snapshot: reward.snapshot, legacyChallengeId: reward.challengeId, titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, timestamp })));
    const completionRoots = rewards.map((reward, index) => ({ reward, canonicalChallengeId: canonicalChallengeIds[index] }));
    const uniqueRewards = [...new Map(completionRoots.map((root) => [titleGrantScopeKey(root.reward), root])).values()];
    const grantTitleKeys = [...new Set(uniqueRewards.map(({ reward }) => reward.titleKey))];
    const existingGrantRows = grantTitleKeys.length ? await db.select({ id: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId }).from(playerTitleGrants).where(and(
      eq(playerTitleGrants.playerAccountId, row.playerAccountId),
      eq(playerTitleGrants.status, "active"),
      sql`${playerTitleGrants.titleKey} IN (SELECT value FROM json_each(${JSON.stringify(grantTitleKeys)}))`,
    )) : [];
    const existingGrantByScope = new globalThis.Map(existingGrantRows.map((grant) => [JSON.stringify([grant.titleKey, grant.mapId, grant.gameplayRevisionId]), grant.id]));
    const grantResults = [] as Array<{ reward: ReviewReward; grantId: string; alreadyOwned: boolean; canonicalChallengeId: string }>;
    for (const root of uniqueRewards) {
      const { reward, canonicalChallengeId } = root;
      const existingGrantId = existingGrantByScope.get(JSON.stringify([reward.titleKey, reward.mapId, reward.gameplayRevisionId]));
      grantResults.push({ reward, grantId: existingGrantId ?? crypto.randomUUID(), alreadyOwned: Boolean(existingGrantId), canonicalChallengeId });
    }
    const grantResultsByScope = new Map(grantResults.map((result) => [titleGrantScopeKey(result.reward), result]));
    const completionAwards = new Map<string, ChallengeCompletionAward>();
    const chainRoots = completionRoots.filter((root) => !grantResultsByScope.get(titleGrantScopeKey(root.reward))?.alreadyOwned);
    const completionChains = await challengeCompletionChains({
      playerAccountId: row.playerAccountId,
      roots: chainRoots.map((root) => ({ challengeId: root.canonicalChallengeId, slot: root.reward.slot })),
      eligibilityAt: row.createdAt,
      overlay: canonicalChallenges.overlay,
    });
    for (const [index, root] of chainRoots.entries()) {
      const grantResult = grantResultsByScope.get(titleGrantScopeKey(root.reward));
      if (!grantResult) continue;
      const chain = completionChains[index];
      if (!chain.some((award) => award.root)) throw new Error("CHALLENGE_NOT_COMPLETABLE");
      if (chain.some((award) => award.root && !award.grantable)) throw new Error("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
      for (const award of chain) addChallengeCompletionAward(completionAwards, award);
    }
    const grantIdsByScope = new Map(grantResults.map((result) => [titleGrantScopeKey(result.reward), result.grantId]));
    const completionAwardRows = [...completionAwards.values()].map((award) => ({
      ...award,
      grantId: grantIdsByScope.get(titleGrantScopeKey(award)) ?? crypto.randomUUID(),
    }));
    const directGrantsByScope = new Map(grantResults.map((result) => [titleGrantScopeKey(result.reward), result]));
    const completionGrantsByScope = selectCompletionGrantAwards(completionAwardRows, directGrantsByScope);
    return { rewards, grantResults, completionAwardRows, completionGrantsByScope, directGrantsByScope };
  };



  // The regular build's event catalog is the platform's implemented, unsuspended events outside any
  // standalone mode's pools. A standalone mode's build may also return or disable regular events, so
  // its total is the one recorded on the mode. Null when no total applies: an empty catalog, an unset
  // event weight, or a mode without a recorded total.
  const expectedRunCodeEventWeight = async (mode: string | null) => {
    if (mode) {
      const total = (await db.select({ total: standaloneModes.eventWeightTotal }).from(standaloneModes).where(eq(standaloneModes.mode, mode)).get())?.total ?? null;
      return total === null ? null : eventWeightTotalCode([total]);
    }
    const rows = await db.select({ weight: randomEvents.weight, poolMode: randomEventVersions.mode, availability: randomEventVersions.availability })
      .from(randomEvents)
      .leftJoin(randomEventVersions, eq(randomEventVersions.gameVersion, randomEvents.gameVersion))
      .where(and(eq(randomEvents.releaseStatus, "implemented"), isNull(randomEvents.archivedAt)));
    const pool = rows.filter((row) => row.availability !== "suspended" && row.poolMode === null);
    return !pool.length || pool.some((row) => row.weight === null) ? null : eventWeightTotalCode(pool.map((row) => row.weight!));
  };

  // A run code whose embedded event-weight total differs from the build's pools by more than the
  // tolerance means the room's weights were changed; the tolerance absorbs small drift between platform
  // weights and the deployed build. Unreadable codes, builds before the embedding, and unset weights are
  // not checked.
  const runCodeEventWeightTolerance = 50; // ±0.50 of total event weight, in run-code units
  const assessRunCodeEventWeight = async (response: OcrResponse) => {
    if (!hasReliableVerifiedRunField(response, "run_code", masteryEvidenceCompatibility) || !hasReliableVerifiedRunField(response, "version", masteryEvidenceCompatibility)) return null;
    let read: number | null;
    try {
      read = runCodeEventWeightTotal(String(response.data?.run_code ?? ""), String(response.data?.version ?? ""));
    } catch {
      return null;
    }
    if (read === null) return null;
    const expected = await expectedRunCodeEventWeight(standaloneOcrMode(response));
    return expected === null ? null : { read, expected };
  };

  // A non-regular mode label is trusted only when an administrator has configured that mode;
  // anything else is most likely a misread of the regular label and needs a maintainer.
  // A mode label OCR misread by a character is matched to the configured mode it nearly spells; the
  // label as read stays in `mode_read` so the evidence is never silently rewritten.
  const withCanonicalMode = async (response: OcrResponse): Promise<OcrResponse> => {
    if (!response.data?.mode) return response;
    const known = (await db.select({ mode: standaloneModes.mode }).from(standaloneModes)).map((row) => row.mode);
    const matched = matchGameMode(response.data.mode, known);
    return matched.approximate ? { ...response, data: { ...response.data, mode: matched.mode, mode_read: response.data.mode } } : response;
  };

  const isKnownStandaloneMode = async (mode: string) => Boolean(await db.select({ mode: standaloneModes.mode }).from(standaloneModes).where(eq(standaloneModes.mode, mode)).get());

  // The newest build the platform knows: the highest well-formed version among event pools.
  const latestBuildVersion = async () => {
    const rows = await db.select({ gameVersion: randomEventVersions.gameVersion }).from(randomEventVersions);
    const parts = (version: string) => version.split(".").map(Number);
    const newest = rows.map((row) => row.gameVersion).filter(isWellFormedGameVersion).sort((a, b) => {
      const [left, right] = [parts(a), parts(b)];
      return (left[0]! - right[0]!) || (left[1]! - right[1]!) || (left[2]! - right[2]!);
    }).at(-1);
    return newest ?? formatDayBuildVersion();
  };


  const recordVerifiedRun = async (input: VerifiedRunInput): Promise<RecordVerifiedRunResult> => {
    const planned = await planVerifiedRunRecord(input);
    if (!planned.statements.length) {
      // A fully persisted record can still need the derived mirror repaired:
      // this retry may follow a previous post-commit reconciliation failure.
      await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [planned.result.run.runId], actorId: input.acceptanceSource });
      return planned.result;
    }
    await database.batch(planned.statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    const persistedBySource = await db.select().from(verifiedRuns).where(eq(verifiedRuns.sourceSubmissionId, planned.candidate.sourceSubmissionId)).get();
    const persisted = persistedBySource ?? await db.select().from(verifiedRuns).where(and(
      eq(verifiedRuns.playerAccountId, planned.candidate.playerAccountId),
      eq(verifiedRuns.mapId, planned.candidate.mapId),
      eq(verifiedRuns.gameVersion, planned.candidate.gameVersion),
      eq(verifiedRuns.matchCode, planned.candidate.matchCode),
    )).get();
    if (!persisted) throw new Error("VERIFIED_RUN_PERSIST_FAILED");
    await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [persisted.id], actorId: input.acceptanceSource });
    const run = asVerifiedRun(persisted);
    if (persisted.id === planned.result.run.runId) return { outcome: "created", run };
    const conflictFields = masteryConflictFields(run, planned.candidate);
    return conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run };
  };

  const { persistSubmissionReview, reconcileReviewedSubmissionProgress } = createSubmissionReviewPersistence(database, db, {
    loadVerifiedRunSubmissionOutcome,
    reconcileVerifiedRunProgressChallenges,
  });

  const { prepareVerifiedRunTransitionStatements, transitionVerifiedRun, ...adminVerifiedRunServices } = createAdminVerifiedRunServices({
    database,
    db,
    now,
    replayOrConflict: databaseServiceDependencies.replayOrConflict,
    recordIdempotency: databaseServiceDependencies.recordIdempotency,
    conflictFieldsForOutcome: (row) => asVerifiedRunSubmissionOutcome(row).conflictFields,
    loadSourceSubmission: async (row) => asAdminSubmission(row, await resolveAdminSubmissionDetails([row])),
    reconcileVerifiedRunProgressChallenges,
  });

  const { completeOcrResult, ...submissionOcrServices } = createSubmissionOcrServices({
    database,
    db,
    now,
    hashRequest,
    logOcrEvent,
    errorDetails,
    evidenceBucket,
    ocrkitBaseUrl,
    ocrkitApiToken,
    ocrAutoReviewSampleRate,
    preparePlayerAutoMatchChallenges,
    resolveVerifiedRunSubmissionOutcome,
    masterySubmissionOutcomeStatement,
    approvedSubmissionOutcomeStatement,
    withCanonicalMode,
    isKnownStandaloneMode,
    assessRunCodeEventWeight,
    runCodeEventWeightTolerance,
    completion: { titleGrantScopeKey, addChallengeCompletionAward, selectCompletionGrantAwards, challengeCompletionChains },
    canonicalChallenges: { materializingCanonicalChallenges },
  });

  return {
    reconcileStaleOcrJobs,
    recordVerifiedRun,

    async invalidateVerifiedRun(input, actor) {
      return transitionVerifiedRun(input, actor, "invalidated");
    },

    async restoreVerifiedRun(input, actor) {
      return transitionVerifiedRun(input, actor, "active");
    },

    async rebuildMasteryProfiles(input) {
      return activeMasteryProfiles(db, input);
    },

    ...adminVerifiedRunServices,
    async listAdminStandaloneModes(_auth): Promise<AdminStandaloneModeListResponse> {
      const [modes, revisions, pools] = await Promise.all([
        db.select().from(standaloneModes).orderBy(desc(standaloneModes.createdAt)),
        db.select({ mode: gameplayRevisions.mode, mapId: gameplayRevisions.mapId }).from(gameplayRevisions).where(and(isNotNull(gameplayRevisions.mode), eq(gameplayRevisions.lifecycle, "selectable"))),
        db.select({ mode: randomEventVersions.mode, gameVersion: randomEventVersions.gameVersion }).from(randomEventVersions).where(isNotNull(randomEventVersions.mode)),
      ]);
      return { contractVersion: "1", items: modes.map((row) => ({
        mode: row.mode,
        mapIds: revisions.filter((revision) => revision.mode === row.mode).map((revision) => revision.mapId).sort(),
        eventPools: pools.filter((pool) => pool.mode === row.mode).map((pool) => pool.gameVersion).sort(),
        eventWeightTotal: row.eventWeightTotal,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })) };
    },
    // Saving a standalone mode is its whole setup: each listed map gets the mode's own selectable
    // Gameplay Revision (created without a spatial config, which only Bastion's regular build needs),
    // maps no longer listed have theirs retired to historical (runs and grants on it stay valid), the
    // listed event pools move to the mode, and progress rules that follow the mode are reconciled.
    async upsertAdminStandaloneMode(input, auth, idempotencyKey): Promise<AdminStandaloneMode> {
      const operation = "admin.standalone-mode.upsert";
      const replay = await replayOrConflict<AdminStandaloneMode>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const mode = normalizeGameMode(input.mode);
      if (!mode || mode.includes("随机事件")) throw new Error("STANDALONE_MODE_INVALID");
      const mapIds = [...new Set(input.mapIds)].sort();
      const eventPools = [...new Set(input.eventPools)].sort();
      const [mapRows, poolRows, poolOwners, modeRevisions, previous] = await Promise.all([
        mapIds.length ? db.select({ id: maps.id, status: maps.status }).from(maps).where(inArray(maps.id, mapIds)) : Promise.resolve([] as Array<{ id: string; status: string }>),
        eventPools.length ? db.selectDistinct({ gameVersion: randomEvents.gameVersion }).from(randomEvents).where(inArray(randomEvents.gameVersion, eventPools)) : Promise.resolve([] as Array<{ gameVersion: string }>),
        eventPools.length ? db.select({ gameVersion: randomEventVersions.gameVersion, mode: randomEventVersions.mode }).from(randomEventVersions).where(inArray(randomEventVersions.gameVersion, eventPools)) : Promise.resolve([] as Array<{ gameVersion: string; mode: string | null }>),
        db.select({ id: gameplayRevisions.id, mapId: gameplayRevisions.mapId, lifecycle: gameplayRevisions.lifecycle }).from(gameplayRevisions).where(eq(gameplayRevisions.mode, mode)),
        db.select().from(standaloneModes).where(eq(standaloneModes.mode, mode)).get(),
      ]);
      if (mapRows.length !== mapIds.length) throw new Error("MAP_NOT_FOUND");
      if (mapRows.some((map) => map.status !== "active")) throw new Error("MAP_NOT_ACTIVE");
      if (poolRows.length !== eventPools.length) throw new Error("EVENT_VERSION_NOT_FOUND");
      if (poolOwners.some((pool) => pool.mode !== null && pool.mode !== mode)) throw new Error("STANDALONE_MODE_POOL_CONFLICT");

      const timestamp = now();
      const listed = new Set(mapIds);
      const revisionByMap = new globalThis.Map(modeRevisions.map((revision) => [revision.mapId, revision]));
      const modeRevisionVersion = await latestBuildVersion();
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT INTO standalone_modes (mode, event_weight_total, created_at, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(mode) DO UPDATE SET event_weight_total = excluded.event_weight_total, updated_at = excluded.updated_at").bind(mode, input.eventWeightTotal, timestamp, timestamp),
      ];
      for (const mapId of mapIds) {
        const revision = revisionByMap.get(mapId);
        if (!revision) {
          statements.push(database.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, mode, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES (?, ?, 'selectable', NULL, ?, NULL, NULL, ?, NULL, ?, ?)").bind(`revision:${mapId}:${crypto.randomUUID()}`, mapId, mode, modeRevisionVersion, timestamp, timestamp));
        } else if (revision.lifecycle !== "selectable") {
          statements.push(database.prepare("UPDATE gameplay_revisions SET lifecycle = 'selectable', updated_at = ? WHERE id = ?").bind(timestamp, revision.id));
        }
      }
      for (const revision of modeRevisions) {
        if (!listed.has(revision.mapId) && revision.lifecycle === "selectable") {
          statements.push(database.prepare("UPDATE gameplay_revisions SET lifecycle = 'historical', updated_at = ? WHERE id = ?").bind(timestamp, revision.id));
        }
      }
      statements.push(database.prepare("UPDATE random_event_versions SET mode = NULL, updated_at = ? WHERE mode = ? AND game_version NOT IN (SELECT value FROM json_each(?))").bind(timestamp, mode, JSON.stringify(eventPools)));
      for (const pool of eventPools) {
        statements.push(database.prepare("INSERT INTO random_event_versions (game_version, availability, mode, created_at, updated_at) VALUES (?, 'available', ?, ?, ?) ON CONFLICT(game_version) DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at").bind(pool, mode, timestamp, timestamp));
      }
      const response: AdminStandaloneMode = { mode, mapIds, eventPools, eventWeightTotal: input.eventWeightTotal, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
      statements.push(
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "standalone_mode", mode, JSON.stringify({ previousEventWeightTotal: previous?.eventWeightTotal ?? null, eventWeightTotal: input.eventWeightTotal, previousMapIds: modeRevisions.filter((revision) => revision.lifecycle === "selectable").map((revision) => revision.mapId).sort(), mapIds, eventPools }), timestamp),
      );
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      for (const { challenge, rule } of await loadProgressChallenges()) {
        if (rule.mode === mode && !rule.mapIds) await reconcileProgressChallengePlayers({ challenge, rule, actorId: auth.subject });
      }
      return response;
    },


    ...createAgentServices(db, {
      database,
      now,
      platformCache,
      paginate,
      suspendedEventVersions: randomEventServices.suspendedEventVersions,
      listGlobalAgentTitles,
      loadChallengeMapIds,
      toAgentTitle,
      toPublicTitleChallenge,
      titleChallengeIsSubmittable,
    }),
    ...randomEventServices.services,
    ...createMapRevisionServices(database, db, {
      ...databaseServiceDependencies,
      insertDefaultMapTitleRuleAssignment,
      latestBuildVersion,
    }),
    ...createAdminMapServices(database, db, {
      ...databaseServiceDependencies,
      insertDefaultMapTitleRuleAssignment,
      latestBuildVersion,
      loadProgressChallenges,
    }),
    async listChallenges(input) {
      const items: Challenge[] = [];
      if (!input?.family || input.family === "map") {
        const rows = [...await platformCache.cached("catalog", "pub-challenge-map-rows", () => mapChallengeQuery())]
          .sort((left, right) => compareText(left.map.name, right.map.name) || compareText(left.challenge.name, right.challenge.name));
        items.push(...rows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
        const isPublicMapRow = (row: { status: string; gameVersion: string | null }): row is Extract<Challenge, { family: "map" }> =>
          (row.status === "active" || row.status === "sunsetting") && row.gameVersion !== null;
        items.push(...(await loadMapTitleRuleChallenges()).filter(isPublicMapRow));
        items.push(...(await loadMapScopedTitleChallenges()).filter(isPublicMapRow));
      }
      if (!input?.family || input.family === "achievement") {
        const rows = [...await platformCache.cached("catalog", "pub-challenge-title-rows:all", () => db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(eq(titleChallenges.status, "active"), eq(titleCatalog.lifecycle, "active"))))]
          .sort((left, right) => compareText(left.title.category, right.title.category) || compareText(left.title.label, right.title.label));
        const timestamp = now();
        items.push(...rows.flatMap(({ challenge, title }): Challenge[] => {
          const fields = publicTitleChallengeFields(challenge, title, timestamp);
          if (!fields || (challenge.scope ?? "global") === "map" && challenge.mapVariant) return [];
          return [{
            ...toTitleChallengeBase(challenge, title),
            ...fields,
          }];
        }));
      }
      return items;
    },
    listPublicAchievements,
    ...createAdminCatalogServices({
      database,
      db,
      now,
      evidenceBucket,
      uploadOrigin,
      replayOrConflict,
      recordIdempotency,
      recordAudit,
      titleIconVersionOf,
      toAgentTitle,
      insertDefaultMapTitleRuleAssignment,
      latestBuildVersion,
      assertProgressRuleTargets,
      reconcileProgressChallengePlayers,
      challengeCatalog: {
        enabledMapChallengeAssignment,
        loadChallengeMapIds,
        loadMapScopedTitleChallenges,
        loadMapTitleRuleChallenges,
        loadTitleChallengeRevisions,
        toPublicMapChallenge,
        toTitleChallengeBase,
        validateChallengeMapScope,
      },
      challengeSnapshot: { resolveMapTitleProjection },
    }),

    async listTitles(input) {
      const globalRows = await platformCache.cached("catalog", "public-global-title-rows", () => db.select().from(titleCatalog).where(and(eq(titleCatalog.scope, "global"), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion))).orderBy(titleCatalog.key));
      const globalTitles: Title[] = globalRows.map((row) => ({
        ...titleCatalogView(row),
        scope: "global",
        gameVersion: row.gameVersion!,
      }));
      if (!input.mapId) return globalTitles;
      const mapId = input.mapId;
      const [mapRows, customCandidates, mapIdsByChallenge] = await Promise.all([
        platformCache.cached("catalog", `map-reward-rows:${mapId}`, () => db.select({ title: titleCatalog, reward: mapTitleRewards })
          .from(mapTitleRewards)
          .innerJoin(titleCatalog, eq(mapTitleRewards.titleKey, titleCatalog.key))
          .where(and(eq(mapTitleRewards.mapId, mapId), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion))).orderBy(titleCatalog.key)),
        platformCache.cached("catalog", "map-custom-title-rows", () => db.select({ title: titleCatalog, challenge: titleChallenges })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(eq(titleChallenges.scope, "map"), eq(titleCatalog.scope, "map"), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion)))),
        loadChallengeMapIds(),
      ]);
      const customMapRows = customCandidates.filter((row) => {
        const targets = mapIdsByChallenge.get(row.challenge.id) ?? [];
        return !targets.length || targets.some((mapId) => mapId === input.mapId);
      });
      const mappedTitles = mapRows.map(({ title, reward }): Title => ({
        ...titleCatalogView(title),
        scope: "map",
        mapId: input.mapId,
        slot: reward.slot as Title["slot"],
        pioneerPrefixes: JSON.parse(reward.pioneerPrefixesJson) as string[],
        gameVersion: title.gameVersion!,
      }));
      const mappedKeys = new Set(mappedTitles.map((title) => title.titleKey));
      const timestamp = now();
      const customTitles = customMapRows.flatMap(({ title, challenge }): Title[] => {
        if (mappedKeys.has(title.key) || !titleChallengeIsSubmittable(challenge.status, challenge.startsAt, challenge.endsAt, timestamp, challenge.gameVersion)) return [];
        mappedKeys.add(title.key);
        return [{ ...titleCatalogView(title), scope: "map", mapId: input.mapId, gameVersion: title.gameVersion! }];
      });
      // A title with active grants on this map must keep a resolvable definition
      // regardless of whether its acquisition path (Pioneer window, scheduled
      // challenge) is currently open: the window gates submission eligibility,
      // not the definition that holder records reference. A title key is one
      // definition across maps, so availability comes from the catalog, never
      // from this map's window.
      const grantedRows = await platformCache.cached("grants", `map-granted-title-rows:${mapId}`, () => db.select({
        title: titleCatalog,
        slot: playerTitleGrants.slot,
      })
        .from(playerTitleGrants)
        .innerJoin(titleCatalog, and(eq(playerTitleGrants.titleKey, titleCatalog.key), eq(titleCatalog.scope, "map"), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion)))
        .where(and(eq(playerTitleGrants.status, "active"), eq(playerTitleGrants.mapId, mapId)))
        .orderBy(titleCatalog.key, playerTitleGrants.slot));
      const grantedByKey = new globalThis.Map<string, { title: typeof titleCatalog.$inferSelect; slot: string | null }>();
      for (const row of grantedRows) {
        const existing = grantedByKey.get(row.title.key);
        if (existing) existing.slot ??= row.slot;
        else grantedByKey.set(row.title.key, { title: row.title, slot: row.slot });
      }
      const grantedTitles = [...grantedByKey.values()].flatMap(({ title, slot }): Title[] => {
        if (mappedKeys.has(title.key)) return [];
        mappedKeys.add(title.key);
        return [{
          ...titleCatalogView(title),
          scope: "map",
          mapId,
          ...(slot ? { slot: slot as Title["slot"] } : {}),
          pioneerPrefixes: [],
          gameVersion: title.gameVersion!,
        }];
      });
      return globalTitles.concat(mappedTitles, customTitles, grantedTitles);
    },

    ...createPlayerTitleServices(database, db, {
      ...databaseServiceDependencies,
      getCurrentPortalPlayer,
      findEquipableGrantIds,
      resolveManualTitleGrantTarget,
    }),

    ...createPlayerUploadServices({ database, db, evidenceBucket, uploadOrigin, ocrQueue, now, getCurrentPortalPlayer, hashRequest, logOcrEvent, errorDetails }),

    async listAdminSubmissions(input) {
      const conditions = input.statuses?.length ? [inArray(submissions.status, input.statuses)] : [];
      if (input.playerAccountId) conditions.push(eq(submissions.playerAccountId, input.playerAccountId));
      if (input.spotCheck) {
        const spotChecks = await db.select({ submissionId: submissionSpotChecks.submissionId }).from(submissionSpotChecks).where(eq(submissionSpotChecks.status, input.spotCheck));
        conditions.push(spotChecks.length ? inArray(submissions.id, spotChecks.map(({ submissionId }) => submissionId)) : eq(submissions.id, "__no_matching_spot_check__"));
      }
      if (input.mode) {
        // The mode is read from each submission's latest recognition and matched the same tolerant way
        // as at decision time, so a misread label still belongs to the mode it nearly spells.
        const [candidates, knownModes] = await Promise.all([
          db.select({ id: submissions.id, mode: sql<string | null>`(SELECT json_extract(response_json, '$.data.mode') FROM ocr_results WHERE submission_id = "submissions"."id" AND response_json IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1)` })
            .from(submissions).where(conditions.length ? and(...conditions) : undefined),
          db.select({ mode: standaloneModes.mode }).from(standaloneModes),
        ]);
        const known = knownModes.map((row) => row.mode);
        const matching = candidates.filter((candidate) => {
          const matched = matchGameMode(candidate.mode, known).mode;
          return input.mode === "regular" ? !matched || matched.includes(regularGameModeLabel) : matched === normalizeGameMode(input.mode);
        }).map((candidate) => candidate.id);
        conditions.push(matching.length ? sql`${submissions.id} IN (SELECT value FROM json_each(${JSON.stringify(matching)}))` : eq(submissions.id, "__no_matching_mode__"));
      }
      const condition = conditions.length ? and(...conditions) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db.select().from(submissions).where(condition).orderBy(...(input.order === "oldest" ? [asc(submissions.updatedAt), asc(submissions.id)] : [desc(submissions.updatedAt), desc(submissions.id)])).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize),
        db.select({ total: count() }).from(submissions).where(condition),
      ]);
      const visibleRows = rows.slice(0, input.pageSize);
      const details = await resolveAdminSubmissionDetails(visibleRows);
      return { contractVersion: "1" as const, items: visibleRows.map((row) => asAdminSubmission(row, details)), page: input.page, pageSize: input.pageSize, total, hasMore: rows.length > input.pageSize };
    },

    async getAdminSubmission(input) {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      return loadAdminSubmission(row);
    },

    async requestAdminOcr(input, auth, idempotencyKey, requestId): Promise<AdminSubmissionOcrRetryResponse> {
      const idempotencyRecordId = `${auth.subject}:submission.ocr.retry:${idempotencyKey}`;
      const requestHash = await hashRequest(input);
      const existingIdempotency = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyRecordId)).get();
      if (existingIdempotency) {
        if (existingIdempotency.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        if (existingIdempotency.responseJson.startsWith(ocrRetryEnqueueingPrefix)) throw new Error("OCR_RETRY_IN_PROGRESS");
        return JSON.parse(existingIdempotency.responseJson) as AdminSubmissionOcrRetryResponse;
      }
      if (!ocrQueue) throw new Error("OCR_NOT_CONFIGURED");
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const attachment = await db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, row.id)).orderBy(desc(attachments.createdAt)).limit(1).get();
      if (!attachment?.objectKey) throw new Error("EVIDENCE_NOT_FOUND");

      const latestResult = await db.select({ id: ocrResults.id, errorCode: ocrResults.errorCode, createdAt: ocrResults.createdAt })
        .from(ocrResults)
        .where(eq(ocrResults.submissionId, row.id))
        .orderBy(desc(ocrResults.createdAt), desc(ocrResults.id))
        .limit(1)
        .get();
      if (row.status === "ocr_pending" && latestResult?.errorCode !== "OCR_QUEUE_SEND_FAILED") throw new Error("OCR_RETRY_IN_PROGRESS");

      const timestamp = Math.max(now(), row.updatedAt + 1, (latestResult?.createdAt ?? 0) + 1);
      const pendingResultId = crypto.randomUUID();
      const enqueueingMarker = `${ocrRetryEnqueueingPrefix}${pendingResultId}`;
      const response: AdminSubmissionOcrRetryResponse = { contractVersion: "1", submissionId: row.id, status: "ocr_pending" };
      const correlationId = requestId ?? crypto.randomUUID();
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.ocr.retry', ?, ?, ?)").bind(idempotencyRecordId, auth.subject, requestHash, enqueueingMarker, timestamp),
        database.prepare(`UPDATE submissions SET status = 'ocr_pending', review_reason = NULL, updated_at = ?
          WHERE id = ? AND status = ? AND updated_at = ? AND changes() = 1
            AND (? != 'ocr_pending' OR EXISTS (
              SELECT 1 FROM ocr_results WHERE id = ? AND status = 'error' AND error_code = 'OCR_QUEUE_SEND_FAILED'
            ))`).bind(timestamp, row.id, row.status, row.updatedAt, row.status, latestResult?.id ?? ""),
        database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, manual, created_at) SELECT ?, ?, 0, 'pending', 1, ? WHERE changes() = 1").bind(pendingResultId, row.id, timestamp),
        database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at)
          SELECT ?, ?, ?, ?, 'submission.ocr.retry', 'submission', ?, ?, ? WHERE changes() = 1`).bind(crypto.randomUUID(), correlationId, auth.actorType, auth.subject, row.id, JSON.stringify({ manual: true }), timestamp),
        database.prepare("DELETE FROM idempotency_keys WHERE id = ? AND response_json = ? AND changes() = 0").bind(idempotencyRecordId, enqueueingMarker),
      ]);
      const pendingResult = await db.select({ id: ocrResults.id }).from(ocrResults).where(eq(ocrResults.id, pendingResultId)).get();
      if (!pendingResult) {
        const racedIdempotency = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyRecordId)).get();
        if (racedIdempotency) {
          if (racedIdempotency.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
          if (racedIdempotency.responseJson.startsWith(ocrRetryEnqueueingPrefix)) throw new Error("OCR_RETRY_IN_PROGRESS");
          return JSON.parse(racedIdempotency.responseJson) as AdminSubmissionOcrRetryResponse;
        }
        throw new Error("OCR_RETRY_IN_PROGRESS");
      }
      try {
        await ocrQueue.send({ version: 2, jobId: pendingResultId, submissionId: row.id, objectKey: attachment.objectKey, manual: true, ...(requestId ? { requestId } : {}) });
        logOcrEvent("job_enqueued", { submissionId: row.id, attempt: 0, manual: true, requestId: requestId ?? null });
      } catch (error) {
        logOcrEvent("job_enqueue_failed", { submissionId: row.id, attempt: 0, manual: true, requestId: requestId ?? null, ...errorDetails(error) });
        const failedAt = Math.max(now(), timestamp + 1);
        try {
          await database.batch([
            database.prepare("UPDATE ocr_results SET status = 'error', error_code = 'OCR_QUEUE_SEND_FAILED', created_at = ? WHERE id = ? AND status = 'pending'").bind(failedAt, pendingResultId),
            database.prepare(`UPDATE submissions SET status = ?, review_reason = ?, updated_at = ?
              WHERE id = ? AND status = 'ocr_pending' AND updated_at = ?
                AND EXISTS (SELECT 1 FROM ocr_results WHERE id = ? AND status = 'error' AND error_code = 'OCR_QUEUE_SEND_FAILED')`)
              .bind(row.status, row.reviewReason, failedAt, row.id, timestamp, pendingResultId),
            database.prepare("DELETE FROM idempotency_keys WHERE id = ? AND response_json = ?").bind(idempotencyRecordId, enqueueingMarker),
          ]);
        } catch (recoveryError) {
          logOcrEvent("job_enqueue_recovery_failed", { submissionId: row.id, attempt: 0, manual: true, requestId: requestId ?? null, ...errorDetails(recoveryError) });
        }
        throw error;
      }
      const finalizedIdempotency = await database.prepare("UPDATE idempotency_keys SET response_json = ? WHERE id = ? AND response_json = ?")
        .bind(JSON.stringify(response), idempotencyRecordId, enqueueingMarker)
        .run();
      if (Number(finalizedIdempotency.meta.changes) !== 1) throw new Error("OCR_RETRY_IDEMPOTENCY_FINALIZE_FAILED");
      return response;
    },

    async reevaluateAdminSubmissionOcr(input, auth, idempotencyKey): Promise<AdminSubmissionOcrReevaluateResponse> {
      const operation = "submission.ocr.reevaluate";
      const replay = await replayOrConflict<AdminSubmissionOcrReevaluateResponse>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "ocr_review_required") throw new Error("SUBMISSION_NOT_REEVALUABLE");
      const latest = await db.select({ responseJson: ocrResults.responseJson }).from(ocrResults)
        .where(and(eq(ocrResults.submissionId, row.id), eq(ocrResults.status, "review_required")))
        .orderBy(desc(ocrResults.createdAt), desc(ocrResults.id)).limit(1).get();
      let stored: OcrResponse | null = null;
      try { stored = latest?.responseJson ? JSON.parse(latest.responseJson) as OcrResponse : null; } catch { stored = null; }
      if (!stored) throw new Error("SUBMISSION_NOT_REEVALUABLE");

      // Re-run the decision from the stored recognition (no OCRKit call): reopen the
      // submission as pending with a fresh result row, then let the normal completion
      // path decide again against today's catalog, modes and revisions.
      const timestamp = Math.max(now(), row.updatedAt + 1);
      const pendingResultId = crypto.randomUUID();
      await database.batch([
        database.prepare("UPDATE submissions SET status = 'ocr_pending', review_reason = NULL, updated_at = ? WHERE id = ? AND status = 'ocr_review_required' AND updated_at = ?").bind(timestamp, row.id, row.updatedAt),
        database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, manual, created_at) SELECT ?, ?, 0, 'pending', 1, ? WHERE changes() = 1").bind(pendingResultId, row.id, timestamp),
        database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at)
          SELECT ?, ?, ?, ?, ?, 'submission', ?, '{}', ? WHERE changes() = 1`).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, row.id, timestamp),
      ]);
      const reopened = await db.select({ id: ocrResults.id }).from(ocrResults).where(eq(ocrResults.id, pendingResultId)).get();
      if (!reopened) throw new Error("SUBMISSION_NOT_REEVALUABLE");
      await completeOcrResult({ ...row, status: "ocr_pending", reviewReason: null, updatedAt: timestamp }, stored, { requestId: pendingResultId, attempt: 0, manual: true });
      const after = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, row.id)).get();
      const response: AdminSubmissionOcrReevaluateResponse = { contractVersion: "1", submissionId: row.id, status: after?.status ?? "ocr_pending" };
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
      return response;
    },

    async reopenAdminSubmission(input, auth, idempotencyKey): Promise<AdminSubmissionReopenResponse> {
      const operation = "submission.reopen";
      const replay = await replayOrConflict<AdminSubmissionReopenResponse>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) {
        if (replay.verifiedRunId) await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [replay.verifiedRunId], actorId: auth.subject, reason: submissionReopenedReason });
        return replay;
      }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "approved") throw new Error("SUBMISSION_NOT_REOPENABLE");
      const grants = await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceId, row.id), inArray(playerTitleGrants.sourceType, ["automatic", "submission"]), eq(playerTitleGrants.status, "active")));
      const run = await db.select().from(verifiedRuns).where(and(eq(verifiedRuns.sourceSubmissionId, row.id), eq(verifiedRuns.status, "active"))).get();
      const timestamp = Math.max(now(), row.updatedAt + 1);
      const reason = input.reason ?? submissionReopenedReason;
      const response: AdminSubmissionReopenResponse = { contractVersion: "1", submissionId: row.id, status: "ocr_review_required", revokedGrantCount: grants.length, verifiedRunId: run?.id ?? null };
      const reopened = "EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_review_required' AND updated_at = ?)";
      // Everything the approval produced is withdrawn in one batch and the submission returns to
      // review as if freshly held; re-approving it re-derives the revision, challenge and rewards
      // from the corrected evidence.
      await database.batch([
        database.prepare("UPDATE submissions SET status = 'ocr_review_required', review_reason = ?, challenge_id = NULL, grant_id = NULL, target_map_id = NULL, gameplay_revision_id = NULL, rule_snapshot_json = NULL, updated_at = ? WHERE id = ? AND status = 'approved' AND updated_at = ?")
          .bind("管理员重新打开核对", timestamp, row.id, row.updatedAt),
        database.prepare(`UPDATE challenge_completions SET status = 'invalidated', invalidated_by = ?, invalidated_at = ?, invalidation_reason = ? WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'active' AND ${reopened}`)
          .bind(auth.subject, timestamp, reason, row.id, row.id, timestamp),
        database.prepare(`UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = ?, revoked_at = ?, revoke_reason = ?
          WHERE status = 'active' AND ((source_id = ? AND source_type IN ('automatic', 'submission')) OR completion_id IN (SELECT id FROM challenge_completions WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'invalidated'))
          AND ${reopened}`).bind(auth.subject, timestamp, reason, row.id, row.id, row.id, timestamp),
        // Withdrawn rows keep their history but release the per-submission uniqueness keys, so re-approval can issue fresh ones.
        database.prepare(`UPDATE player_title_grants SET source_id = source_id || ? WHERE source_id = ? AND source_type IN ('automatic', 'submission') AND status = 'revoked' AND ${reopened}`).bind(`#reopened-${timestamp}`, row.id, row.id, timestamp),
        database.prepare(`UPDATE challenge_completions SET source_id = source_id || ? WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'invalidated' AND ${reopened}`).bind(`#reopened-${timestamp}`, row.id, row.id, timestamp),
        database.prepare(`UPDATE mastery_runs SET status = 'invalidated', invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE source_submission_id = ? AND status = 'active' AND ${reopened}`)
          .bind(timestamp, auth.subject, submissionReopenedReason, row.id, row.id, timestamp),
        ...(run ? [database.prepare(`INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) SELECT ?, ?, 'invalidated', ?, ?, ?, ? WHERE ${reopened}`)
          .bind(crypto.randomUUID(), run.id, auth.actorType, auth.subject, reason, timestamp, row.id, timestamp)] : []),
        database.prepare(`UPDATE submission_outcomes SET status = 'invalidated', updated_at = ? WHERE submission_id = ? AND status IN ('created', 'reused') AND ${reopened}`).bind(timestamp, row.id, row.id, timestamp),
        ...grants.map((grant) => database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'title_grant.revoke', 'player_title_grant', ?, ?, ? WHERE ${reopened}`)
          .bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grant.id, JSON.stringify({ submissionId: row.id, titleKey: grant.titleKey, action: "submission_reopened" }), timestamp, row.id, timestamp)),
        database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, 'submission', ?, ?, ? WHERE ${reopened}`)
          .bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, row.id, JSON.stringify({ revokedGrantCount: grants.length, verifiedRunId: run?.id ?? null, reason: input.reason ?? null }), timestamp, row.id, timestamp),
      ] as [D1PreparedStatement, ...D1PreparedStatement[]]);
      const after = await db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, row.id)).get();
      if (after?.status !== "ocr_review_required") throw new Error("SUBMISSION_NOT_REOPENABLE");
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
      if (run) await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [run.id], actorId: auth.subject, reason: submissionReopenedReason });
      return response;
    },

    async resolveAdminSubmissionSpotCheck(input, auth, idempotencyKey): Promise<AdminSubmissionSpotCheckResponse> {
      const replay = await replayOrConflict<AdminSubmissionSpotCheckResponse>(db, auth.subject, "submission.spot_check.resolve", idempotencyKey, input);
      if (replay) {
        // The resolution batch already persisted idempotency, so a replay is
        // the only retry that can rerun the post-commit reconciliation after
        // a failed first attempt.
        if (input.decision === "revoked" && replay.verifiedRunId) {
          await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [replay.verifiedRunId], actorId: auth.subject, reason: input.reason });
        }
        return replay;
      }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const spotCheck = await db.select().from(submissionSpotChecks).where(eq(submissionSpotChecks.submissionId, row.id)).get();
      if (!spotCheck) throw new Error("SPOT_CHECK_NOT_FOUND");
      if (spotCheck.status !== "pending") throw new Error("SPOT_CHECK_ALREADY_RESOLVED");
      const timestamp = now();
      const grants = input.decision === "revoked"
        ? await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceId, row.id), inArray(playerTitleGrants.sourceType, ["automatic", "submission"]), eq(playerTitleGrants.status, "active")))
        : [];
      const verifiedRunOutcome = await loadVerifiedRunSubmissionOutcome(row.id);
      const verifiedRun = input.decision === "revoked" && verifiedRunOutcome?.status === "created" && verifiedRunOutcome.verifiedRunId
        ? await db.select().from(verifiedRuns).where(and(eq(verifiedRuns.id, verifiedRunOutcome.verifiedRunId), eq(verifiedRuns.sourceSubmissionId, row.id), eq(verifiedRuns.status, "active"))).get()
        : null;
      if (input.decision === "revoked" && !grants.length && !verifiedRunOutcome) throw new Error("SUBMISSION_OUTCOME_NOT_FOUND");
      const response: AdminSubmissionSpotCheckResponse = { contractVersion: "1", submissionId: row.id, status: input.decision, grantId: row.grantId ?? null, verifiedRunId: verifiedRunOutcome?.verifiedRunId ?? null };
      const idempotencyKeyId = `${auth.subject}:submission.spot_check.resolve:${idempotencyKey}`;
      const requestHash = await hashRequest(input);
      const statements: D1PreparedStatement[] = [
        ...(input.decision === "revoked" ? [database.prepare("UPDATE challenge_completions SET status = 'invalidated', invalidated_by = ?, invalidated_at = ?, invalidation_reason = ? WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'active'").bind(auth.subject, timestamp, input.reason ?? "抽检判定称号完成证据无效", row.id)] : []),
        ...(input.decision === "revoked" ? [database.prepare("UPDATE player_title_grants SET status = 'revoked', revocation_type = 'evidence', revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE status = 'active' AND ((source_id = ? AND source_type IN ('automatic', 'submission')) OR completion_id IN (SELECT id FROM challenge_completions WHERE source_id = ? AND source_type IN ('submission', 'challenge_satisfies') AND status = 'invalidated'))").bind(auth.subject, timestamp, input.reason ?? "抽检撤销自动授予的称号", row.id, row.id)] : []),
        ...(input.decision === "revoked" && verifiedRun ? [
          database.prepare("UPDATE mastery_runs SET status = 'invalidated', invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ? AND status = 'active'").bind(timestamp, auth.subject, input.reason ?? "抽检判定证据无效", verifiedRun.id),
          database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, 'invalidated', ?, ?, ?, ?)").bind(crypto.randomUUID(), verifiedRun.id, auth.actorType, auth.subject, input.reason ?? "抽检判定证据无效", timestamp),
          database.prepare("UPDATE submission_outcomes SET status = 'invalidated', updated_at = ? WHERE submission_id = ? AND outcome_key = 'verified_run' AND status = 'created'").bind(timestamp, row.id),
        ] : []),
        database.prepare("UPDATE submission_spot_checks SET status = ?, resolved_at = ?, reviewer = ?, reason = ? WHERE submission_id = ? AND status = 'pending'").bind(input.decision, timestamp, auth.subject, input.reason ?? null, row.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.spot_check.resolve', ?, ?, ?)").bind(idempotencyKeyId, auth.subject, requestHash, JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, input.decision === "revoked" ? "submission.spot_check.revoked" : "submission.spot_check.confirmed", row.id, JSON.stringify({ decision: input.decision, reason: input.reason ?? null, grantId: row.grantId ?? null, verifiedRunId: verifiedRunOutcome?.verifiedRunId ?? null, masteryInvalidated: Boolean(verifiedRun) }), timestamp),
        ...grants.map((grant) => database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'title_grant.revoke', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grant.id, JSON.stringify({ submissionId: row.id, reason: input.reason ?? "抽检撤销自动授予的称号", sourceType: grant.sourceType, revocationType: "evidence" }), timestamp)),
        ...(input.decision === "revoked" && verifiedRun ? [database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'mastery_run.invalidate', 'verified_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, verifiedRun.id, JSON.stringify({ submissionId: row.id, reason: input.reason ?? "抽检判定证据无效" }), timestamp)] : []),
      ];
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      if (input.decision === "revoked" && verifiedRun) await reconcileVerifiedRunProgressChallenges({ verifiedRunIds: [verifiedRun.id], actorId: auth.subject, reason: input.reason });
      return response;
    },

    async getPlayerSubmission(input, sessionToken) {
      const { submission } = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      const [result, attachment, grantRow, verifiedRunOutcome] = await Promise.all([
        db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get(),
        db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, submission.id)).orderBy(desc(attachments.createdAt)).limit(1).get(),
        submission.grantId
          ? db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name }).from(playerTitleGrants).innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(playerTitleGrants.mapId, maps.id)).where(eq(playerTitleGrants.id, submission.grantId)).get()
          : Promise.resolve(null),
        loadVerifiedRunSubmissionOutcome(submission.id),
      ]);
      const raw = result?.responseJson ? JSON.parse(result.responseJson) as OcrResponse : null;
      const feedback = raw && result && ocrFeedbackEligibleStatuses.has(submission.status)
        ? await buildPlayerOcrFeedbackState(submission.id, result)
        : null;
      return {
        contractVersion: "1" as const,
        submissionId: submission.id,
        status: playerSubmissionStatus(submission.status),
        resubmissionRequired: submission.status === "resubmission_required",
        mapName: submission.mapName,
        challengeId: submission.challengeId ?? undefined,
        difficulty: submission.difficulty ?? undefined,
        reason: submission.status === "ocr_review_required" ? submission.reviewReason === playerManualReviewReason ? "已提交处理申请，请稍后查看结果。" : undefined : submission.reviewReason ?? undefined,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        evidenceUrl: publicEvidenceUrl(attachment?.objectKey),
        ocrFailCount: submission.ocrFailCount,
        manualReviewEligible: submission.status === "resubmission_required" && submission.ocrFailCount >= ocrManualReviewThreshold,
        ...(raw ? { ocr: { mapName: raw.data?.map_name ?? null, difficulty: raw.data?.difficulty ?? null, playerName: raw.data?.viewer_player ?? null, challengeCompleted: raw.data?.challenge_completed ?? null, achievementTitles: raw.data?.achievement_titles ?? [], ...(raw.model_version ? { modelVersion: raw.model_version } : {}) } } : {}),
        ...(feedback ? { feedback } : {}),
        ...(grantRow?.grant.status === "active" ? { titleGrant: { grantId: grantRow.grant.id, titleKey: grantRow.title.key, titleName: grantRow.title.label, ...(grantRow.mapName ? { mapName: grantRow.mapName } : {}) } } : {}),
        ...playerVerifiedRunSubmissionOutcomeFields(verifiedRunOutcome),
      };
    },

    async submitPlayerOcrFeedback(input: Omit<OcrAccuracyFeedbackRequest, "contractVersion"> & { submissionId: string }, sessionToken: string, idempotencyKey: string): Promise<OcrAccuracyFeedbackResponse> {
      const { player, submission } = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      const replay = await replayOrConflict<OcrAccuracyFeedbackResponse>(db, player.player.id, "ocr.accuracy.mark", idempotencyKey, input);
      if (replay) return { ...replay, alreadySubmitted: true };
      if (!ocrFeedbackEligibleStatuses.has(submission.status)) throw new Error("OCR_FEEDBACK_UNAVAILABLE");
      const result = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt), desc(ocrResults.id)).limit(1).get();
      if (!result?.responseJson) throw new Error("OCR_RESULT_NOT_FOUND");
      if (result.id !== input.ocrResultId) throw new Error("OCR_PROMPT_STALE");
      const existing = await db.select({ accuracy: ocrAccuracyFeedback.accuracy }).from(ocrAccuracyFeedback).where(and(eq(ocrAccuracyFeedback.submissionId, submission.id), eq(ocrAccuracyFeedback.ocrResultId, result.id))).get();
      const timestamp = now();
      const responseBody: OcrAccuracyFeedbackResponse = { contractVersion: "1", submissionId: submission.id, ocrResultId: result.id, accuracy: input.accuracy, alreadySubmitted: false };
      const statements: D1PreparedStatement[] = [
        database.prepare(
          `INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'player', ?, ?)
           ON CONFLICT(submission_id, ocr_result_id) DO UPDATE SET accuracy = excluded.accuracy, marked_by = excluded.marked_by, marked_by_type = excluded.marked_by_type, updated_at = excluded.updated_at`
        ).bind(crypto.randomUUID(), submission.id, result.id, input.accuracy, player.player.playerId, timestamp, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'ocr.accuracy.mark', ?, ?, ?)").bind(`${player.player.id}:ocr.accuracy.mark:${idempotencyKey}`, player.player.id, await hashRequest(input), JSON.stringify(responseBody), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, 'user', ?, 'ocr.accuracy.marked', 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), player.player.id, submission.id, JSON.stringify({ ocrResultId: result.id, accuracy: input.accuracy }), timestamp),
      ];
      await database.batch(statements);
      return { ...responseBody, alreadySubmitted: existing?.accuracy === input.accuracy };
    },

    // Maintainers mark the same shared mark on a specific recognition result;
    // the latest writer wins regardless of actor type (#253).
    async submitAdminOcrAccuracy(input: Omit<OcrAccuracyFeedbackRequest, "contractVersion"> & { submissionId: string }, auth: AuthContext, idempotencyKey: string): Promise<OcrAccuracyFeedbackResponse> {
      const replay = await replayOrConflict<OcrAccuracyFeedbackResponse>(db, auth.subject, "ocr.accuracy.mark", idempotencyKey, input);
      if (replay) return { ...replay, alreadySubmitted: true };
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const result = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, row.id)).orderBy(desc(ocrResults.createdAt), desc(ocrResults.id)).limit(1).get();
      if (!result?.responseJson) throw new Error("OCR_RESULT_NOT_FOUND");
      if (result.id !== input.ocrResultId) throw new Error("OCR_PROMPT_STALE");
      const existing = await db.select({ accuracy: ocrAccuracyFeedback.accuracy }).from(ocrAccuracyFeedback).where(and(eq(ocrAccuracyFeedback.submissionId, row.id), eq(ocrAccuracyFeedback.ocrResultId, result.id))).get();
      const timestamp = now();
      const responseBody: OcrAccuracyFeedbackResponse = { contractVersion: "1", submissionId: row.id, ocrResultId: result.id, accuracy: input.accuracy, alreadySubmitted: false };
      const statements: D1PreparedStatement[] = [
        database.prepare(
          `INSERT INTO ocr_accuracy_feedback (id, submission_id, ocr_result_id, accuracy, marked_by, marked_by_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'maintainer', ?, ?)
           ON CONFLICT(submission_id, ocr_result_id) DO UPDATE SET accuracy = excluded.accuracy, marked_by = excluded.marked_by, marked_by_type = excluded.marked_by_type, updated_at = excluded.updated_at`
        ).bind(crypto.randomUUID(), row.id, result.id, input.accuracy, auth.subject, timestamp, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'ocr.accuracy.mark', ?, ?, ?)").bind(`${auth.subject}:ocr.accuracy.mark:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(responseBody), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'ocr.accuracy.marked', 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, row.id, JSON.stringify({ ocrResultId: result.id, accuracy: input.accuracy }), timestamp),
      ];
      await database.batch(statements);
      return { ...responseBody, alreadySubmitted: existing?.accuracy === input.accuracy };
    },

    // ---- Immutable screenshot sets for OCRKit training (#255) ----

    async listAdminScreenshotSetCandidates(input: { page: number; pageSize: number }, _auth: AuthContext): Promise<AdminScreenshotSetCandidateListResponse> {
      const { candidates } = await loadScreenshotSetEligibility();
      const page = Math.max(input.page, 1);
      const pageSize = Math.min(Math.max(input.pageSize, 1), 100);
      const total = candidates.length;
      return {
        contractVersion: "1",
        items: candidates.slice((page - 1) * pageSize, page * pageSize).map((candidate) => ({
          sourceId: candidate.sourceId,
          submissionId: candidate.submissionId,
          mapName: candidate.mapName,
          submissionStatus: candidate.submissionStatus,
          accuracy: candidate.accuracy,
          layoutVersion: candidate.layoutVersion,
          mimeType: candidate.mimeType,
          sizeBytes: candidate.sizeBytes,
          evidenceUrl: publicEvidenceUrl(candidate.objectKey),
        })),
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      };
    },

    async createAdminScreenshotSet(input: Omit<AdminScreenshotSetCreateRequest, "contractVersion">, auth: AuthContext, idempotencyKey: string): Promise<AdminScreenshotSetCreateResponse> {
      const replay = await replayOrConflict<AdminScreenshotSetCreateResponse>(db, auth.subject, "screenshot_set.draft.create", idempotencyKey, input);
      if (replay) return replay;
      const eligibility = await loadScreenshotSetEligibility();
      const excludedSourceIds = new Set(input.excludedSourceIds ?? []);
      const candidateIds = new Set(eligibility.candidates.map((candidate) => candidate.sourceId));
      if ([...excludedSourceIds].some((sourceId) => !candidateIds.has(sourceId))) throw new Error("SCREENSHOT_SET_EXCLUSION_INVALID");
      const members = eligibility.candidates.filter((candidate) => !excludedSourceIds.has(candidate.sourceId));
      const exclusions = [
        ...eligibility.exclusions,
        ...eligibility.candidates.filter((candidate) => excludedSourceIds.has(candidate.sourceId)).map((candidate) => ({ sourceId: candidate.sourceId, submissionId: candidate.submissionId, reason: "maintainer_excluded" })),
      ];
      const timestamp = now();
      const setId = crypto.randomUUID();
      const counts = { memberCount: members.length, excludedCount: exclusions.length };
      const eligibilityJson = JSON.stringify({ ...counts, exclusions });
      // Version is allocated inside the batch (MAX(version)+1 evaluated in the
      // same transaction), so concurrent creates cannot race a read-then-write
      // into a UNIQUE(version) 500. The audit and idempotency payloads read the
      // allocated version off the row the batch just wrote.
      const responseVersion = "(SELECT version FROM screenshot_sets WHERE id = ?)";
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT INTO screenshot_sets (id, version, status, created_by, created_at, note, eligibility_json) VALUES (?, (SELECT COALESCE(MAX(version), 0) + 1 FROM screenshot_sets), 'draft', ?, ?, ?, ?)").bind(setId, auth.subject, timestamp, input.note?.trim() ?? null, eligibilityJson),
        ...members.map((member, index) => database.prepare("INSERT INTO screenshot_set_members (set_id, source_id, position, submission_id, map_name, ocr_result_id, object_key, sha256, mime_type, size_bytes, layout_version, accuracy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(setId, member.sourceId, index, member.submissionId, member.mapName, member.ocrResultId, member.objectKey, member.sha256, member.mimeType, member.sizeBytes, member.layoutVersion, member.accuracy)),
        database.prepare(`INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'screenshot_set.draft.create', ?, json_object('contractVersion', '1', 'setId', ?, 'version', ${responseVersion}, 'status', 'draft', 'counts', json_object('memberCount', ?, 'excludedCount', ?)), ?)`).bind(`${auth.subject}:screenshot_set.draft.create:${idempotencyKey}`, auth.subject, await hashRequest(input), setId, setId, counts.memberCount, counts.excludedCount, timestamp),
        database.prepare(`INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'screenshot_set.draft.created', 'screenshot_set', ?, json_object('version', ${responseVersion}, 'memberCount', ?, 'excludedCount', ?, 'exclusions', json(?)), ?)`).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, setId, setId, counts.memberCount, counts.excludedCount, JSON.stringify(exclusions), timestamp),
      ];
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      const versionRow = await db.select({ version: screenshotSets.version }).from(screenshotSets).where(eq(screenshotSets.id, setId)).get();
      if (!versionRow) throw new Error("SCREENSHOT_SET_CREATE_FAILED");
      return { contractVersion: "1", setId, version: versionRow.version, status: "draft", counts };
    },

    async listAdminScreenshotSets(input: { page: number; pageSize: number; status?: ScreenshotSetStatus }, _auth: AuthContext): Promise<AdminScreenshotSetListResponse> {
      const page = input.page >= 1 ? input.page : 1;
      const pageSize = Math.min(Math.max(input.pageSize >= 1 ? input.pageSize : 20, 1), 100);
      const condition = input.status ? eq(screenshotSets.status, input.status) : undefined;
      const totalRow = await db.select({ total: count() }).from(screenshotSets).where(condition).get();
      const total = totalRow?.total ?? 0;
      const rows = await db.select().from(screenshotSets).where(condition).orderBy(desc(screenshotSets.createdAt)).limit(pageSize).offset((page - 1) * pageSize).all();
      const items: AdminScreenshotSetListResponse["items"] = rows.map((row) => {
        const eligibility = JSON.parse(row.eligibilityJson) as { memberCount: number; excludedCount: number };
        return {
          setId: row.id,
          version: row.version,
          status: row.status as ScreenshotSetStatus,
          createdBy: row.createdBy,
          createdAt: row.createdAt,
          finalizedBy: row.finalizedBy,
          finalizedAt: row.finalizedAt,
          discardedBy: row.discardedBy,
          discardedAt: row.discardedAt,
          note: row.note,
          counts: { memberCount: eligibility.memberCount, excludedCount: eligibility.excludedCount },
        };
      });
      return { contractVersion: "1", items, page, pageSize, total, hasMore: page * pageSize < total };
    },

    async getAdminScreenshotSet(input: { setId: string }, _auth: AuthContext): Promise<AdminScreenshotSetDetailResponse> {
      const set = await db.select().from(screenshotSets).where(eq(screenshotSets.id, input.setId)).get();
      if (!set) throw new Error("SCREENSHOT_SET_NOT_FOUND");
      const eligibility = JSON.parse(set.eligibilityJson) as { memberCount: number; excludedCount: number; exclusions?: Array<{ sourceId: string | null; submissionId: string; reason: string }> };
      const members = await db.select().from(screenshotSetMembers).where(eq(screenshotSetMembers.setId, set.id)).orderBy(asc(screenshotSetMembers.position)).all();
      return {
        contractVersion: "1",
        set: {
          setId: set.id,
          version: set.version,
          status: set.status as ScreenshotSetStatus,
          createdBy: set.createdBy,
          createdAt: set.createdAt,
          finalizedBy: set.finalizedBy,
          finalizedAt: set.finalizedAt,
          discardedBy: set.discardedBy,
          discardedAt: set.discardedAt,
          note: set.note,
          counts: { memberCount: eligibility.memberCount, excludedCount: eligibility.excludedCount },
        },
        members: members.map((member) => ({
          sourceId: member.sourceId,
          submissionId: member.submissionId,
          mapName: member.mapName,
          objectKey: member.objectKey,
          sha256: member.sha256,
          mimeType: member.mimeType,
          sizeBytes: member.sizeBytes,
          layoutVersion: member.layoutVersion,
          accuracy: member.accuracy as OcrAccuracyMark | null,
          evidenceUrl: publicEvidenceUrl(member.objectKey),
        })),
        exclusions: (eligibility.exclusions ?? []).map((exclusion) => ({ sourceId: exclusion.sourceId, submissionId: exclusion.submissionId, reason: exclusion.reason })),
      };
    },

    async finalizeAdminScreenshotSet(input: { setId: string; note?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminScreenshotSetFinalizeResponse> {
      const replay = await replayOrConflict<AdminScreenshotSetFinalizeResponse>(db, auth.subject, "screenshot_set.finalize", idempotencyKey, input);
      if (replay) return replay;
      const set = await db.select().from(screenshotSets).where(eq(screenshotSets.id, input.setId)).get();
      if (!set) throw new Error("SCREENSHOT_SET_NOT_FOUND");
      if (set.status !== "draft") throw new Error(set.status === "finalized" ? "SCREENSHOT_SET_ALREADY_FINALIZED" : "SCREENSHOT_SET_ALREADY_DISCARDED");
      const timestamp = now();
      const response: AdminScreenshotSetFinalizeResponse = { contractVersion: "1", setId: set.id, version: set.version, status: "finalized", finalizedAt: timestamp };
      const statements: D1PreparedStatement[] = [
        database.prepare("UPDATE screenshot_sets SET status = 'finalized', finalized_by = ?, finalized_at = ?, note = COALESCE(?, note) WHERE id = ? AND status = 'draft'").bind(auth.subject, timestamp, input.note?.trim() ?? null, set.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, 'screenshot_set.finalize', ?, ?, ? WHERE changes() = 1").bind(`${auth.subject}:screenshot_set.finalize:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'screenshot_set.finalized', 'screenshot_set', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, set.id, JSON.stringify({ version: set.version }), timestamp),
      ];
      const results = await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw new Error("SCREENSHOT_SET_NOT_DRAFT");
      return response;
    },

    // A draft that will not be used is discarded instead of left open forever:
    // discard closes the draft lifecycle without consuming the set as something
    // OCRKit could ever read. Discarded sets stay readable for audit.
    async discardAdminScreenshotSet(input: { setId: string; note?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminScreenshotSetDiscardResponse> {
      const replay = await replayOrConflict<AdminScreenshotSetDiscardResponse>(db, auth.subject, "screenshot_set.discard", idempotencyKey, input);
      if (replay) return replay;
      const set = await db.select().from(screenshotSets).where(eq(screenshotSets.id, input.setId)).get();
      if (!set) throw new Error("SCREENSHOT_SET_NOT_FOUND");
      if (set.status !== "draft") throw new Error(set.status === "finalized" ? "SCREENSHOT_SET_ALREADY_FINALIZED" : "SCREENSHOT_SET_ALREADY_DISCARDED");
      const timestamp = now();
      const response: AdminScreenshotSetDiscardResponse = { contractVersion: "1", setId: set.id, version: set.version, status: "discarded", discardedAt: timestamp };
      const statements: D1PreparedStatement[] = [
        database.prepare("UPDATE screenshot_sets SET status = 'discarded', discarded_by = ?, discarded_at = ?, note = COALESCE(?, note) WHERE id = ? AND status = 'draft'").bind(auth.subject, timestamp, input.note?.trim() ?? null, set.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, 'screenshot_set.discard', ?, ?, ? WHERE changes() = 1").bind(`${auth.subject}:screenshot_set.discard:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'screenshot_set.discarded', 'screenshot_set', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, set.id, JSON.stringify({ version: set.version }), timestamp),
      ];
      const results = await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      if (Number(results[0]?.meta?.changes ?? 0) !== 1) throw new Error("SCREENSHOT_SET_NOT_DRAFT");
      return response;
    },

    // Private, versioned OCRKit consumption contract. Reads only the frozen
    // member rows of finalized sets — never QQ identity, player-account
    // internals, Submission decisions, Grant/mastery state, or risk signals.
    async getOcrkitScreenshotSet(input: { version: number }): Promise<OcrkitScreenshotSetResponse> {
      const set = await db.select().from(screenshotSets).where(eq(screenshotSets.version, input.version)).get();
      if (!set) throw new Error("SCREENSHOT_SET_NOT_FOUND");
      if (set.status !== "finalized" || set.finalizedAt === null) throw new Error("SCREENSHOT_SET_NOT_FINALIZED");
      const members = await db.select().from(screenshotSetMembers).where(eq(screenshotSetMembers.setId, set.id)).orderBy(asc(screenshotSetMembers.position)).all();
      return {
        schema_version: 1,
        set_id: set.id,
        version: set.version,
        finalized: true,
        finalized_at: new Date(set.finalizedAt).toISOString(),
        members: members.map((member) => ({
          source_id: member.sourceId,
          object_key: member.objectKey,
          sha256: member.sha256,
          mime_type: member.mimeType,
          size_bytes: member.sizeBytes,
          layout_version: member.layoutVersion,
          accuracy: member.accuracy as OcrAccuracyMark | null,
        })),
      };
    },

    async requestManualReview(input, sessionToken) {
      const { submission } = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      if (submission.status === "ocr_review_required") return;
      if (submission.status !== "resubmission_required" || submission.ocrFailCount < ocrManualReviewThreshold) throw new Error("MANUAL_REVIEW_NOT_ELIGIBLE");
      const timestamp = now();
      await db.update(submissions).set({ status: "ocr_review_required", updatedAt: timestamp, reviewReason: playerManualReviewReason }).where(and(eq(submissions.id, submission.id), eq(submissions.status, "resubmission_required")));
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: "user", actorId: submission.id, operation: "submission.manual_review_requested", entityType: "submission", entityId: submission.id, payloadJson: JSON.stringify({ ocrFailCount: submission.ocrFailCount }), createdAt: timestamp });
    },

    async previewSubmissionReview(input, _auth): Promise<AdminSubmissionReviewPreviewResponse> {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const canonicalChallenges = planningCanonicalChallenges();
      const evidence = await planReviewedEvidence(row, input.fieldCorrections, input.confirmedChallengeIds);
      const selectionBasis = new globalThis.Map(evidence.selections.map((selection) => [selection.canonicalChallengeId, selection.basis]));
      const lowConfidence = new Set(evidence.decision.lowConfidence.map((candidate) => candidate.canonicalChallengeId));
      const evidenceFields = new Set<AdminSubmissionReviewCandidate["requiredFields"][number]>(["map_name", "difficulty", "challenge_completed", "map_variant", "achievement_titles"]);
      const asEvidenceFields = (fields: readonly string[]) => fields.filter((field): field is AdminSubmissionReviewCandidate["requiredFields"][number] => evidenceFields.has(field as AdminSubmissionReviewCandidate["requiredFields"][number]));
      const evidenceRank = { matched: 0, needs_confirmation: 1, unsupported: 2, not_matched: 3 } as const;
      const candidates = [...evidence.decision.candidates, ...evidence.linkable].map(({ challenge, canonicalChallengeId, evaluation, quality }): AdminSubmissionReviewCandidate => {
        const titleName = challenge.titleKey ? evidence.prepared.titleNamesByKey.get(challenge.titleKey) ?? null : null;
        const status: AdminSubmissionReviewCandidate["evidence"] = !evaluation.supported ? "unsupported" : evaluation.matched ? "matched" : lowConfidence.has(canonicalChallengeId) ? "needs_confirmation" : "not_matched";
        return {
          challengeId: canonicalChallengeId,
          family: challenge.family,
          kind: challenge.family === "map" ? challenge.kind : challenge.scope === "map" ? "map_title_achievement" : "title_achievement",
          label: challenge.family === "map" ? challenge.name : challenge.titleName,
          titleName,
          mapName: challenge.family === "map" ? challenge.mapName : null,
          difficulty: challenge.family === "map" ? challenge.difficulty ?? null : null,
          condition: challenge.condition ?? null,
          evidence: status,
          requiredFields: asEvidenceFields(evaluation.supported ? evaluation.requiredFields : quality.requiredFields),
          missingFields: asEvidenceFields(quality.reasons.flatMap((reason) => reason.endsWith(":missing_value") ? [reason.slice(0, -":missing_value".length)] : [])),
          selectedBy: selectionBasis.get(canonicalChallengeId) ?? null,
        };
      }).sort((left, right) => Number(right.selectedBy !== null) - Number(left.selectedBy !== null)
        || evidenceRank[left.evidence] - evidenceRank[right.evidence]
        || left.label.localeCompare(right.label, "zh-CN"));

      let blockingCode: string | null = evidence.ineligibleConfirmations.length ? "CHALLENGE_CONFIRMATION_INELIGIBLE" : null;
      let rewards: Awaited<ReturnType<typeof planApprovalRewards>> | null = null;
      if (!blockingCode && evidence.selections.length) {
        try { rewards = await planApprovalRewards(row, evidence.selections, now(), canonicalChallenges, evidence.prepared.canonicalChallengePlans); }
        catch (error) {
          const code = error instanceof Error ? error.message : "";
          if (!["CHALLENGE_REWARD_NOT_CONFIGURED", "GAMEPLAY_REVISION_NOT_FOUND", "SUBMISSION_REVISION_MISMATCH", "CHALLENGE_NOT_FOUND", "CHALLENGE_NOT_COMPLETABLE", "TITLE_GRANT_ADMINISTRATIVELY_REVOKED", "TITLE_NOT_FOUND"].includes(code)) throw error;
          blockingCode = code;
        }
      }

      const completionAwards = rewards?.completionAwardRows ?? [];
      const chainGrants = rewards ? [...rewards.completionGrantsByScope].filter(([scope]) => !rewards!.directGrantsByScope.has(scope)).map(([, award]) => award) : [];
      const titleKeys = [...new Set([...completionAwards.map((award) => award.titleKey), ...chainGrants.map((award) => award.titleKey)])];
      const mapIds = [...new Set([...completionAwards, ...chainGrants, ...(rewards?.grantResults.map(({ reward }) => reward) ?? [])].flatMap((item) => item.mapId ? [item.mapId] : []))];
      const [titleRows, mapRows] = await Promise.all([
        titleKeys.length ? db.select({ key: titleCatalog.key, label: titleCatalog.label }).from(titleCatalog).where(inArray(titleCatalog.key, titleKeys)) : Promise.resolve([] as Array<{ key: string; label: string }>),
        mapIds.length ? db.select({ id: maps.id, name: maps.name }).from(maps).where(inArray(maps.id, mapIds)) : Promise.resolve([] as Array<{ id: string; name: string }>),
      ]);
      const titleLabels = new globalThis.Map(titleRows.map(({ key, label }) => [key, label]));
      const mapNames = new globalThis.Map(mapRows.map(({ id, name }) => [id, name]));
      const completions = completionAwards.map((award) => ({
        challengeId: award.challengeId,
        titleKey: award.titleKey,
        titleName: titleLabels.get(award.titleKey) ?? award.titleKey,
        mapName: award.mapId ? mapNames.get(award.mapId) ?? null : null,
        basis: award.root ? selectionBasis.get(award.challengeId) ?? "conditions" : "satisfies" as const,
      }));
      const titles = [
        ...(rewards?.grantResults ?? []).map(({ reward, alreadyOwned }) => ({ titleKey: reward.titleKey, titleName: reward.titleName, mapName: reward.mapId ? mapNames.get(reward.mapId) ?? null : null, alreadyOwned })),
        ...chainGrants.map((award) => ({ titleKey: award.titleKey, titleName: titleLabels.get(award.titleKey) ?? award.titleKey, mapName: award.mapId ? mapNames.get(award.mapId) ?? null : null, alreadyOwned: false })),
      ];

      const [verifiedRunPlan, matchCodeCandidates, knownModeRows] = await Promise.all([
        planVerifiedRunSubmissionOutcome(row, evidence.correctedResponse, "submission_review", true, false, evidence.selections.length),
        listReviewMatchCodeCandidates(row, evidence.correctedResponse),
        db.select({ mode: standaloneModes.mode }).from(standaloneModes).orderBy(standaloneModes.mode).all(),
      ]);
      const verifiedRunAccepted = verifiedRunPlan.outcome.status === "created" || verifiedRunPlan.outcome.status === "reused";
      const verifiedRun = verifiedRunAccepted
        ? verifiedRunPlan.recorded
          ? { status: "recorded" as const, reason: null }
          : { status: "eligible" as const, reason: null }
        : { status: "ineligible" as const, reason: verifiedRunPlan.outcome.reason };
      const supersededFields = verifiedRunPlan.superseded?.conflictFields ?? [];
      if (!blockingCode && !evidence.selections.length) {
        const retainedGrants = await loadRetainedSubmissionGrants(row.id);
        if (retainedGrants.length) {
          const retainedMapIds = [...new Set(retainedGrants.flatMap((grant) => grant.mapId ? [grant.mapId] : []))];
          const retainedMapRows = retainedMapIds.length ? await db.select({ id: maps.id, name: maps.name }).from(maps).where(inArray(maps.id, retainedMapIds)) : [];
          const retainedMapNames = new globalThis.Map(retainedMapRows.map(({ id, name }) => [id, name]));
          titles.push(...retainedGrants.map((grant) => ({ titleKey: grant.titleKey, titleName: grant.titleName, mapName: grant.mapId ? retainedMapNames.get(grant.mapId) ?? null : null, alreadyOwned: true })));
        } else if (!verifiedRunAccepted) blockingCode = "SUBMISSION_OUTCOME_NOT_CONFIGURED";
      }
      return {
        contractVersion: "1",
        submissionId: row.id,
        evidenceOutcome: evidence.decision.outcome,
        candidates,
        completions,
        titles,
        verifiedRun: { ...verifiedRun, supersededFields },
        approvable: blockingCode === null,
        blockingCode,
        knownModes: knownModeRows.map((row) => row.mode),
        matchCodeCandidates,
      };
    },

    async reviewSubmission(input, auth, idempotencyKey): Promise<AdminSubmissionReviewResponse> {
      const replay = await replayOrConflict<AdminSubmissionReviewResponse>(db, auth.subject, "submission.review", idempotencyKey, input);
      if (replay) {
        // Approval may have committed before progress reconciliation failed.
        if (replay.decision === "approved") await reconcileReviewedSubmissionProgress(input.submissionId, auth.subject);
        return replay;
      }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      let reviewClaim: string | null = null;
      if (row.status === "ocr_pending") {
        const job = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, row.id)).orderBy(desc(ocrResults.createdAt), desc(ocrResults.id)).limit(1).get();
        if (job?.status === "pending") {
          const claimedAt = Math.max(now(), row.updatedAt + 1);
          const claimed = await database.batch([
            database.prepare("UPDATE ocr_results SET callback_claimed = 1 WHERE id = ? AND status = 'pending' AND callback_claimed = 0 AND EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending' AND updated_at = ?)").bind(job.id, row.id, row.updatedAt),
            database.prepare("UPDATE submissions SET updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND changes() = 1").bind(claimedAt, row.id),
          ]);
          if (!claimed[0].meta.changes) throw new Error("SUBMISSION_NOT_REVIEWABLE");
          row.updatedAt = claimedAt;
          reviewClaim = job.id;
        }
      }
      try {
        let verifiedRunOutcome = await loadVerifiedRunSubmissionOutcome(row.id);
        let verifiedRunPlan: VerifiedRunSubmissionPlan | null = null;
        let selectedRows: ReviewEvidenceSelection[] = [];
        let approvalRewards: Awaited<ReturnType<typeof planApprovalRewards>> | null = null;
        let reviewedMatchOutcome: string | null = null;
        let reviewedChallengeIds: string[] = [];
        let reviewerConfirmedChallengeIds: string[] = [];
        let retainedGrants: Awaited<ReturnType<typeof loadRetainedSubmissionGrants>> = [];
        const approvalTimestamp = now();
        if (input.decision === "approved") {
          const evidence = await planReviewedEvidence(row, input.fieldCorrections, input.confirmedChallengeIds);
          if (evidence.ineligibleConfirmations.length) throw new Error("CHALLENGE_CONFIRMATION_INELIGIBLE");
          reviewedMatchOutcome = evidence.decision.outcome;
          selectedRows = evidence.selections;
          reviewedChallengeIds = selectedRows.filter((selection) => selection.basis === "conditions").map((selection) => selection.canonicalChallengeId);
          reviewerConfirmedChallengeIds = selectedRows.filter((selection) => selection.basis === "reviewer").map((selection) => selection.canonicalChallengeId);
          if (selectedRows.length) approvalRewards = await planApprovalRewards(row, selectedRows, approvalTimestamp, materializingCanonicalChallenges, evidence.prepared.canonicalChallengePlans);
          verifiedRunPlan = await planVerifiedRunSubmissionOutcome(row, evidence.correctedResponse, "submission_review", true, true, selectedRows.length);
          verifiedRunOutcome = verifiedRunPlan.outcome;
          const verifiedRunAccepted = verifiedRunOutcome.status === "created" || verifiedRunOutcome.status === "reused";
          if (!selectedRows.length) {
            retainedGrants = await loadRetainedSubmissionGrants(row.id);
            if (!retainedGrants.length && !verifiedRunAccepted) throw new Error("SUBMISSION_OUTCOME_NOT_CONFIGURED");
          }
        }
        if (input.decision === "approved" && approvalRewards) {
          const { rewards, grantResults, completionAwardRows, completionGrantsByScope, directGrantsByScope } = approvalRewards;
          const timestamp = approvalTimestamp;
          const primaryGrant = grantResults[0];
          const reviewId = crypto.randomUUID();
          const requestHash = await hashRequest(input);
          const submissionSnapshot = row.ruleSnapshotJson ? JSON.parse(row.ruleSnapshotJson) as MapTitleRuleSnapshot : null;
          const grants = grantResults.map(({ reward, grantId, alreadyOwned }) => ({ grantId, titleKey: reward.titleKey, titleName: reward.titleName, alreadyOwned }));
          const playerVerifiedRunOutcome = verifiedRunOutcome ? playerVerifiedRunSubmissionOutcome(verifiedRunOutcome) : null;
          const response: AdminSubmissionReviewResponse = { contractVersion: "1", submissionId: row.id, decision: "approved", grantId: primaryGrant.grantId, titleKey: primaryGrant.reward.titleKey, titleName: primaryGrant.reward.titleName, alreadyOwned: primaryGrant.alreadyOwned, grants, ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}) };
          const reviewAudit = { decision: input.decision, reason: input.reason ?? null, grants, selections: selectedRows.map((selection) => ({ challengeId: selection.challengeId, mapId: selection.targetMapId, gameplayRevisionId: selection.gameplayRevisionId, basis: selection.basis })), evidenceMatchOutcome: reviewedMatchOutcome, evidenceMatchedChallengeIds: reviewedChallengeIds, reviewerConfirmedChallengeIds, ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}) };
          const statements: D1PreparedStatement[] = [
            ...(verifiedRunPlan?.statements ?? []),
            ...(verifiedRunOutcome ? [masterySubmissionOutcomeStatement(row.id, verifiedRunOutcome)] : []),
          ];
          statements.push(...submissionCompletionStatements({
            row,
            completionAwards: completionAwardRows,
            grantAwards: [...completionGrantsByScope.values()],
            completionAuditAwards: completionAwardRows.filter((award) => !award.root || !grantResults.some((result) => result.canonicalChallengeId === award.challengeId && titleGrantScopeKey(result.reward) === titleGrantScopeKey(award))),
            grantAuditAwards: [...completionGrantsByScope].filter(([scope]) => !directGrantsByScope.has(scope)).map(([, award]) => award),
            timestamp,
            reviewId,
            auth,
          }));
          const primaryMapMatch = primaryGrant.reward.mapId ? "g.map_id = ?" : "g.map_id IS NULL";
          const primaryRevisionMatch = primaryGrant.reward.gameplayRevisionId ? "g.gameplay_revision_id = ?" : "g.gameplay_revision_id IS NULL";
          statements.push(database.prepare(`UPDATE submissions SET status = 'approved', review_reason = ?, gameplay_revision_id = COALESCE(gameplay_revision_id, ?), grant_id = (SELECT g.id FROM player_title_grants g WHERE g.player_account_id = submissions.player_account_id AND g.title_key = ? AND ${primaryMapMatch} AND ${primaryRevisionMatch} AND g.status = 'active'), updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)`)
            .bind(input.reason ?? null, primaryGrant.reward.gameplayRevisionId, primaryGrant.reward.titleKey, ...(primaryGrant.reward.mapId ? [primaryGrant.reward.mapId] : []), ...(primaryGrant.reward.gameplayRevisionId ? [primaryGrant.reward.gameplayRevisionId] : []), timestamp, row.id, reviewId));
          for (const { reward, grantId, alreadyOwned } of grantResults) {
            statements.push(approvedSubmissionOutcomeStatement({ submissionId: row.id, outcomeKey: `title_grant:${reward.titleKey}:${reward.mapId ?? ""}:${reward.gameplayRevisionId ?? ""}`, outcomeType: "title_grant", status: alreadyOwned ? "reused" : "created", entityId: grantId, details: { titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, slot: reward.slot } }));
          }
          for (const selection of selectedRows) {
            const reward = rewards.find((candidate) => candidate.challengeId === selection.challengeId);
            statements.push(approvedSubmissionOutcomeStatement({ submissionId: row.id, outcomeKey: `challenge:${selection.challengeId}:${selection.targetMapId ?? ""}:${selection.gameplayRevisionId ?? ""}`, outcomeType: "challenge", status: "created", entityId: selection.challengeId, details: { mapId: selection.targetMapId, gameplayRevisionId: selection.gameplayRevisionId, titleKey: reward?.titleKey ?? null, basis: selection.basis } }));
          }
          const titleGrantOutcomeScopes = new Set(grantResults.map((result) => titleGrantScopeKey(result.reward)));
          for (const award of completionAwardRows.filter((item) => !item.root)) {
            statements.push(approvedSubmissionOutcomeStatement({ submissionId: row.id, outcomeKey: `challenge:${award.challengeId}:${award.mapId ?? ""}:${award.gameplayRevisionId ?? ""}`, outcomeType: "challenge", status: "created", entityId: award.challengeId, details: { mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, titleKey: award.titleKey, satisfiedBy: award.satisfiedBy } }));
            const scope = titleGrantScopeKey(award);
            if (award.grantable && !titleGrantOutcomeScopes.has(scope)) {
              titleGrantOutcomeScopes.add(scope);
              statements.push(approvedSubmissionOutcomeStatement({ submissionId: row.id, outcomeKey: `title_grant:${scope}`, outcomeType: "title_grant", status: "created", entityId: award.grantId, details: { titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, slot: award.slot, satisfiedBy: award.satisfiedBy } }));
            }
          }
          const idempotencyKeyId = `${auth.subject}:submission.review:${idempotencyKey}`;
          const trailingStatements: D1PreparedStatement[] = [];
          for (const { reward, alreadyOwned, canonicalChallengeId } of grantResults) if (!alreadyOwned) trailingStatements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'challenge.completion.submission', 'challenge_completion', (SELECT id FROM challenge_completions WHERE player_account_id = ? AND challenge_id = ? AND status = 'active' AND source_type = 'submission' AND source_id = ?), ?, ?) ").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, row.playerAccountId, canonicalChallengeId, row.id, JSON.stringify({ submissionId: row.id, challengeId: canonicalChallengeId, titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId }), timestamp));
          for (const { reward, grantId, alreadyOwned } of grantResults) if (!alreadyOwned) trailingStatements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'submission.grant', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grantId, JSON.stringify({ submissionId: row.id, titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, mapVariant: reward.snapshot?.mapVariant ?? submissionSnapshot?.mapVariant ?? null, ruleId: reward.snapshot?.ruleId ?? submissionSnapshot?.ruleId ?? null, ruleRevision: reward.snapshot?.ruleRevision ?? submissionSnapshot?.ruleRevision ?? null, alreadyOwned }), timestamp));
          await persistSubmissionReview({ row, input, auth, reviewId, timestamp, idempotencyKeyId, requestHash, response, reviewAudit, statements, trailingStatements });
          return response;
        }


        const timestamp = now();
        const reviewId = crypto.randomUUID();
        const requestHash = await hashRequest(input);
        const playerVerifiedRunOutcome = verifiedRunOutcome ? playerVerifiedRunSubmissionOutcome(verifiedRunOutcome) : null;
        const responseDetails = {
          ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}),
        };
        const reviewAudit = { decision: input.decision, reason: input.reason ?? null, grantId: null, evidenceMatchOutcome: reviewedMatchOutcome, evidenceMatchedChallengeIds: reviewedChallengeIds, ...(retainedGrants.length ? { retainedGrants: retainedGrants.map(({ grantId: retainedGrantId, titleKey }) => ({ grantId: retainedGrantId, titleKey })) } : {}), ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}) };
        const response: AdminSubmissionReviewResponse = input.decision === "approved" && retainedGrants.length
          ? { contractVersion: "1", submissionId: row.id, decision: "approved", grantId: retainedGrants[0]!.grantId as `${string}-${string}-${string}-${string}-${string}`, titleKey: retainedGrants[0]!.titleKey, titleName: retainedGrants[0]!.titleName, alreadyOwned: true, grants: retainedGrants.map(({ grantId: retainedGrantId, titleKey, titleName }) => ({ grantId: retainedGrantId as `${string}-${string}-${string}-${string}-${string}`, titleKey, titleName, alreadyOwned: true })), ...responseDetails }
          : input.decision === "approved"
            ? { contractVersion: "1", submissionId: row.id, decision: "approved", grant: null, verifiedRunOutcome: playerVerifiedRunOutcome! }
            : { contractVersion: "1", submissionId: row.id, decision: input.decision as "rejected" | "resubmission_required", grant: null };
        const idempotencyKeyId = `${auth.subject}:submission.review:${idempotencyKey}`;
        const statements: D1PreparedStatement[] = [
          ...(verifiedRunPlan?.statements ?? []),
          ...(input.decision === "approved" && verifiedRunOutcome ? [masterySubmissionOutcomeStatement(row.id, verifiedRunOutcome)] : []),
        ];
        statements.push(database.prepare(
          "UPDATE submissions SET status = ?, review_reason = ?, grant_id = CASE WHEN ? = 'approved' THEN (SELECT g.id FROM player_title_grants g WHERE g.source_type IN ('automatic', 'submission') AND g.source_id = submissions.id AND g.status = 'active' ORDER BY g.granted_at, g.id LIMIT 1) ELSE NULL END, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
        ).bind(input.decision, input.reason ?? null, input.decision, timestamp, row.id, reviewId));
        const trailingStatements: D1PreparedStatement[] = [];
        await persistSubmissionReview({ row, input, auth, reviewId, timestamp, idempotencyKeyId, requestHash, response, reviewAudit, statements, trailingStatements });
        return response;
      } finally {
        if (reviewClaim) await db.update(ocrResults).set({ callbackClaimed: 0 }).where(eq(ocrResults.id, reviewClaim));
      }
    },

    ...submissionOcrServices,

    ...createQqGroupServices({
      db,
      queue: qqPolicyQueue,
      ...databaseServiceDependencies,
    }),

    ...createAdminPlayerServices({
      db,
      ...databaseServiceDependencies,
      normalizePlayerName,
      playerSubmissionStatus,
      countPendingSubmissionsByPlayer,
      loadRecentSubmissionDetails: async (rows) => {
        const details = rows.length ? await resolveAdminSubmissionDetails(rows) : null;
        return new Map(rows.map((submission) => [submission.id, {
          challenge: submission.challengeId ? details?.challenges.get(submission.challengeId) ?? null : null,
          ...playerVerifiedRunSubmissionOutcomeFields(details?.verifiedRunOutcomes.get(submission.id)),
        }]));
      },
    }),

    async getCurrentPlayerMastery(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      const mapId = input.mapId?.trim() || undefined;
      const gameplayRevisionId = input.gameplayRevisionId?.trim() || undefined;
      const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
      const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0 ? Math.min(50, input.pageSize) : 20;
      const [activeRunRows, history] = await Promise.all([
        loadActiveVerifiedRuns(db, { playerAccountId: access.player.id, mapId, gameplayRevisionId, currentOnly: !gameplayRevisionId }),
        loadPlayerMasteryHistory(db, { playerAccountId: access.player.id, mapId, gameplayRevisionId, page, pageSize }),
      ]);
      const profiles = buildMasteryProfiles(activeRunRows.map(({ run }) => run), 10);
      const lifecycleByRevisionId = new globalThis.Map<string, CurrentPlayerMasteryResponse["runs"][number]["gameplayRevisionLifecycle"]>([
        ...activeRunRows.map(({ run, gameplayRevisionLifecycle }) => [run.gameplayRevisionId, gameplayRevisionLifecycle] as const),
        ...history.runs.map(({ run, gameplayRevisionLifecycle }) => [run.gameplayRevisionId, gameplayRevisionLifecycle] as const),
      ]);
      const lifecycleFor = (revisionId: string) => {
        const lifecycle = lifecycleByRevisionId.get(revisionId);
        if (!lifecycle) throw new Error("GAMEPLAY_REVISION_DATA_INVALID");
        return lifecycle;
      };
      return {
        contractVersion: "1" as const,
        profiles: profiles.map((profile) => playerMasteryProfileView(profile, lifecycleFor(profile.gameplayRevisionId))),
        runs: history.runs.map(({ run }) => playerVerifiedRunView(run, lifecycleFor(run.gameplayRevisionId))),
        page,
        pageSize,
        total: history.total,
        hasMore: page * pageSize < history.total,
      };
    },

    async getCurrentPlayerActivity(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      return { days: await playerActivityDays(db, access.player.id, now()) };
    },

    // Per-map progress for aggregate Challenges, derived from active Verified
    // Runs at read time. Returns only challenge metadata and completion flags —
    // no Submission, OCR, audit, or identity internals.
    async listCurrentPlayerChallengeProgress(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      const timestamp = now();
      const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(
          isNotNull(titleChallenges.progressRule),
          eq(titleChallenges.status, "active"),
          eq(titleCatalog.lifecycle, "active"),
          eq(titleCatalog.publicVisibility, 1),
        ))
        .orderBy(titleCatalog.category, titleCatalog.label);
      const visibleChallenges = rows.flatMap(({ challenge, title }) => {
        const rule = parseChallengeProgressRule(challenge.progressRule);
        const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp, challenge.gameVersion, challenge.retiredVersion);
        return rule && status ? [{ challenge, title, rule, status }] : [];
      });
      const modeMapIds = await standaloneModeMapIds([...new Set(visibleChallenges.flatMap(({ rule }) => !rule.mapIds && rule.mode ? [rule.mode] : []))]);
      const ruleMapIds = new Map(visibleChallenges.map(({ challenge, rule }) => [challenge.id, rule.mapIds ?? (rule.mode ? modeMapIds.get(rule.mode) ?? [] : [])]));
      // CROSS JOIN keeps the small rule/map inputs ahead of the indexed run
      // lookup, instead of scanning all of a player's runs for each rule.
      const eligibleRunMaps = visibleChallenges.length ? (await database.prepare(`
        SELECT DISTINCT json_extract(rule.value, '$.challengeId') AS challengeId, run.map_id AS mapId, run.difficulty
        FROM json_each(?) AS rule
        CROSS JOIN json_each(rule.value, '$.mapIds') AS required_map
        CROSS JOIN mastery_runs AS run ON run.player_account_id = ? AND run.status = 'active' AND run.map_id = required_map.value
        JOIN submissions AS submission ON submission.id = run.source_submission_id
        JOIN gameplay_revisions AS revision ON revision.id = run.gameplay_revision_id
        WHERE revision.mode IS json_extract(rule.value, '$.mode')
          AND (json_extract(rule.value, '$.startsAt') IS NULL OR submission.created_at >= json_extract(rule.value, '$.startsAt'))
          AND (json_extract(rule.value, '$.endsAt') IS NULL OR submission.created_at < json_extract(rule.value, '$.endsAt'))
      `).bind(JSON.stringify(visibleChallenges.map(({ challenge, rule }) => ({
        challengeId: challenge.id, mapIds: ruleMapIds.get(challenge.id), mode: rule.mode ?? null, startsAt: challenge.startsAt, endsAt: challenge.endsAt,
      }))), access.player.id).all<{ challengeId: string; mapId: string; difficulty: string }>()).results : [];
      const runsByChallenge = new Map<string, Array<{ mapId: string; difficulty: string }>>();
      for (const run of eligibleRunMaps) {
        const runs = runsByChallenge.get(run.challengeId) ?? [];
        runs.push(run);
        runsByChallenge.set(run.challengeId, runs);
      }
      const items: PlayerChallengeProgressListResponse["items"] = visibleChallenges.map(({ challenge, title, rule, status }) => {
        const completed = new Set((runsByChallenge.get(challenge.id) ?? [])
          .filter((run) => !rule.difficultyAtLeast || difficultyAtLeastSatisfied(run.difficulty, rule.difficultyAtLeast))
          .map((run) => run.mapId));
        return {
          challengeId: challenge.id,
          titleKey: title.key,
          titleName: title.label,
          icon: title.icon,
          ...(title.iconUrl ? { iconUrl: title.iconUrl } : {}),
          status: status as "scheduled" | "active" | "sunsetting",
          ...(challenge.startsAt !== null ? { startsAt: challenge.startsAt } : {}),
          ...(challenge.endsAt !== null ? { endsAt: challenge.endsAt } : {}),
          progressRule: rule,
          maps: ruleMapIds.get(challenge.id)!.map((mapId) => ({ mapId, completed: completed.has(mapId) })),
          completedMaps: completed.size,
          satisfied: ruleMapIds.get(challenge.id)!.length > 0 && ruleMapIds.get(challenge.id)!.every((mapId) => completed.has(mapId)),
        };
      });
      return { contractVersion: "1" as const, items };
    },

    async getPortalSessionIdentity(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      return access ? { player: { playerId: access.player.playerId, isAdmin: access.player.isAdmin === 1 } } : null;
    },

    async getCurrentPlayer(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      const { player } = access;
      const recentSubmissions = await db.select({ submissionId: submissions.id, status: submissions.status, mapName: submissions.mapName, challengeId: submissions.challengeId, difficulty: submissions.difficulty, reason: submissions.reviewReason, createdAt: submissions.createdAt, updatedAt: submissions.updatedAt })
        .from(submissions)
        .where(eq(submissions.playerAccountId, player.id))
        .orderBy(desc(submissions.createdAt))
        .limit(5);
      const verifiedRunOutcomes = await loadVerifiedRunSubmissionOutcomes(recentSubmissions.map((submission) => submission.submissionId));
      return {
        contractVersion: "1" as const,
        player: { playerId: player.playerId, playerName: player.playerName, isAdmin: player.isAdmin === 1, publicProfile: player.publicProfile === 1, hideBattleTag: player.hideBattleTag === 1 },
        recentSubmissions: recentSubmissions.map((submission) => {
          const verifiedRunOutcome = verifiedRunOutcomes.get(submission.submissionId);
          return { submissionId: submission.submissionId, status: playerSubmissionStatus(submission.status), resubmissionRequired: submission.status === "resubmission_required", mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: verifiedRunOutcome?.status === "conflict" ? undefined : submission.reason ?? undefined, ...playerVerifiedRunSubmissionOutcomeFields(verifiedRunOutcome), createdAt: submission.createdAt, updatedAt: submission.updatedAt };
        }),
      };
    },

    async updateCurrentPlayerProfileVisibility(input, idempotencyKey) {
      const operation = "player.profile.visibility.update";
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      const request = { publicProfile: input.publicProfile, hideBattleTag: input.hideBattleTag };
      const replay = await replayOrConflict<PlayerProfileVisibilityResponse>(db, current.player.id, operation, idempotencyKey, request);
      if (replay) return replay;
      const timestamp = now();
      const response: PlayerProfileVisibilityResponse = { contractVersion: "1", publicProfile: input.publicProfile, hideBattleTag: input.hideBattleTag };
      await database.batch([
        database.prepare("UPDATE player_accounts SET public_profile = ?, hide_battletag = ?, updated_at = ? WHERE id = ?").bind(input.publicProfile ? 1 : 0, input.hideBattleTag ? 1 : 0, timestamp, current.player.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${current.player.id}:${operation}:${idempotencyKey}`, current.player.id, operation, await hashRequest(request), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), "user", current.player.id, operation, "player_accounts", current.player.id, JSON.stringify(request), timestamp),
      ]);
      return response;
    },

    ...createPortalAuthenticationServices(database, db, {
      now,
      randomToken,
      randomCode,
      hashRequest,
      sessionTtlMs,
      expiredAuthRowRetentionMs,
      pruneExpiredPortalSessions,
      bindingInviteCodeEncryptionKey,
      encryptBindingInviteCode,
      decryptBindingInviteCode,
      replayOrConflict,
      recordIdempotency,
      recordAudit,
    }),
    async submitQqScreenshot(input: QqScreenshotSubmissionRequest, auth, idempotencyKey, requestId) {
      const operation = "qq.screenshot.submit";
      const recordId = `${auth.subject}:${operation}:${idempotencyKey}`;
      const requestHash = await hashRequest(input);
      const identity = (await hashRequest(`${operation}:${recordId}`)).slice(0, 32).split("");
      identity[12] = "4"; identity[16] = "8";
      const submissionId = `${identity.slice(0, 8).join("")}-${identity.slice(8, 12).join("")}-${identity.slice(12, 16).join("")}-${identity.slice(16, 20).join("")}-${identity.slice(20).join("")}`;
      const response: QqScreenshotSubmissionResponse = { contractVersion: "1", submissionId, status: "processing" };

      // A marker claims the operation while the queue send is unresolved. The
      // `send:` form means the owner is inside (or died inside) the queue send and
      // only goes stale after the resume window; the plain form can be taken over
      // immediately because the owner is no longer between claim and send. Every
      // transition refreshes created_at so the window measures from the latest
      // claim, and each send marker carries a unique nonce so a displaced
      // sender's guarded writes can never match a re-armed marker.
      const markSending = `${qqScreenshotEnqueueingPrefix}send:`;
      const settle = (record: { requestHash: string; responseJson: string; createdAt: number }): Promise<QqScreenshotSubmissionResponse> => {
        if (record.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        if (!record.responseJson.startsWith(qqScreenshotEnqueueingPrefix)) return Promise.resolve(JSON.parse(record.responseJson) as QqScreenshotSubmissionResponse);
        if (record.responseJson.startsWith(markSending) && record.createdAt + qqScreenshotResumeAfterMs > now()) throw new Error("QQ_SUBMISSION_IN_PROGRESS");
        return resumeClaim(record.responseJson);
      };

      const enqueueOcr = async (jobId: string, objectKey: string, marker: string): Promise<QqScreenshotSubmissionResponse> => {
        const sendMarker = `${markSending}${jobId}:${crypto.randomUUID()}`;
        const armed = await database.prepare("UPDATE idempotency_keys SET response_json = ?, created_at = ? WHERE id = ? AND response_json = ?").bind(sendMarker, now(), recordId, marker).run();
        if (Number(armed.meta.changes) !== 1) throw new Error("QQ_SUBMISSION_IN_PROGRESS");
        try {
          await ocrQueue!.send({ version: 2, jobId, submissionId, objectKey, ...(requestId ? { requestId } : {}) });
          logOcrEvent("job_enqueued", { submissionId, attempt: 0, manual: false, requestId: requestId ?? null });
        } catch (error) {
          logOcrEvent("job_enqueue_failed", { submissionId, attempt: 0, manual: false, requestId: requestId ?? null, ...errorDetails(error) });
          // Mark the OCR row so the admin OCR retry path recognizes the stuck
          // Submission, then return the claim to the resumable marker for the next
          // redelivery instead of leaving evidence without a record. Both writes
          // stay conditional on this sender still holding the send marker, so a
          // late failure after a takeover cannot corrupt the new owner's job.
          await database.batch([
            database.prepare(`UPDATE ocr_results SET status = 'error', error_code = 'OCR_QUEUE_SEND_FAILED' WHERE id = ? AND status = 'pending'
              AND EXISTS (SELECT 1 FROM idempotency_keys WHERE id = ? AND response_json = ?)`).bind(jobId, recordId, sendMarker),
            database.prepare("UPDATE idempotency_keys SET response_json = ?, created_at = ? WHERE id = ? AND response_json = ?").bind(`${qqScreenshotEnqueueingPrefix}${jobId}`, now(), recordId, sendMarker),
          ]);
          throw error;
        }
        const finalized = await database.prepare("UPDATE idempotency_keys SET response_json = ? WHERE id = ? AND response_json = ?").bind(JSON.stringify(response), recordId, sendMarker).run();
        if (Number(finalized.meta.changes) === 1) return response;
        const raced = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, recordId)).get();
        if (!raced || raced.responseJson.startsWith(qqScreenshotEnqueueingPrefix)) throw new Error("QQ_SUBMISSION_IN_PROGRESS");
        if (raced.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        return JSON.parse(raced.responseJson) as QqScreenshotSubmissionResponse;
      };

      const resumeClaim = async (markerText: string): Promise<QqScreenshotSubmissionResponse> => {
        const resumedJobId = crypto.randomUUID();
        const resumedMarker = `${qqScreenshotEnqueueingPrefix}${resumedJobId}`;
        const takeover = await database.prepare("UPDATE idempotency_keys SET response_json = ?, created_at = ? WHERE id = ? AND response_json = ?").bind(resumedMarker, now(), recordId, markerText).run();
        if (Number(takeover.meta.changes) !== 1) throw new Error("QQ_SUBMISSION_IN_PROGRESS");
        const [submission, attachment] = await Promise.all([
          db.select({ status: submissions.status }).from(submissions).where(eq(submissions.id, submissionId)).get(),
          db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, submissionId)).get(),
        ]);
        if (!submission || !attachment?.objectKey) {
          await database.prepare("DELETE FROM idempotency_keys WHERE id = ? AND response_json = ?").bind(recordId, resumedMarker).run();
          throw new Error("QQ_SUBMISSION_STALE_CLAIM");
        }
        if (submission.status !== "ocr_pending") {
          await database.prepare("UPDATE idempotency_keys SET response_json = ? WHERE id = ? AND response_json = ?").bind(JSON.stringify(response), recordId, resumedMarker).run();
          return response;
        }
        await database.prepare(`INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) SELECT ?, ?, 0, 'pending', ?
          WHERE NOT EXISTS (SELECT 1 FROM ocr_results WHERE submission_id = ? AND status = 'pending')`).bind(resumedJobId, submissionId, now(), submissionId).run();
        const pending = await db.select({ id: ocrResults.id }).from(ocrResults).where(and(eq(ocrResults.submissionId, submissionId), eq(ocrResults.status, "pending"))).get();
        if (!pending) throw new Error("QQ_SUBMISSION_IN_PROGRESS");
        return enqueueOcr(pending.id, attachment.objectKey, resumedMarker);
      };

      const existing = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, recordId)).get();
      if (existing) return settle(existing);
      if (!evidenceBucket) throw new Error("EVIDENCE_BUCKET_UNAVAILABLE");
      if (!ocrQueue) throw new Error("OCR_NOT_CONFIGURED");

      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, input.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("BINDING_NOT_FOUND");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");

      const image = await fetchQqAttachmentImage(input.attachment.url);
      const sha256 = await digestHex(image.body);
      const objectKey = userEvidenceObjectKey(submissionId, sha256, image.extension);
      await evidenceBucket.put(objectKey, image.body, { httpMetadata: { contentType: image.contentType } });

      const timestamp = now();
      const jobId = crypto.randomUUID();
      const marker = `${qqScreenshotEnqueueingPrefix}${jobId}`;
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(recordId, auth.subject, operation, requestHash, marker, timestamp),
        database.prepare(`INSERT INTO submissions (id, player_account_id, binding_id, status, challenge_type, map_name, player_name, ocr_fail_count, source_provider, source_conversation_id, source_message_id, created_at, updated_at)
          SELECT ?, ?, ?, 'ocr_pending', 'unknown', '成就挑战', ?, 0, 'qq', ?, ?, ?, ? WHERE changes() = 1`).bind(submissionId, account.id, binding.id, account.playerName, input.groupOpenId, input.commandMessageId, timestamp, timestamp),
        database.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) SELECT ?, ?, 'qq', ?, ?, ?, ?, ?, 'stored', ? WHERE changes() = 1").bind(crypto.randomUUID(), submissionId, input.commandMessageId, image.contentType, image.body.byteLength, sha256, objectKey, timestamp),
        database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) SELECT ?, ?, 0, 'pending', ? WHERE changes() = 1").bind(jobId, submissionId, timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, ?, 'submission', ?, ?, ? WHERE changes() = 1").bind(crypto.randomUUID(), requestId ?? crypto.randomUUID(), auth.actorType, auth.subject, operation, submissionId, JSON.stringify({ provider: "qq" }), timestamp),
      ]);
      const claimed = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, recordId)).get();
      if (!claimed) throw new Error("QQ_SUBMISSION_IN_PROGRESS");
      if (claimed.responseJson !== marker) return settle(claimed);
      return enqueueOcr(jobId, objectKey, marker);
    },


    ...createBindingServices({
      database, db, randomToken, randomCode,
      ...databaseServiceDependencies,
      normalizePlayerName, encryptBindingInviteCode, decryptBindingInviteCode, bindingInviteCodeEncryptionKey,
      sessionTtlMs, pruneExpiredPortalSessions, pruneExpiredBindingClaims,
    }),

    async createBinding() {
      // Older adapters receive a deterministic migration-safe response.
      throw new Error("INVITE_REQUIRED");
    },

    async getSubmission(input, _auth) {
      const submission = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
      const verifiedRunOutcome = await loadVerifiedRunSubmissionOutcome(submission.id);
      return { contractVersion: "1" as const, submissionId: submission.id, status: playerSubmissionStatus(submission.status), resubmissionRequired: submission.status === "resubmission_required", mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: verifiedRunOutcome?.status === "conflict" ? undefined : submission.reviewReason ?? undefined, ...playerVerifiedRunSubmissionOutcomeFields(verifiedRunOutcome), createdAt: submission.createdAt, updatedAt: submission.updatedAt };
    },
    ...createReviewServices(database, db, {
      ...databaseServiceDependencies,
    }),
    ...createLeaderboardServices(db, platformCache),
    ...createPlayerHandleServices({ database, db, now, replayOrConflict: databaseServiceDependencies.replayOrConflict }),
    ...createSeasonServices({ database, db, now, replayOrConflict: databaseServiceDependencies.replayOrConflict }),
  };
};

export * from "./schema";
