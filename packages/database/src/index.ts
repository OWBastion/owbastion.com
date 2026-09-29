import { count, desc, eq, and, or, inArray, isNull, isNotNull, ne, lte, notExists, sql, asc } from "drizzle-orm";

import { drizzle } from "drizzle-orm/d1";
import { buildMasteryMapProfile, buildMasteryProfiles, calculateVerifiedRunXpV2, parseCanonicalChallengeConditions, randomEventRarityForWeight, verifiedRunDifficulties, verifiedRunEvidenceCompatibilityV1, normalizeMatchCode } from "@owbastion/domain";
import type { AdminVerifiedRunQuery, AuthContext, VerifiedRunDifficulty, VerifiedRunEvidenceCompatibilityV1, VerifiedRunActor, VerifiedRunConflictField, PlatformServices, RecordVerifiedRunResult, VerifiedRun, VerifiedRunInput } from "@owbastion/domain";
import { agentGameplayRevisionSchema } from "@owbastion/contracts";
import type { AdminAchievementCreateRequest, AdminChallenge, AdminChallengeUpdateRequest, AdminCatalogTitleUpdateRequest, AdminMapMetadataUpdateRequest, AdminMapEditorChallengeOption, AdminMapEditorResponse, AdminMapRevision, AdminMapRevisionChallengeAssignment, AdminMapRevisionCreateRequest, AdminMapRevisionUpdateRequest, AdminMapTitleRule, AdminMapTitleRuleCreateRequest, AdminMapTitleRuleUpdateRequest, AdminMapTitleRuleExceptionUpsertRequest, AdminRandomEventCreateRequest, AdminRandomEventImportRequest, AdminRandomEventUpdateRequest, AdminRandomEventVersionAvailabilityRequest, AdminRandomEventVersionListResponse, AdminScreenshotSetCandidateListResponse, AdminScreenshotSetCreateRequest, AdminScreenshotSetCreateResponse, AdminScreenshotSetDetailResponse, AdminScreenshotSetDiscardResponse, AdminScreenshotSetFinalizeResponse, AdminScreenshotSetListResponse, AdminSubmissionOcrRetryResponse, AdminSubmissionReviewCandidate, AdminSubmissionReviewPreviewResponse, AdminSubmissionReviewRequest, AdminSubmissionReviewResponse, AdminSubmissionSpotCheckResponse, AdminManualTitleGrantRequest, AdminManualTitleGrantResponse, AdminManualTitleGrantTarget, AdminManualTitleGrantBatchRequest, AdminManualTitleGrantBatchResponse, AdminVerifiedRun, AdminVerifiedRunConflict, AdminVerifiedRunDetailResponse, AdminVerifiedRunProjection, AdminVerifiedRunStateResponse, AdminVerifiedRunConflictResolutionResponse, AdminVerifiedRunCorrectionRequest, AdminVerifiedRunCorrectionResponse, AdminReview, AgentMap, AgentSearchResult, AgentSpatialConfig, AgentTitle, Challenge, CurrentPlayerMasteryResponse, Map, OcrAccuracyFeedbackRequest, OcrAccuracyFeedbackResponse, OcrAccuracyMark, OcrkitScreenshotSetResponse, PlayerSubmissionStatus, QqLoginAttemptRequest, QqLoginVerifyRequest, RandomEvent, RandomEventVersion, ScreenshotSetStatus, Title } from "@owbastion/contracts";
import { achievementChallengeMaps, achievementChallenges, attachments, auditEvents, bindingClaims, bindingInvites, bindingInviteHistoricalTitleGrants, bindings, challengeCompletions, challengeSatisfies, challenges, effectGlossaryTerms, gameplayRevisionChallengeAssignments, gameplayRevisions, historicalTitleGrants, identities, idempotencyKeys, mapMetadata, mapTitleRewards, mapTitleRuleCompat, mapTitleRuleExceptions, mapTitleRules, maps, ocrAccuracyFeedback, ocrResults, passkeyChallenges, passkeyCredentials, passkeyRecoveryGrants, playerAccounts, playerEquippedTitles, playerTitleEntitlements, playerTitleGrants, portalSessions, qqGroupAccess, qqLoginAttempts, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, randomEventVersions, reviews, screenshotSetMembers, screenshotSets, submissionOutcomes, submissionReviews, submissionSpotChecks, submissions, titleCatalog, titleChallenges, uploadSessions, verifiedRunConflictResolutions, verifiedRunLifecycleEvents, verifiedRuns } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { createPlayerUploadServices, maxUploadBytes, playerSubmissionStatus } from "./player-upload-service";
import { matchOcrAgainstChallenges, type AutoMatchCandidate, type CanonicalOcrChallenge } from "./ocr-auto-match";
import { assessVerifiedRunOcrEvidence, type OcrResponse } from "./ocr-response";
import { createCanonicalChallengeServices, type CanonicalChallengeInput, type CanonicalChallengePlan, type CanonicalChallengeResolver } from "./canonical-challenge-service";
import { createChallengeCompletionServices, type ChallengeCompletionAward } from "./challenge-completion-service";
import { hashRequest, resolvePortalSession } from "./portal-session";
import { createReviewServices } from "./review-service";
import { createAdminPlayerServices } from "./admin-player-service";
import { createQqGroupServices } from "./qq-group-service";
import { createAgentServices } from "./agent-service";
import { createRandomEventServices } from "./random-event-service";
import { createMapRevisionServices, pioneerExceptionHasValidWindow } from "./map-revision-service";
import { createPlayerTitleServices, type ManualTitleGrantResolution } from "./player-title-service";
import { createBindingServices } from "./binding-service";
import { createPortalAuthenticationServices } from "./portal-authentication-service";
import { activeMasteryProfiles, asVerifiedRun, loadActiveVerifiedRuns, loadPlayerMasteryHistory, masteryConflictFields, playerMasteryProfileView, playerVerifiedRunView, prepareVerifiedRun } from "./mastery-query";
import { pageResult, paginate } from "./page-result";
import { createChallengeSnapshotServices, type MapTitleRuleSnapshot } from "./challenge-snapshot-service";
import { createChallengeCatalogServices } from "./challenge-catalog-service";
import { createAdminVerifiedRunServices } from "./admin-verified-run-service";

export { maxReviewCommentLength, reviewSampleThreshold } from "./review-service";
export { assessVerifiedRunOcrEvidence } from "./ocr-response";
export { pioneerExceptionHasValidWindow } from "./map-revision-service";
export type { VerifiedRunOcrEvidenceAssessment } from "./ocr-response";

const now = () => Date.now();
const ocrRetryEnqueueingPrefix = "ocr-retry-enqueueing:";

const normalizedOcrLabel = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";

const logOcrEvent = (event: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ layer: "ocr", event, ...fields }));
const ocrkitRequestTimeoutMs = 20_000;
const errorDetails = (error: unknown) => ({ errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256) });
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxTitleIconBytes = 512 * 1024;
const titleIconContentTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);
// The stored object key is `.../<version>.<extension>`; the version segment is minted once at
// upload time and is what the versioned public route matches against, so a previously issued
// immutable URL can never be answered with a later upload's bytes — it either still matches the
// current object or 404s once that object is replaced.
export const titleIconVersionOf = (objectKey: string): string => {
  const fileName = objectKey.slice(objectKey.lastIndexOf("/") + 1);
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
};
export const publicTitleChallengeStatus = (status: string, startsAt: number | null, endsAt: number | null, timestamp: number, gameVersion: string | null | undefined = "known") => {
  if (!gameVersion?.trim()) return null;
  if (status !== "scheduled") return status === "active" || status === "sunsetting" ? status : null;
  if (endsAt !== null && timestamp >= endsAt) return null;
  if (startsAt === null || timestamp < startsAt) return "scheduled";
  return "active";
};
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
  availability: row.lifecycle === "retired" ? "retired" : "active",
  displayKind: row.displayKind as Title["displayKind"],
  color: titleColor(row.colorJson),
});
const toAgentTitle = (row: typeof titleCatalog.$inferSelect): AgentTitle => ({
  ...titleCatalogView(row),
  scope: row.scope as Title["scope"],
  gameVersion: row.gameVersion?.trim() || null,
});

const playerManualReviewReason = "玩家申请人工处理";

export const createPlatformServices = (database: D1Database, evidenceBucket?: R2Bucket, uploadOrigin = "https://api.owbastion.com", ocrkitBaseUrl?: string, ocrkitApiToken?: string, ocrQueue?: Queue, qqPolicyQueue?: Queue, bindingInviteCodeEncryptionKey?: string, ocrManualReviewThreshold = 1, ocrAutoReviewSampleRate = 0, masteryEvidenceCompatibility: VerifiedRunEvidenceCompatibilityV1 = verifiedRunEvidenceCompatibilityV1, evidencePublicOrigin?: string): PlatformServices => {
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
    publicEventChallenges,
    publicTitleChallengeFields,
    toPublicMapChallenge,
    toPublicTitleChallenge,
    toTitleChallengeBase,
    validateChallengeMapScope,
  } = createChallengeCatalogServices({ db, now, pioneerExceptionIsSubmittable, publicTitleChallengeStatus });
  const { batchResolveAutomaticSnapshots, resolveLegacyProjection, resolveMapTitleProjection, selectGameplayRevision, snapshotTitleChallenge } = createChallengeSnapshotServices({ db, now, pioneerExceptionIsSubmittable });
  const databaseServiceDependencies = {
    now,
    hashRequest,
    replayOrConflict: <T>(actorId: string, operation: string, key: string, input: unknown) => replayOrConflict<T>(db, actorId, operation, key, input),
    recordIdempotency: (actorId: string, operation: string, key: string, input: unknown, response: unknown) => recordIdempotency(db, actorId, operation, key, input, response),
    recordAudit: (auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => recordAudit(db, auth, operation, entityType, entityId, payload),
  };
  const randomEventServices = createRandomEventServices(database, db, {
    now,
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

  const listGlobalAgentTitles = async () => (await db.select().from(titleCatalog)
    .where(eq(titleCatalog.scope, "global"))
    .orderBy(titleCatalog.key)).map(toAgentTitle);

  const reconcileStaleOcrJobs = async (input: { olderThan: number }) => {
    const staleSubmissions = await db.select({ id: submissions.id, updatedAt: submissions.updatedAt })
      .from(submissions)
      .where(and(eq(submissions.status, "ocr_pending"), lte(submissions.updatedAt, input.olderThan)))
      .orderBy(asc(submissions.updatedAt), asc(submissions.id))
      .limit(100);
    let recoveredCount = 0;
    for (const submission of staleSubmissions) {
      const pendingResults = await db.select({ id: ocrResults.id })
        .from(ocrResults)
        .where(and(eq(ocrResults.submissionId, submission.id), eq(ocrResults.status, "pending")));
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
        ...pendingResults.map(({ id }) => database.prepare(`DELETE FROM idempotency_keys
          WHERE operation = 'submission.ocr.retry' AND response_json = ?
            AND EXISTS (SELECT 1 FROM ocr_results WHERE id = ? AND status = 'error' AND error_code = 'OCR_QUEUE_STALLED')`)
          .bind(`${ocrRetryEnqueueingPrefix}${id}`, id)),
      ];
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      const recovered = await db.select({ id: ocrResults.id }).from(ocrResults).where(eq(ocrResults.id, recoveryResultId)).get();
      if (recovered) {
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
    if (title.lifecycle === "draft") throw new Error("TITLE_NOT_ACTIVE");
    if (title.scope === "global" && (input.mapId || input.gameplayRevisionId)) throw new Error("GLOBAL_TITLE_CANNOT_HAVE_MAP");
    if (title.scope === "map" && !input.mapId) throw new Error("MAP_TITLE_REQUIRES_MAP");
    const manualChallengeId = `manual:${title.key}`;
    if (!input.mapId) return { title, mapId: null, gameplayRevisionId: null, slot: null, manualChallengeId };

    const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
    if (!map) throw new Error("MAP_NOT_FOUND");
    const revision = await selectGameplayRevision({ mapId: input.mapId, mapVariant: null, gameplayRevisionId: input.gameplayRevisionId, allowHistorical: Boolean(input.gameplayRevisionId) });
    if (!revision) throw new Error(input.gameplayRevisionId ? "GAMEPLAY_REVISION_INVALID" : "GAMEPLAY_REVISION_NOT_FOUND");

    const rule = await db.select({ ruleId: mapTitleRules.id }).from(mapTitleRules)
      .where(and(eq(mapTitleRules.titleKey, title.key), ne(mapTitleRules.status, "inactive"))).get();
    const projection = rule ? await resolveMapTitleProjection(rule.ruleId, input.mapId, revision.id) : null;
    if (projection) return { title, mapId: input.mapId, gameplayRevisionId: revision.id, slot: projection.slot, manualChallengeId };

    const titleChallenge = await db.select({ challenge: titleChallenges, catalog: titleCatalog }).from(titleChallenges)
      .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
      .where(and(eq(titleChallenges.titleKey, title.key), eq(titleChallenges.scope, "map"))).get();
    const challengeProjection = titleChallenge ? await snapshotTitleChallenge(titleChallenge.challenge, titleChallenge.catalog, input.mapId, revision.id) : null;
    if (challengeProjection) return { title, mapId: input.mapId, gameplayRevisionId: revision.id, slot: challengeProjection.slot, manualChallengeId };

    const reward = await db.select({ slot: mapTitleRewards.slot }).from(mapTitleRewards)
      .where(and(eq(mapTitleRewards.mapId, input.mapId), eq(mapTitleRewards.titleKey, title.key))).get();
    if (reward) return { title, mapId: input.mapId, gameplayRevisionId: revision.id, slot: reward.slot, manualChallengeId };
    throw new Error("TITLE_MAP_REWARD_NOT_CONFIGURED");
  };

  const asAdminMapTitleRule = (rule: typeof mapTitleRules.$inferSelect, titleName: string): AdminMapTitleRule => ({
    ruleId: rule.id,
    titleKey: rule.titleKey,
    titleName,
    kind: rule.kind,
    condition: rule.condition,
    evidenceRule: rule.evidenceRule,
    submissionMode: rule.submissionMode as "manual" | "automatic",
    displayKind: rule.displayKind as "fixed" | "map_pioneer" | "map_name_suffix",
    slot: rule.slot as "pioneer" | "conqueror" | "dominator" | null,
    defaultScope: rule.defaultScope as "all_active" | "explicit",
    ...(rule.mapVariant ? { mapVariant: rule.mapVariant as "classic" } : {}),
    status: rule.status === "inactive" ? "retired" : rule.status as "active" | "sunsetting",
    introducedVersion: rule.introducedVersion,
    retiredVersion: rule.retiredVersion,
  });

  const assertMapTitleRuleScope = (kind: string, defaultScope: string) => {
    if (kind.trim().toLocaleLowerCase() === "pioneer" && defaultScope !== "explicit") throw new Error("PIONEER_RULE_SCOPE_MUST_BE_EXPLICIT");
  };

  const insertDefaultMapTitleRuleAssignment = (revisionId: string, mapId: string, ruleId: string, timestamp: number) => database.prepare(
    "INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, 'map_title_rule', ?, 1, NULL, NULL, NULL, NULL, ?, ?) ON CONFLICT (gameplay_revision_id, challenge_family, challenge_id) DO NOTHING",
  ).bind(`assignment:${revisionId}:map_title_rule:${ruleId}`, revisionId, mapId, ruleId, timestamp, timestamp);

  const materializeDefaultMapTitleRuleAssignments = async (rule: typeof mapTitleRules.$inferSelect) => {
    if (rule.status === "inactive" || rule.defaultScope !== "all_active" || rule.kind.trim().toLocaleLowerCase() === "pioneer") return;
    const mapVariant = (rule.mapVariant as "classic" | null) ?? null;
    const revisions = await db.select({ revision: gameplayRevisions }).from(gameplayRevisions)
      .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
      .where(and(eq(maps.status, "active"), mapVariant === "classic" ? and(eq(gameplayRevisions.lifecycle, "selectable"), eq(gameplayRevisions.legacyMapVariant, "classic")) : and(eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant))));
    if (!revisions.length) return;
    const timestamp = now();
    await database.batch(revisions.map(({ revision }) => insertDefaultMapTitleRuleAssignment(revision.id, revision.mapId, rule.id, timestamp)));
  };

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

  type VerifiedRunSubmissionOutcomeStatus = "created" | "reused" | "ineligible" | "conflict" | "invalidated";
  type VerifiedRunSubmissionOutcome = {
    status: VerifiedRunSubmissionOutcomeStatus;
    verifiedRunId: string | null;
    awardedXp: number;
    reason: string | null;
    conflictFields: VerifiedRunConflictField[];
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

  const resolveMasteryGameplayRevision = async (input: { mapId: string; mapVariant: "classic" | null; gameplayRevisionId: string | null }) => {
    if (input.gameplayRevisionId) {
      const revision = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.id, input.gameplayRevisionId)).get();
      if (!revision || revision.mapId !== input.mapId) return null;
      if ((revision.legacyMapVariant ?? null) !== input.mapVariant) return null;
      return revision;
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

  // Reuse active maps during one service operation. Queue handlers reset this cache
  // for each message because one service instance handles the full batch.
  let activeMapsPromise: Promise<Array<typeof maps.$inferSelect>> | null = null;
  const loadActiveMaps = () => activeMapsPromise ??= db.select().from(maps).where(eq(maps.status, "active"));

  type VerifiedRunRecordPlan = {
    result: RecordVerifiedRunResult;
    statements: D1PreparedStatement[];
    row: typeof verifiedRuns.$inferSelect | null;
    candidate: ReturnType<typeof prepareVerifiedRun>;
  };

  const planVerifiedRunRecord = async (input: VerifiedRunInput, rejectConcurrentInsert = false): Promise<VerifiedRunRecordPlan> => {
    const candidate = prepareVerifiedRun(input, now());
    const source = await db.select({ playerAccountId: submissions.playerAccountId, gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions)
      .where(eq(submissions.id, candidate.sourceSubmissionId)).get();
    if (!source) throw new Error("VERIFIED_RUN_SUBMISSION_NOT_FOUND");
    if (source.playerAccountId !== candidate.playerAccountId) throw new Error("VERIFIED_RUN_SUBMISSION_PLAYER_MISMATCH");
    if (source.gameplayRevisionId && source.gameplayRevisionId !== candidate.gameplayRevisionId) throw new Error("VERIFIED_RUN_SUBMISSION_REVISION_MISMATCH");
    const [player, map, revision] = await Promise.all([
      db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, candidate.playerAccountId)).get(),
      db.select({ id: maps.id }).from(maps).where(eq(maps.id, candidate.mapId)).get(),
      db.select({ id: gameplayRevisions.id, mapId: gameplayRevisions.mapId, legacyMapVariant: gameplayRevisions.legacyMapVariant }).from(gameplayRevisions).where(eq(gameplayRevisions.id, candidate.gameplayRevisionId)).get(),
    ]);
    if (!player) throw new Error("VERIFIED_RUN_PLAYER_NOT_FOUND");
    if (!map) throw new Error("VERIFIED_RUN_MAP_NOT_FOUND");
    if (!revision || revision.mapId !== candidate.mapId || (revision.legacyMapVariant ?? null) !== candidate.mapVariant) throw new Error("VERIFIED_RUN_GAMEPLAY_REVISION_NOT_FOUND");

    const bySource = await db.select().from(verifiedRuns).where(eq(verifiedRuns.sourceSubmissionId, candidate.sourceSubmissionId)).get();
    const existing = bySource ?? await db.select().from(verifiedRuns).where(and(
      eq(verifiedRuns.playerAccountId, candidate.playerAccountId),
      eq(verifiedRuns.matchCode, candidate.matchCode),
    )).get();
    if (existing) {
      const run = asVerifiedRun(existing);
      const conflictFields = masteryConflictFields(run, candidate);
      return {
        result: conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run },
        statements: [],
        row: existing,
        candidate,
      };
    }

    const award = calculateVerifiedRunXpV2({
      difficulty: candidate.difficulty,
      mapFactor: candidate.mapFactor,
      deaths: candidate.deaths,
      skips: candidate.skips,
    });
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
      statements: [
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
  };

  const planVerifiedRunSubmissionOutcome = async (
    row: typeof submissions.$inferSelect,
    response: OcrResponse,
    acceptanceSource: "submission_automatic" | "submission_review",
    humanConfirmed = false,
    rejectConcurrentInsert = false,
  ): Promise<VerifiedRunSubmissionPlan> => {
    const plan = (outcome: VerifiedRunSubmissionOutcome, statements: D1PreparedStatement[] = [], recorded = false, recordInput?: VerifiedRunInput): VerifiedRunSubmissionPlan => ({ outcome, statements, recorded, ...(recordInput ? { recordInput } : {}) });
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

    const revision = await resolveMasteryGameplayRevision({
      mapId: matchingMaps[0].id,
      mapVariant: evidence.mapVariant,
      gameplayRevisionId: snapshotGameplayRevisionId(row),
    });
    if (!revision) return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "gameplay_revision_not_found", conflictFields: [] });
    const currentRevision = await db.select({ gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions).where(eq(submissions.id, row.id)).get();
    if (currentRevision?.gameplayRevisionId && currentRevision.gameplayRevisionId !== revision.id) return plan({ status: "ineligible", verifiedRunId: null, awardedXp: 0, reason: "submission_revision_mismatch", conflictFields: [] });

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
    };
    const recorded = await planVerifiedRunRecord(recordInput, rejectConcurrentInsert);
    const statements = [
      ...(!currentRevision?.gameplayRevisionId ? [database.prepare("UPDATE submissions SET gameplay_revision_id = ? WHERE id = ? AND gameplay_revision_id IS NULL").bind(revision.id, row.id)] : []),
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
    }, statements, recorded.statements.length === 0, recordInput);
  };

  const resolveVerifiedRunSubmissionOutcome = async (
    row: typeof submissions.$inferSelect,
    response: OcrResponse,
    acceptanceSource: "submission_automatic" | "submission_review",
    humanConfirmed = false,
  ): Promise<VerifiedRunSubmissionOutcome> => {
    const planned = await planVerifiedRunSubmissionOutcome(row, response, acceptanceSource, humanConfirmed);
    if (planned.statements.length) await database.batch(planned.statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    if (!planned.recordInput) return planned.outcome;
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
      gameplayRevisionId: snapshotGameplayRevisionId(row),
    });
    return revision?.id ?? null;
  };

  type AdminSubmissionChallenge =
    | { family: "map"; name: string; mapName: string; difficulty: string | null; kind?: "difficulty_completion" | "pioneer" | "classic_completion" | "map_title_achievement"; mapVariant?: "classic" }
    | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string; mapVariant?: "classic" };

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
      submissionIds.length ? db.select().from(ocrResults).where(inArray(ocrResults.submissionId, submissionIds)).orderBy(desc(ocrResults.createdAt)) : [],
      submissionIds.length ? db.select().from(submissionSpotChecks).where(inArray(submissionSpotChecks.submissionId, submissionIds)) : [],
      playerAccountIds.length ? db.select({ id: playerAccounts.id }).from(playerAccounts).where(inArray(playerAccounts.id, playerAccountIds)) : [],
      loadVerifiedRunSubmissionOutcomes(submissionIds),
      submissionIds.length ? db.select().from(submissionReviews).where(inArray(submissionReviews.submissionId, submissionIds)).orderBy(submissionReviews.createdAt, sql`rowid`) : [],
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
    let match: Record<string, unknown> | null = null;
    if (ocr?.matchJson) {
      try { match = JSON.parse(ocr.matchJson) as Record<string, unknown>; } catch { match = null; }
    }
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
      ocr: ocr?.responseJson ? JSON.parse(ocr.responseJson) : null,
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

  const persistOcrResult = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    status: string;
    responseJson?: string;
    matchJson?: string;
    nextStatus: string;
    reviewReason: string | null;
    incrementFailCount: boolean;
    allowExistingStatus: boolean;
    ruleSnapshotJson?: string | null;
    verifiedRunOutcome?: VerifiedRunSubmissionOutcome;
  }) => {
    const timestamp = now();
    const resultInsert = input.allowExistingStatus
      ? database.prepare(
        "INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.status, input.responseJson ?? null, input.matchJson ?? null, timestamp)
      : database.prepare(
        "INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')"
      ).bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.status, input.responseJson ?? null, input.matchJson ?? null, timestamp, input.submissionId);
    const submissionUpdate = database.prepare(
      "UPDATE submissions SET status = ?, review_reason = ?, ocr_fail_count = ocr_fail_count + ?, rule_snapshot_json = COALESCE(?, rule_snapshot_json), updated_at = ? WHERE id = ? AND status = 'ocr_pending'"
    ).bind(input.nextStatus, input.reviewReason, input.incrementFailCount ? 1 : 0, input.ruleSnapshotJson ?? null, timestamp, input.submissionId);
    await database.batch(input.verifiedRunOutcome ? [resultInsert, submissionUpdate, masterySubmissionOutcomeStatement(input.submissionId, input.verifiedRunOutcome)] : [resultInsert, submissionUpdate]);
  };

  const shouldSampleAutomaticDecision = async (submissionId: string) => {
    if (ocrAutoReviewSampleRate <= 0) return false;
    const digest = await hashRequest({ submissionId, policy: "ocr-auto-v1" });
    return Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff < ocrAutoReviewSampleRate;
  };

  const {
    batchPlanCanonicalChallenges,
    materializingCanonicalChallenges,
    planningCanonicalChallenges,
    loadCanonicalChallenges,
  } = createCanonicalChallengeServices(db);

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
      planInputs.push({ snapshot, timestamp: eligibilityAt });
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

  type ReviewEvidenceSelection = { challengeId: string; canonicalChallengeId: string; snapshot: MapTitleRuleSnapshot; canonicalChallengePlan: CanonicalChallengePlan; basis: "conditions" | "reviewer" };
  type ReviewReward = { challengeId: string; titleKey: string; titleName: string; mapId: string | null; gameplayRevisionId: string | null; slot: string | null; snapshot: MapTitleRuleSnapshot };

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
    if (!rawResponse) throw new Error("SUBMISSION_NOT_REVIEWABLE");
    const correctedResponse = applySubmissionFieldCorrections(rawResponse, fieldCorrections);
    const prepared = await preparePlayerAutoMatchChallenges(row, correctedResponse);
    const decision = matchOcrAgainstChallenges(prepared.candidates, correctedResponse, prepared.mapIdsByName, prepared.titleNamesByKey, true);
    const candidatesById = new globalThis.Map(decision.candidates.map((candidate) => [candidate.canonicalChallengeId, candidate]));
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
      const canonicalChallengePlan = prepared.canonicalChallengePlans.get(candidate.canonicalChallengeId);
      if (!canonicalChallengePlan) throw new Error("CHALLENGE_NOT_FOUND");
      return [{
        challengeId: candidate.challenge.challengeId,
        canonicalChallengeId: candidate.canonicalChallengeId,
        snapshot,
        canonicalChallengePlan,
        basis,
      }];
    });
    return { correctedResponse, prepared, decision, selections, ineligibleConfirmations };
  };

  // Resolves the Completion -> Grant chain that approving the selections would write,
  // without writing it. Throws the same business errors approval must surface.
  const planApprovalRewards = async (row: typeof submissions.$inferSelect, selectedRows: readonly ReviewEvidenceSelection[], canonicalChallenges: CanonicalChallengeResolver) => {
    const snapshotTitleKeys = [...new Set(selectedRows.map(({ snapshot }) => snapshot.titleKey))];
    const snapshotTitleRows = snapshotTitleKeys.length ? await db.select({ key: titleCatalog.key, label: titleCatalog.label }).from(titleCatalog).where(sql`${titleCatalog.key} IN (SELECT value FROM json_each(${JSON.stringify(snapshotTitleKeys)}))`) : [];
    const snapshotTitleNames = new globalThis.Map(snapshotTitleRows.map(({ key, label }) => [key, label]));
    const rewards: ReviewReward[] = selectedRows.map((selection) => {
      const { snapshot } = selection;
      const reward = { challengeId: selection.challengeId, titleKey: snapshot.titleKey, titleName: snapshotTitleNames.get(snapshot.titleKey) ?? snapshot.titleKey, mapId: snapshot.mapId, gameplayRevisionId: snapshot.gameplayRevisionId, slot: snapshot.slot, snapshot };
      if (reward.mapId && !reward.gameplayRevisionId) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
      return reward;
    });

    const canonicalChallengeIds = await canonicalChallenges.resolvePlans(selectedRows.map(({ canonicalChallengePlan }) => canonicalChallengePlan));
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

  const persistAutomaticDecision = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    responseJson: string;
    matchJson: string;
    grants: Array<{ snapshot: MapTitleRuleSnapshot; canonicalChallengeId: string; titleKey: string; mapId: string | null; slot: string | null; alreadyOwned: boolean; existingGrantId: string | null }>;
    completionRoots: Array<{ canonicalChallengeId: string; snapshot: MapTitleRuleSnapshot; slot: string | null }>;
    canonicalChallengePlans: ReadonlyMap<string, CanonicalChallengePlan>;
    sample: boolean;
    verifiedRunOutcome?: VerifiedRunSubmissionOutcome;
  }) => {
    const timestamp = now();
    const reviewId = crypto.randomUUID();
    const spotCheckId = crypto.randomUUID();
    const planIds = [...new Set([...input.grants, ...input.completionRoots].map((item) => item.canonicalChallengeId))];
    const plans = planIds.map((id) => {
      const plan = input.canonicalChallengePlans.get(id);
      if (!plan) throw new Error("CHALLENGE_NOT_FOUND");
      return plan;
    });
    await materializingCanonicalChallenges.resolvePlans(plans);
    const grants = input.grants.map((grant) => ({ ...grant, grantId: crypto.randomUUID() }));
    const primaryGrant = grants[0];
    if (!primaryGrant) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
    if (grants.some((grant) => grant.mapId !== null && !grant.snapshot.gameplayRevisionId)) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
    const submission = await db.select({ playerAccountId: submissions.playerAccountId, gameplayRevisionId: submissions.gameplayRevisionId, createdAt: submissions.createdAt }).from(submissions).where(eq(submissions.id, input.submissionId)).get();
    if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
    if (grants.some((grant) => grant.snapshot.gameplayRevisionId && submission.gameplayRevisionId && grant.snapshot.gameplayRevisionId !== submission.gameplayRevisionId)) throw new Error("SUBMISSION_REVISION_MISMATCH");
    const completionAwards = new Map<string, ChallengeCompletionAward>();
    const completionChains = await challengeCompletionChains({
      playerAccountId: submission.playerAccountId,
      roots: input.completionRoots.map((root) => ({ challengeId: root.canonicalChallengeId, slot: root.slot })),
      eligibilityAt: submission.createdAt,
    });
    for (const chain of completionChains) {
      for (const award of chain) addChallengeCompletionAward(completionAwards, award);
    }
    const completionAwardRows = [...completionAwards.values()].map((award) => ({
      ...award,
      grantId: grants.find((item) => titleGrantScopeKey(item) === titleGrantScopeKey(award))?.grantId ?? crypto.randomUUID(),
    }));
    const directGrantsByScope = new Map(grants.map((grant) => [titleGrantScopeKey(grant), grant]));
    const completionGrantsByScope = selectCompletionGrantAwards(completionAwardRows, directGrantsByScope);
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, 'matched', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.responseJson, input.matchJson, timestamp, input.submissionId),
      database.prepare("INSERT OR IGNORE INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, ?, 'approved', NULL, 'system:ocr', ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(reviewId, input.submissionId, timestamp, input.submissionId),
    ];
    for (const award of completionAwardRows) {
      statements.push(database.prepare("INSERT OR IGNORE INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) SELECT ?, ?, ?, ?, 'active', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending') AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(crypto.randomUUID(), submission.playerAccountId, award.challengeId, award.gameplayRevisionId, award.completionSourceType, input.submissionId, timestamp, timestamp, input.submissionId, reviewId));
    }
    for (const award of completionGrantsByScope.values()) {
      statements.push(database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) SELECT ?, ?, ?, ?, ?, ?, 'active', 'automatic', ?, 'system:ocr', ?, (SELECT completion.id FROM challenge_completions completion WHERE completion.player_account_id = ? AND completion.challenge_id = ? AND completion.status = 'active' AND completion.gameplay_revision_id IS ? LIMIT 1) WHERE EXISTS (SELECT 1 FROM challenge_completions completion WHERE completion.player_account_id = ? AND completion.challenge_id = ? AND completion.status = 'active' AND completion.gameplay_revision_id IS ?)").bind(award.grantId, submission.playerAccountId, award.titleKey, award.mapId, award.gameplayRevisionId, award.slot, input.submissionId, timestamp, submission.playerAccountId, award.challengeId, award.gameplayRevisionId, submission.playerAccountId, award.challengeId, award.gameplayRevisionId));
    }
    statements.push(
      database.prepare("UPDATE submissions SET status = 'approved', review_reason = NULL, gameplay_revision_id = COALESCE(gameplay_revision_id, ?), grant_id = (SELECT g.id FROM player_title_grants g WHERE g.player_account_id = submissions.player_account_id AND g.title_key = ? AND g.status = 'active' AND (g.map_id = ? OR (g.map_id IS NULL AND ? IS NULL)) AND (g.gameplay_revision_id = ? OR (g.gameplay_revision_id IS NULL AND ? IS NULL))), rule_snapshot_json = ?, updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(primaryGrant.snapshot.gameplayRevisionId, primaryGrant.titleKey, primaryGrant.mapId, primaryGrant.mapId, primaryGrant.snapshot.gameplayRevisionId, primaryGrant.snapshot.gameplayRevisionId, JSON.stringify(primaryGrant.snapshot), timestamp, input.submissionId, reviewId),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_review', 'submission', id, ?, ? FROM submissions WHERE id = ? AND status = 'approved' AND grant_id IS NOT NULL").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ requestId: input.requestId, attempt: input.attempt, decision: "approved", grants: grants.map(({ titleKey, mapId, slot, alreadyOwned }) => ({ titleKey, mapId, slot, alreadyOwned })), match: JSON.parse(input.matchJson), ruleSnapshot: primaryGrant.snapshot }), timestamp, input.submissionId),
    );
    if (input.verifiedRunOutcome) statements.push(masterySubmissionOutcomeStatement(input.submissionId, input.verifiedRunOutcome));
    for (const grant of grants) {
      const grantScope = `${grant.titleKey}:${grant.mapId ?? ""}:${grant.snapshot.gameplayRevisionId ?? ""}`;
      statements.push(
        approvedSubmissionOutcomeStatement({
          submissionId: input.submissionId,
          outcomeKey: `title_grant:${grantScope}`,
          outcomeType: "title_grant",
          status: grant.alreadyOwned ? "reused" : "created",
          entityId: grant.existingGrantId ?? grant.grantId,
          details: { titleKey: grant.titleKey, mapId: grant.mapId, gameplayRevisionId: grant.snapshot.gameplayRevisionId, slot: grant.slot },
        }),
      );
    }
    const titleGrantOutcomeScopes = new Set(grants.map(titleGrantScopeKey));
    for (const award of completionAwardRows) {
      statements.push(approvedSubmissionOutcomeStatement({ submissionId: input.submissionId, outcomeKey: `challenge:${award.challengeId}:${award.mapId ?? ""}:${award.gameplayRevisionId ?? ""}`, outcomeType: "challenge", status: "created", entityId: award.challengeId, details: { mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, titleKey: award.titleKey } }));
      const scope = titleGrantScopeKey(award);
      if (!award.root && award.grantable && !titleGrantOutcomeScopes.has(scope)) {
        titleGrantOutcomeScopes.add(scope);
        statements.push(approvedSubmissionOutcomeStatement({ submissionId: input.submissionId, outcomeKey: `title_grant:${scope}`, outcomeType: "title_grant", status: "created", entityId: award.grantId, details: { titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, slot: award.slot, satisfiedBy: award.satisfiedBy } }));
      }
      statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'challenge.completion.submission', 'challenge_completion', id, ?, ? FROM challenge_completions WHERE player_account_id = ? AND challenge_id = ? AND gameplay_revision_id IS ? AND status = 'active' AND source_id = ? LIMIT 1").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ submissionId: input.submissionId, challengeId: award.challengeId, titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, satisfaction: award.satisfiedBy }), timestamp, submission.playerAccountId, award.challengeId, award.gameplayRevisionId, input.submissionId));
    }
    for (const grant of grants) {
      statements.push(
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_grant', 'player_title_grant', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved') AND EXISTS (SELECT 1 FROM player_title_grants WHERE id = ?)").bind(crypto.randomUUID(), input.requestId, grant.grantId, JSON.stringify({ submissionId: input.submissionId, sourceType: "automatic", sourceId: input.submissionId, titleKey: grant.titleKey, mapId: grant.mapId, gameplayRevisionId: grant.snapshot.gameplayRevisionId, alreadyOwned: grant.alreadyOwned, ruleSnapshot: grant.snapshot }), timestamp, input.submissionId, grant.grantId),
      );
    }
    for (const [scope, award] of completionGrantsByScope) {
      if (directGrantsByScope.has(scope)) continue;
      statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_grant', 'player_title_grant', id, ?, ? FROM player_title_grants WHERE id = ?").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ submissionId: input.submissionId, sourceType: "automatic", titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, challengeId: award.challengeId, satisfiedBy: award.satisfiedBy }), timestamp, award.grantId));
    }
    if (input.sample) statements.push(database.prepare("INSERT OR IGNORE INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) SELECT ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved')").bind(spotCheckId, input.submissionId, JSON.stringify({ version: "ocr-auto-v1", sampleRate: ocrAutoReviewSampleRate }), timestamp, input.submissionId));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  const persistMasteryOnlyDecision = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    responseJson: string;
    matchJson: string;
    verifiedRunOutcome: VerifiedRunSubmissionOutcome;
    sample: boolean;
  }) => {
    if (!["created", "reused"].includes(input.verifiedRunOutcome.status)) throw new Error("VERIFIED_RUN_OUTCOME_NOT_ACCEPTED");
    const timestamp = now();
    const reviewId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, 'matched', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.responseJson, input.matchJson, timestamp, input.submissionId),
      database.prepare("INSERT OR IGNORE INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, ?, 'approved', NULL, 'system:ocr', ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(reviewId, input.submissionId, timestamp, input.submissionId),
      database.prepare("UPDATE submissions SET status = 'approved', review_reason = NULL, grant_id = NULL, updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(timestamp, input.submissionId, reviewId),
      masterySubmissionOutcomeStatement(input.submissionId, input.verifiedRunOutcome),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_mastery', 'submission', id, ?, ? FROM submissions WHERE id = ? AND status = 'approved' AND grant_id IS NULL").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ requestId: input.requestId, attempt: input.attempt, decision: "approved", verifiedRunOutcome: { status: input.verifiedRunOutcome.status, awardedXp: input.verifiedRunOutcome.awardedXp } }), timestamp, input.submissionId),
    ];
    if (input.sample) statements.push(database.prepare("INSERT OR IGNORE INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) SELECT ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved')").bind(crypto.randomUUID(), input.submissionId, JSON.stringify({ version: "ocr-auto-v1", sampleRate: ocrAutoReviewSampleRate }), timestamp, input.submissionId));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  const recordVerifiedRun = async (input: VerifiedRunInput): Promise<RecordVerifiedRunResult> => {
    const planned = await planVerifiedRunRecord(input);
    if (!planned.statements.length) return planned.result;
    await database.batch(planned.statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    const persistedBySource = await db.select().from(verifiedRuns).where(eq(verifiedRuns.sourceSubmissionId, planned.candidate.sourceSubmissionId)).get();
    const persisted = persistedBySource ?? await db.select().from(verifiedRuns).where(and(
      eq(verifiedRuns.playerAccountId, planned.candidate.playerAccountId),
      eq(verifiedRuns.matchCode, planned.candidate.matchCode),
    )).get();
    if (!persisted) throw new Error("VERIFIED_RUN_PERSIST_FAILED");
    const run = asVerifiedRun(persisted);
    if (persisted.id === planned.result.run.runId) return { outcome: "created", run };
    const conflictFields = masteryConflictFields(run, planned.candidate);
    return conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run };
  };

  type SubmissionReviewWrite = {
    row: typeof submissions.$inferSelect;
    input: Parameters<PlatformServices["reviewSubmission"]>[0];
    auth: AuthContext;
    reviewId: string; timestamp: number;
    idempotencyKeyId: string; requestHash: string;
    response: AdminSubmissionReviewResponse; reviewAudit: unknown;
    statements: D1PreparedStatement[]; trailingStatements: D1PreparedStatement[];
  };

  const persistSubmissionReview = async (review: SubmissionReviewWrite) => {
    await database.batch([
      database.prepare("INSERT INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, id, ?, ?, ?, ? FROM submissions WHERE id = ?").bind(review.reviewId, review.input.decision, review.input.reason ?? null, review.auth.subject, review.timestamp, review.row.id),
      ...review.statements,
      database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, 'submission.review', ?, ?, ? FROM submission_reviews WHERE id = ?").bind(review.idempotencyKeyId, review.auth.subject, review.requestHash, JSON.stringify(review.response), review.timestamp, review.reviewId),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.review', 'submission', submission_id, ?, ? FROM submission_reviews WHERE id = ?").bind(crypto.randomUUID(), crypto.randomUUID(), review.auth.actorType, review.auth.subject, JSON.stringify(review.reviewAudit), review.timestamp, review.reviewId),
      ...review.trailingStatements,
    ] as [D1PreparedStatement, ...D1PreparedStatement[]]);
    if (!(await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(eq(idempotencyKeys.id, review.idempotencyKeyId)).get())) throw new Error("SUBMISSION_NOT_REVIEWABLE");
  };

  const { prepareVerifiedRunTransitionStatements, transitionVerifiedRun, ...adminVerifiedRunServices } = createAdminVerifiedRunServices({
    database,
    db,
    now,
    replayOrConflict: databaseServiceDependencies.replayOrConflict,
    recordIdempotency: databaseServiceDependencies.recordIdempotency,
    conflictFieldsForOutcome: (row) => asVerifiedRunSubmissionOutcome(row).conflictFields,
    loadSourceSubmission: async (row) => asAdminSubmission(row, await resolveAdminSubmissionDetails([row])),
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

    ...createAgentServices(db, {
      database,
      now,
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
    }),
    async listChallenges(input) {
      const items: Challenge[] = [];
      if (!input?.family || input.family === "map") {
        const rows = await mapChallengeQuery()
          .orderBy(maps.name, achievementChallenges.name);
        items.push(...rows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
        items.push(...await loadMapTitleRuleChallenges());
        items.push(...await loadMapScopedTitleChallenges());
      }
      if (!input?.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.lifecycle, "active")))
          .orderBy(titleCatalog.category, titleCatalog.label);
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

    async listAdminChallenges(input) {
      const items: AdminChallenge[] = [];
      if (!input.family || input.family === "map") {
        const rows = await db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .innerJoin(gameplayRevisionChallengeAssignments, enabledMapChallengeAssignment())
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(
            input.status ? eq(achievementChallenges.status, input.status === "retired" ? "inactive" : input.status) : undefined,
            eq(gameplayRevisions.mapId, achievementChallenges.mapId),
            inArray(gameplayRevisions.lifecycle, ["default", "selectable", "historical"]),
            notExists(db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId })
              .from(mapTitleRuleCompat)
              .where(and(
                eq(mapTitleRuleCompat.legacyChallengeId, achievementChallenges.id),
                eq(mapTitleRuleCompat.mapId, achievementChallenges.mapId),
              )))
          ))
          .orderBy(maps.name, achievementChallenges.name);
        items.push(...rows.map(({ challenge, map, assignment, revision }): AdminChallenge => ({
          ...toPublicMapChallenge(challenge, map, assignment, revision),
          status: challenge.status === "inactive" ? "retired" : challenge.status as "active" | "sunsetting",
          introducedVersion: challenge.introducedVersion,
          retiredVersion: challenge.retiredVersion,
        })));
        const ruleItems = await loadMapTitleRuleChallenges();
        items.push(...ruleItems.filter((item) => !input.status || item.status === input.status).map((item) => ({
          ...item,
          condition: item.condition!, evidenceRule: item.evidenceRule!, submissionMode: item.submissionMode!,
          introducedVersion: item.gameVersion, retiredVersion: item.retiredVersion ?? null,
        }) as AdminChallenge));
        const scopedTitleItems = await loadMapScopedTitleChallenges();
        items.push(...scopedTitleItems.filter((item) => !input.status || item.status === input.status).map((item) => ({
          ...item,
          condition: item.condition!, evidenceRule: item.evidenceRule!, submissionMode: item.submissionMode!,
          introducedVersion: item.gameVersion, retiredVersion: item.retiredVersion ?? null,
        }) as AdminChallenge));
      }
      if (!input.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(input.status ? eq(titleChallenges.status, input.status) : undefined)
          .orderBy(titleCatalog.category, titleCatalog.label);
        const mapScopedIds = rows.filter(({ challenge }) => (challenge.scope ?? "global") === "map").map(({ challenge }) => challenge.id);
        const mapIdsByChallenge = await loadChallengeMapIds(mapScopedIds);
        items.push(...rows.filter(({ challenge }) => !((challenge.scope ?? "global") === "map" && challenge.mapVariant)).map(({ challenge, title }): AdminChallenge => ({
          ...toTitleChallengeBase(challenge, title),
          categoryOverride: challenge.categoryOverride,
          gameVersion: challenge.gameVersion,
          status: challenge.status as "active" | "sunsetting" | "retired",
          introducedVersion: challenge.introducedVersion,
          retiredVersion: challenge.retiredVersion,
          startsAt: challenge.startsAt,
          endsAt: challenge.endsAt,
          scope: (challenge.scope ?? "global") as "global" | "map",
          mapIds: (challenge.scope ?? "global") === "map" ? (mapIdsByChallenge.get(challenge.id) ?? []) : [],
          ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}),
        })));
      }
      if (!input.family) {
        if (input.status === "sunsetting") return { contractVersion: "1" as const, items };
        const rows = await db.select({ title: titleCatalog, challenge: titleChallenges })
          .from(titleCatalog)
          .leftJoin(titleChallenges, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(input.status && input.status !== "sunsetting" ? eq(titleCatalog.lifecycle, input.status) : undefined);
        const catalogTitles = new Map<string, { title: typeof titleCatalog.$inferSelect; hasChallenge: boolean }>();
        for (const { title, challenge } of rows) {
          const existing = catalogTitles.get(title.key);
          catalogTitles.set(title.key, { title, hasChallenge: Boolean(existing?.hasChallenge || challenge) });
        }
        items.push(...[...catalogTitles.values()].map(({ title, hasChallenge }): AdminChallenge => {
          const { label: titleName, ...titleFields } = toAgentTitle(title);
          return {
            ...titleFields,
            challengeId: `title.${title.key}`,
            family: "title_catalog",
            type: "title_catalog",
            titleName,
            publicVisibility: title.publicVisibility === 1,
            gameVersion: title.gameVersion,
            status: title.lifecycle as "draft" | "active" | "retired",
            hasChallenge,
          };
        }));
      }
      return { contractVersion: "1" as const, items };
    },

    async listAdminMapTitleRules() {
      const rows = await db.select({ rule: mapTitleRules, title: titleCatalog })
        .from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .orderBy(mapTitleRules.kind);
      return { contractVersion: "1" as const, items: rows.map(({ rule, title }) => asAdminMapTitleRule(rule, title.label)) };
    },

    async createAdminMapTitleRule(input: AdminMapTitleRuleCreateRequest, auth, idempotencyKey) {
      assertMapTitleRuleScope(input.kind, input.defaultScope);
      const replay = await replayOrConflict<AdminMapTitleRule>(db, auth.subject, "admin.map-title-rule.create", idempotencyKey, input);
      if (replay) return replay;
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title || title.scope !== "map") throw new Error("MAP_TITLE_NOT_FOUND");
      const existing = await db.select({ id: mapTitleRules.id }).from(mapTitleRules).where(eq(mapTitleRules.kind, input.kind)).get();
      if (existing) throw new Error("MAP_TITLE_RULE_KIND_CONFLICT");
      const timestamp = now();
      const rule = { id: crypto.randomUUID(), titleKey: input.titleKey, kind: input.kind, condition: input.condition, evidenceRule: input.evidenceRule, submissionMode: input.submissionMode, displayKind: input.displayKind, slot: input.slot, mapVariant: input.mapVariant ?? null, defaultScope: input.defaultScope, status: input.status === "retired" ? "inactive" : input.status, introducedVersion: input.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion ?? null : null, createdAt: timestamp, updatedAt: timestamp };
      await db.insert(mapTitleRules).values(rule);
      await materializeDefaultMapTitleRuleAssignments(rule);
      const response = asAdminMapTitleRule(rule, title.label);
      await recordIdempotency(db, auth.subject, "admin.map-title-rule.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map-title-rule.create", "map_title_rule", rule.id, input);
      return response;
    },

    async updateAdminMapTitleRule(input: AdminMapTitleRuleUpdateRequest & { ruleId: string }, auth, idempotencyKey) {
      assertMapTitleRuleScope(input.kind, input.defaultScope);
      const replay = await replayOrConflict<AdminMapTitleRule>(db, auth.subject, "admin.map-title-rule.update", idempotencyKey, input);
      if (replay) return replay;
      const row = await db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key)).where(eq(mapTitleRules.id, input.ruleId)).get();
      if (!row) throw new Error("MAP_TITLE_RULE_NOT_FOUND");
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title || title.scope !== "map") throw new Error("MAP_TITLE_NOT_FOUND");
      const conflict = await db.select({ id: mapTitleRules.id }).from(mapTitleRules).where(and(eq(mapTitleRules.kind, input.kind), ne(mapTitleRules.id, input.ruleId))).get();
      if (conflict) throw new Error("MAP_TITLE_RULE_KIND_CONFLICT");
      const updatedAt = now();
      const next = { ...row.rule, titleKey: input.titleKey, kind: input.kind, condition: input.condition, evidenceRule: input.evidenceRule, submissionMode: input.submissionMode, displayKind: input.displayKind, slot: input.slot, mapVariant: input.mapVariant ?? null, defaultScope: input.defaultScope, status: input.status === "retired" ? "inactive" : input.status, introducedVersion: input.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion ?? null : null, updatedAt };
      await db.update(mapTitleRules).set(next).where(eq(mapTitleRules.id, input.ruleId));
      await materializeDefaultMapTitleRuleAssignments(next);
      const response = asAdminMapTitleRule(next, title.label);
      await recordIdempotency(db, auth.subject, "admin.map-title-rule.update", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map-title-rule.update", "map_title_rule", input.ruleId, input);
      return response;
    },

    async listAdminMapTitleInheritance(input) {
      const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
      if (!map) throw new Error("MAP_NOT_FOUND");
      const rows = await db.select({ rule: mapTitleRules, title: titleCatalog, exception: mapTitleRuleExceptions })
        .from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .leftJoin(mapTitleRuleExceptions, and(eq(mapTitleRuleExceptions.ruleId, mapTitleRules.id), eq(mapTitleRuleExceptions.mapId, input.mapId)))
        .orderBy(mapTitleRules.kind);
      const items = await Promise.all(rows.map(async ({ rule, title, exception }) => {
        const projection = await resolveMapTitleProjection(rule.id, input.mapId);
        return { mapId: input.mapId, rule: asAdminMapTitleRule(rule, title.label), projected: projection !== null, source: "map_title_rule" as const,
          effective: projection ? { condition: projection.condition, evidenceRule: projection.evidenceRule, submissionMode: projection.submissionMode as "manual" | "automatic", slot: projection.slot as "pioneer" | "conqueror" | "dominator" | null } : null,
          exception: exception ? { exceptionId: exception.id, ruleId: exception.ruleId, mapId: exception.mapId, enabled: exception.enabled === 1, condition: exception.condition, evidenceRule: exception.evidenceRule, submissionMode: exception.submissionMode as "manual" | "automatic" | null, slot: exception.slot as "pioneer" | "conqueror" | "dominator" | null, startsAt: exception.startsAt, endsAt: exception.endsAt } : null };
      }));
      return { contractVersion: "1" as const, items };
    },

    async upsertAdminMapTitleRuleException(input: AdminMapTitleRuleExceptionUpsertRequest & { mapId: string; ruleId: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.map-title-rule-exception.upsert", idempotencyKey, input);
      if (replay) return;
      const [map, rule] = await Promise.all([db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get(), db.select({ id: mapTitleRules.id, kind: mapTitleRules.kind }).from(mapTitleRules).where(eq(mapTitleRules.id, input.ruleId)).get()]);
      if (!map) throw new Error("MAP_NOT_FOUND");
      if (!rule) throw new Error("MAP_TITLE_RULE_NOT_FOUND");
      const startsAt = input.startsAt ?? null;
      const endsAt = input.endsAt ?? null;
      if (rule.kind.trim().toLocaleLowerCase() === "pioneer" && input.enabled && (startsAt === null || endsAt === null || endsAt <= startsAt)) throw new Error("PIONEER_EXCEPTION_SCHEDULE_REQUIRED");
      const timestamp = now();
      const operation = "admin.map-title-rule-exception.upsert";
      const requestHash = await hashRequest(input);
      await database.batch([
        database.prepare("INSERT INTO map_title_rule_exceptions (id,rule_id,map_id,enabled,condition,evidence_rule,submission_mode,slot,starts_at,ends_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(rule_id,map_id) DO UPDATE SET enabled=excluded.enabled, condition=excluded.condition, evidence_rule=excluded.evidence_rule, submission_mode=excluded.submission_mode, slot=excluded.slot, starts_at=excluded.starts_at, ends_at=excluded.ends_at, updated_at=excluded.updated_at")
          .bind(crypto.randomUUID(), input.ruleId, input.mapId, input.enabled ? 1 : 0, input.condition ?? null, input.evidenceRule ?? null, input.submissionMode ?? null, input.slot ?? null, startsAt, endsAt, timestamp, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)")
          .bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, requestHash, JSON.stringify({}), timestamp),
        database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
          .bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, "map_title_rule_exception", `${input.ruleId}:${input.mapId}`, JSON.stringify(input), timestamp),
      ]);
    },

    async createAdminAchievement(input: AdminAchievementCreateRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminChallenge>(db, auth.subject, "admin.achievement.create", idempotencyKey, input);
      if (replay) return replay;
      if (input.status !== "scheduled" && !input.gameVersion?.trim()) throw new Error("ACHIEVEMENT_GAME_VERSION_REQUIRED");
      const existing = await db.select({ key: titleCatalog.key, category: titleCatalog.category }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (existing) throw new Error("TITLE_KEY_CONFLICT");
      const targetMapIds = [...new Set(input.mapIds)];
      await validateChallengeMapScope(input.scope, targetMapIds);
      const timestamp = now();
      const challengeId = `title.${input.titleKey}`;
      const mapVariant = input.mapVariant ?? null;
      const revisions = input.scope === "map" ? await loadTitleChallengeRevisions(targetMapIds, mapVariant) : [];
      const response: AdminChallenge = {
        challengeId,
        family: "achievement",
        type: "title_achievement",
        kind: "title_achievement",
        titleKey: input.titleKey,
        titleName: input.titleName,
        icon: input.icon,
        iconUrl: input.iconUrl,
        category: input.categoryOverride ?? input.category,
        categoryOverride: input.categoryOverride,
        condition: input.condition,
        evidenceRule: input.evidenceRule,
        gameVersion: input.gameVersion ?? null,
        status: input.status,
        submissionMode: input.submissionMode,
        introducedVersion: input.gameVersion ?? null,
        retiredVersion: input.status === "sunsetting" ? input.retiredVersion ?? null : null,
        startsAt: input.status === "scheduled" ? input.startsAt ?? null : null,
        endsAt: input.status === "scheduled" ? input.endsAt ?? null : null,
        scope: input.scope,
        mapIds: targetMapIds,
        ...(input.mapVariant ? { mapVariant: input.mapVariant } : {}),
      };
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT INTO title_catalog (key,label,icon,icon_url,category,condition,lifecycle,scope,display_kind,color_json,game_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(input.titleKey, input.titleName, input.icon, input.iconUrl, input.category, input.condition, input.status === "retired" ? "retired" : "active", input.scope, "fixed", "null", input.gameVersion ?? null),
        database.prepare("INSERT INTO title_challenges (id,title_key,category_override,condition,evidence_rule,submission_mode,game_version,status,introduced_version,retired_version,starts_at,ends_at,scope,map_variant,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(challengeId, input.titleKey, input.categoryOverride, input.condition, input.evidenceRule, input.submissionMode, input.gameVersion ?? null, input.status, input.gameVersion ?? null, input.status === "sunsetting" ? input.retiredVersion ?? null : null, input.status === "scheduled" ? input.startsAt ?? null : null, input.status === "scheduled" ? input.endsAt ?? null : null, input.scope, input.mapVariant ?? null, timestamp, timestamp),
        ...targetMapIds.map((mapId) => database.prepare("INSERT INTO achievement_challenge_maps (challenge_id,map_id) VALUES (?,?)").bind(challengeId, mapId)),
        ...revisions.map(({ revision }) => database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, created_at, updated_at) VALUES (?, ?, ?, 'title_challenge', ?, 1, ?, ?)").bind(`assignment:${revision.id}:title_challenge:${challengeId}`, revision.id, revision.mapId, challengeId, timestamp, timestamp)),
        database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(`${auth.subject}:admin.achievement.create:${idempotencyKey}`, auth.subject, "admin.achievement.create", await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, "admin.achievement.create", "challenge", challengeId, JSON.stringify({ ...input, mapIds: targetMapIds }), timestamp),
      ];
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return response;
    },

    async updateAdminChallenge(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminChallenge>(db, auth.subject, "admin.achievement.update", idempotencyKey, input); if (replay) return replay;
      const timestamp = now();
      if (input.family === "map") {
        const row = await db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(eq(achievementChallenges.id, input.challengeId)).get();
        if (!row) throw new Error("CHALLENGE_NOT_FOUND");
        const projection = await db.select({ gameplayRevisionId: gameplayRevisions.id })
          .from(gameplayRevisionChallengeAssignments)
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(
            eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
            eq(gameplayRevisionChallengeAssignments.challengeId, row.challenge.id),
            eq(gameplayRevisionChallengeAssignments.mapId, row.map.id),
            eq(gameplayRevisionChallengeAssignments.enabled, 1),
            eq(gameplayRevisions.mapId, row.map.id),
            inArray(gameplayRevisions.lifecycle, ["default", "selectable", "historical"]),
          ))
          .orderBy(gameplayRevisions.lifecycle, gameplayRevisions.id)
          .get();
        if (!projection) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
        const name = input.name ?? row.challenge.name;
        const difficulty = input.difficulty !== undefined ? input.difficulty : row.challenge.difficulty;
        const condition = input.condition ?? row.challenge.condition;
        const evidenceRule = input.evidenceRule ?? row.challenge.evidenceRule;
        const submissionMode = input.submissionMode ?? row.challenge.submissionMode;
        await db.update(achievementChallenges).set({ name, difficulty, condition, evidenceRule, submissionMode, status: input.status === "retired" ? "inactive" : input.status, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, updatedAt: timestamp }).where(eq(achievementChallenges.id, row.challenge.id));
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "map", gameplayRevisionId: projection.gameplayRevisionId, type: "map_completion", kind: row.challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name, mapId: row.map.id, mapName: row.map.name, difficulty: difficulty ?? undefined, condition, evidenceRule, submissionMode: submissionMode as "manual" | "automatic", gameVersion: row.challenge.gameVersion, status: input.status, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
        return response;
      }
      const row = await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, input.challengeId)).get();
      if (!row) throw new Error("CHALLENGE_NOT_FOUND");
      const scope = input.scope ?? (row.challenge.scope as "global" | "map" ?? "global");
      const mapIds = input.mapIds !== undefined ? [...new Set(input.mapIds)] : (scope === "map" ? (await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, row.challenge.id))).map(({ mapId }) => mapId) : []);
      await validateChallengeMapScope(scope, mapIds);
      const gameVersion = input.gameVersion !== undefined ? input.gameVersion : row.challenge.gameVersion;
      const introducedVersion = row.challenge.introducedVersion ?? input.gameVersion ?? null;
      const hasReleaseHistory = row.challenge.introducedVersion !== null || row.challenge.gameVersion !== null;
      if (input.gameVersion === null && hasReleaseHistory) throw new Error("ACHIEVEMENT_GAME_VERSION_REQUIRED");
      if (input.status !== "scheduled" && !gameVersion?.trim()) throw new Error("ACHIEVEMENT_GAME_VERSION_REQUIRED");
      await db.update(titleChallenges).set({
        condition: input.condition,
        evidenceRule: input.evidenceRule,
        submissionMode: input.submissionMode,
        categoryOverride: input.categoryOverride,
        status: input.status,
        retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null,
        startsAt: input.status === "scheduled" ? input.startsAt ?? null : null,
        endsAt: input.status === "scheduled" ? input.endsAt ?? null : null,
        scope,
        mapVariant: scope === "global" ? null : input.mapVariant !== undefined ? input.mapVariant : row.challenge.mapVariant,
        gameVersion,
        introducedVersion,
        updatedAt: timestamp,
      }).where(eq(titleChallenges.id, row.challenge.id));
      if (input.scope !== undefined || input.mapIds !== undefined) {
        await db.delete(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, row.challenge.id));
        if (scope === "map" && mapIds.length) await db.insert(achievementChallengeMaps).values(mapIds.map((mapId) => ({ challengeId: row.challenge.id, mapId })));
      }
      await db.update(titleCatalog).set({ gameVersion }).where(eq(titleCatalog.key, row.title.key));
      if (scope === "map") {
        const mapVariant = input.mapVariant !== undefined ? input.mapVariant : (row.challenge.mapVariant as "classic" | null) ?? null;
        const revisions = await loadTitleChallengeRevisions(mapIds, mapVariant);
        if (revisions.length) await db.insert(gameplayRevisionChallengeAssignments).values(revisions.map(({ revision }) => ({
          id: `assignment:${revision.id}:title_challenge:${row.challenge.id}`,
          gameplayRevisionId: revision.id,
          mapId: revision.mapId,
          challengeFamily: "title_challenge",
          challengeId: row.challenge.id,
          enabled: 1,
          condition: null,
          evidenceRule: null,
          submissionMode: null,
          slot: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))).onConflictDoNothing();
      }
      if (input.iconUrl !== undefined) {
        await db.update(titleCatalog).set({ iconUrl: input.iconUrl, iconObjectKey: input.iconUrl === row.title.iconUrl ? row.title.iconObjectKey : null }).where(eq(titleCatalog.key, row.title.key));
        if (input.iconUrl !== row.title.iconUrl && row.title.iconObjectKey && evidenceBucket) await evidenceBucket.delete(row.title.iconObjectKey);
      }
      const response: AdminChallenge = { challengeId: row.challenge.id, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: row.title.key, titleName: row.title.label, icon: row.title.icon, iconUrl: input.iconUrl !== undefined ? input.iconUrl : row.title.iconUrl, category: input.categoryOverride ?? row.title.category, categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion, status: input.status, submissionMode: input.submissionMode, introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, startsAt: input.status === "scheduled" ? input.startsAt ?? null : null, endsAt: input.status === "scheduled" ? input.endsAt ?? null : null, scope, mapIds, ...(input.mapVariant !== undefined ? { mapVariant: input.mapVariant } : row.challenge.mapVariant ? { mapVariant: row.challenge.mapVariant as "classic" } : {}) };
      await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
      return response;
    },

    async updateAdminCatalogTitle(input: AdminCatalogTitleUpdateRequest & { titleKey: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.catalog.update", idempotencyKey, input); if (replay) return;
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title) throw new Error("TITLE_NOT_FOUND");
      const lifecycle = input.lifecycle ?? (input.status === undefined ? title.lifecycle as "draft" | "active" | "retired" : input.status === "retired" ? "retired" : "active");
      const challengeStatus = input.status ?? (lifecycle === "retired" ? "retired" : "active");
      await db.update(titleCatalog).set({
        lifecycle,
        ...(input.publicVisibility !== undefined ? { publicVisibility: input.publicVisibility ? 1 : 0 } : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.displayKind !== undefined ? { displayKind: input.displayKind } : {}),
        ...(input.color !== undefined ? { colorJson: JSON.stringify(input.color) } : {}),
      }).where(eq(titleCatalog.key, input.titleKey));
      if (input.iconUrl !== undefined) await db.update(titleCatalog).set({ iconUrl: input.iconUrl, iconObjectKey: input.iconUrl === title.iconUrl ? title.iconObjectKey : null }).where(eq(titleCatalog.key, title.key));
      const hasChallengeFields = input.condition !== undefined || input.evidenceRule !== undefined || input.submissionMode !== undefined || input.categoryOverride !== undefined || input.iconUrl !== undefined || input.startsAt !== undefined || input.endsAt !== undefined || input.retiredVersion !== undefined;
      if (hasChallengeFields && title.category === "开发保留") throw new Error("DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE");
      if (hasChallengeFields && title.category !== "开发保留") {
        const timestamp = now();
        await db.insert(titleChallenges).values({
          id: `title.${title.key}`,
          titleKey: title.key,
          categoryOverride: input.categoryOverride ?? null,
          condition: input.condition ?? title.condition,
          evidenceRule: input.evidenceRule ?? "上传包含结算画面、称号条件与玩家信息的完整截图。",
          submissionMode: input.submissionMode ?? "manual",
          gameVersion: title.gameVersion,
          status: challengeStatus,
          introducedVersion: title.gameVersion,
          retiredVersion: challengeStatus === "sunsetting" ? input.retiredVersion! : null,
          startsAt: challengeStatus === "scheduled" ? input.startsAt! : null,
          endsAt: challengeStatus === "scheduled" ? input.endsAt! : null,
          scope: title.scope as "global" | "map",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      await recordIdempotency(db, auth.subject, "admin.title.catalog.update", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.title.catalog.update", "title_catalog", input.titleKey, { previousLifecycle: title.lifecycle, lifecycle, previousPublicVisibility: title.publicVisibility === 1, publicVisibility: input.publicVisibility ?? title.publicVisibility === 1 });
    },

    async uploadAdminTitleIcon(input, auth) {
      if (!evidenceBucket) throw new Error("ICON_BUCKET_UNAVAILABLE");
      const extension = titleIconContentTypes.get(input.contentType);
      if (!extension || input.body.byteLength === 0 || input.body.byteLength > maxTitleIconBytes) throw new Error("ICON_FILE_INVALID");
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title) throw new Error("TITLE_NOT_FOUND");
      const version = crypto.randomUUID();
      const objectKey = `public/achievement-icons/${encodeURIComponent(input.titleKey)}/${version}.${extension}`;
      await evidenceBucket.put(objectKey, input.body, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } });
      const iconUrl = `${uploadOrigin}/v1/public/achievement-icons/${encodeURIComponent(input.titleKey)}/${version}`;
      await db.update(titleCatalog).set({ iconUrl, iconObjectKey: objectKey }).where(eq(titleCatalog.key, input.titleKey));
      if (title.iconObjectKey) await evidenceBucket.delete(title.iconObjectKey);
      await recordAudit(db, auth, "admin.title.icon.upload", "title_catalog", input.titleKey, { contentType: input.contentType, byteSize: input.body.byteLength });
      return { iconUrl };
    },

    async getPublicTitleIcon(input) {
      if (!evidenceBucket) return null;
      const title = await db.select({ objectKey: titleCatalog.iconObjectKey, lifecycle: titleCatalog.lifecycle, publicVisibility: titleCatalog.publicVisibility }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title?.objectKey || title.lifecycle === "draft" || title.publicVisibility !== 1) return null;
      if (input.version !== undefined && titleIconVersionOf(title.objectKey) !== input.version) return null;
      const object = await evidenceBucket.get(title.objectKey);
      if (!object) return null;
      return { body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream", etag: object.httpEtag };
    },

    async listTitles(input) {
      const globalRows = await db.select().from(titleCatalog).where(and(eq(titleCatalog.scope, "global"), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion))).orderBy(titleCatalog.key);
      const globalTitles: Title[] = globalRows.map((row) => ({
        ...titleCatalogView(row),
        scope: "global",
        gameVersion: row.gameVersion!,
      }));
      if (!input.mapId) return globalTitles;
      const [mapRows, customCandidates, mapIdsByChallenge] = await Promise.all([
        db.select({ title: titleCatalog, reward: mapTitleRewards })
          .from(mapTitleRewards)
          .innerJoin(titleCatalog, eq(mapTitleRewards.titleKey, titleCatalog.key))
          .where(and(eq(mapTitleRewards.mapId, input.mapId), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion))).orderBy(titleCatalog.key),
        db.select({ title: titleCatalog, challenge: titleChallenges })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(eq(titleChallenges.scope, "map"), eq(titleCatalog.scope, "map"), ne(titleCatalog.lifecycle, "draft"), eq(titleCatalog.publicVisibility, 1), isNotNull(titleCatalog.gameVersion))),
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
      const customTitles = customMapRows.filter(({ title, challenge }) => !mappedKeys.has(title.key) && titleChallengeIsSubmittable(challenge.status, challenge.startsAt, challenge.endsAt, timestamp, challenge.gameVersion)).map(({ title }): Title => ({
        ...titleCatalogView(title),
        scope: "map",
        mapId: input.mapId,
        gameVersion: title.gameVersion!,
      }));
      return globalTitles.concat(mappedTitles, customTitles);
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
      if (input.spotCheck) {
        const spotChecks = await db.select({ submissionId: submissionSpotChecks.submissionId }).from(submissionSpotChecks).where(eq(submissionSpotChecks.status, input.spotCheck));
        conditions.push(spotChecks.length ? inArray(submissions.id, spotChecks.map(({ submissionId }) => submissionId)) : eq(submissions.id, "__no_matching_spot_check__"));
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
        database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) SELECT ?, ?, 0, 'pending', ? WHERE changes() = 1").bind(pendingResultId, row.id, timestamp),
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
        await ocrQueue.send({ version: 1, submissionId: row.id, objectKey: attachment.objectKey, manual: true, ...(requestId ? { requestId } : {}) });
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

    async resolveAdminSubmissionSpotCheck(input, auth, idempotencyKey): Promise<AdminSubmissionSpotCheckResponse> {
      const replay = await replayOrConflict<AdminSubmissionSpotCheckResponse>(db, auth.subject, "submission.spot_check.resolve", idempotencyKey, input);
      if (replay) return replay;
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
        ...(raw ? { ocr: { mapName: raw.data?.map_name ?? null, difficulty: raw.data?.difficulty ?? null, playerName: raw.data?.viewer_player ?? null, challengeCompleted: raw.data?.challenge_completed ?? null, achievementTitles: raw.data?.achievement_titles ?? [] } } : {}),
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
      const candidates = evidence.decision.candidates.map(({ challenge, canonicalChallengeId, evaluation, quality }): AdminSubmissionReviewCandidate => {
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
        try { rewards = await planApprovalRewards(row, evidence.selections, canonicalChallenges); }
        catch (error) {
          const code = error instanceof Error ? error.message : "";
          if (!["CHALLENGE_REWARD_NOT_CONFIGURED", "GAMEPLAY_REVISION_NOT_FOUND", "CHALLENGE_NOT_FOUND", "CHALLENGE_NOT_COMPLETABLE", "TITLE_GRANT_ADMINISTRATIVELY_REVOKED", "TITLE_NOT_FOUND"].includes(code)) throw error;
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

      const verifiedRunPlan = await planVerifiedRunSubmissionOutcome(row, evidence.correctedResponse, "submission_review", true);
      const verifiedRunAccepted = verifiedRunPlan.outcome.status === "created" || verifiedRunPlan.outcome.status === "reused";
      const verifiedRun = verifiedRunAccepted
        ? verifiedRunPlan.recorded
          ? { status: "recorded" as const, reason: null }
          : { status: "eligible" as const, reason: null }
        : { status: "ineligible" as const, reason: verifiedRunPlan.outcome.reason };
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
        verifiedRun,
        approvable: blockingCode === null,
        blockingCode,
      };
    },

    async reviewSubmission(input, auth, idempotencyKey): Promise<AdminSubmissionReviewResponse> {
      const replay = await replayOrConflict<AdminSubmissionReviewResponse>(db, auth.subject, "submission.review", idempotencyKey, input);
      if (replay) return replay;
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
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
        if (selectedRows.length) approvalRewards = await planApprovalRewards(row, selectedRows, materializingCanonicalChallenges);
        verifiedRunPlan = await planVerifiedRunSubmissionOutcome(row, evidence.correctedResponse, "submission_review", true, true);
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
        const reviewAudit = { decision: input.decision, reason: input.reason ?? null, grants, selections: selectedRows.map((selection) => ({ challengeId: selection.challengeId, mapId: selection.snapshot.mapId, gameplayRevisionId: selection.snapshot.gameplayRevisionId, basis: selection.basis })), evidenceMatchOutcome: reviewedMatchOutcome, evidenceMatchedChallengeIds: reviewedChallengeIds, reviewerConfirmedChallengeIds, ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}) };
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
          statements.push(approvedSubmissionOutcomeStatement({ submissionId: row.id, outcomeKey: `challenge:${selection.challengeId}:${selection.snapshot.mapId ?? ""}:${selection.snapshot.gameplayRevisionId ?? ""}`, outcomeType: "challenge", status: "created", entityId: selection.challengeId, details: { mapId: selection.snapshot.mapId, gameplayRevisionId: selection.snapshot.gameplayRevisionId, titleKey: reward?.titleKey ?? null, basis: selection.basis } }));
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
      const submissionSnapshot = row.ruleSnapshotJson ? JSON.parse(row.ruleSnapshotJson) as MapTitleRuleSnapshot : null;
      let alreadyOwned = false;
      let grantId = crypto.randomUUID();
      if (reward) {
        const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(eq(playerTitleGrants.playerAccountId, row.playerAccountId), eq(playerTitleGrants.titleKey, reward.titleKey), eq(playerTitleGrants.status, "active"), reward.mapId ? eq(playerTitleGrants.mapId, reward.mapId) : isNull(playerTitleGrants.mapId), reward.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, reward.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
        if (existing) { alreadyOwned = true; grantId = existing.id as typeof grantId; }
      }
      const canonicalChallengeId = reward
        ? await canonicalChallengeIdForGrant({ snapshot: submissionSnapshot, legacyChallengeId: reward.challengeId, titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, timestamp })
        : null;
      const completionAwards = new Map<string, ChallengeCompletionAward>();
      if (reward && canonicalChallengeId && !alreadyOwned) {
        const chain = await challengeCompletionChain({ playerAccountId: row.playerAccountId, challengeId: canonicalChallengeId, slot: reward.slot, eligibilityAt: row.createdAt });
        if (!chain.some((award) => award.root)) throw new Error("CHALLENGE_NOT_COMPLETABLE");
        if (chain.some((award) => award.root && !award.grantable)) throw new Error("TITLE_GRANT_ADMINISTRATIVELY_REVOKED");
        for (const award of chain) completionAwards.set(`${award.challengeId}:${award.mapId ?? ""}:${award.gameplayRevisionId ?? ""}`, award);
      }
      const completionAwardRows = [...completionAwards.values()].map((award) => ({ ...award, grantId: award.root ? grantId : crypto.randomUUID() }));
      const requestHash = await hashRequest(input);
      const playerVerifiedRunOutcome = verifiedRunOutcome ? playerVerifiedRunSubmissionOutcome(verifiedRunOutcome) : null;
      const responseDetails = {
        ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}),
      };
      const reviewAudit = { decision: input.decision, reason: input.reason ?? null, grantId: reward ? grantId : null, evidenceMatchOutcome: reviewedMatchOutcome, evidenceMatchedChallengeIds: reviewedChallengeIds, ...(!reward && retainedGrants.length ? { retainedGrants: retainedGrants.map(({ grantId: retainedGrantId, titleKey }) => ({ grantId: retainedGrantId, titleKey })) } : {}), ...(reward ? { titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, mapVariant: submissionSnapshot?.mapVariant ?? null, ruleId: submissionSnapshot?.ruleId ?? null, ruleRevision: submissionSnapshot?.ruleRevision ?? null } : {}), ...(playerVerifiedRunOutcome ? { verifiedRunOutcome: playerVerifiedRunOutcome } : {}) };
      const response: AdminSubmissionReviewResponse = reward
        ? { contractVersion: "1", submissionId: row.id, decision: "approved", grantId, titleKey: reward.titleKey, titleName: reward.titleName, alreadyOwned, ...responseDetails }
        : input.decision === "approved" && retainedGrants.length
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
      if (reward) {
        trailingStatements.push(
          database.prepare(
            "INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.grant', 'player_title_grant', grant_id, ?, ? FROM submissions WHERE id = ? AND grant_id IS NOT NULL AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
          ).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, JSON.stringify({ submissionId: row.id, titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, mapVariant: submissionSnapshot?.mapVariant ?? null, ruleId: submissionSnapshot?.ruleId ?? null, ruleRevision: submissionSnapshot?.ruleRevision ?? null, alreadyOwned }), timestamp, row.id, reviewId)
        );
      }
      await persistSubmissionReview({ row, input, auth, reviewId, timestamp, idempotencyKeyId, requestHash, response, reviewAudit, statements, trailingStatements });
      if (reward && response.decision === "approved" && "grantId" in response) {
        const completed = await db.select({ grantId: submissions.grantId }).from(submissions).where(eq(submissions.id, row.id)).get();
        if (!completed?.grantId) throw new Error("SUBMISSION_NOT_REVIEWABLE");
        response.grantId = completed.grantId! as typeof response.grantId;
      }
      return response;
    },

    async processOcrJob(input) {
      activeMapsPromise = null;
      const ocrRequestId = input.requestId ?? crypto.randomUUID();
      const context = { submissionId: input.submissionId, attempt: input.attempt, manual: Boolean(input.manual), requestId: ocrRequestId };
      const startedAt = Date.now();
      logOcrEvent("job_started", context);
      if (!evidenceBucket || !ocrkitBaseUrl || !ocrkitApiToken) {
        logOcrEvent("job_processing_failed", { ...context, stage: "configuration", durationMs: Date.now() - startedAt, errorName: "Error", errorMessage: "OCR_NOT_CONFIGURED" });
        throw new Error("OCR_NOT_CONFIGURED");
      }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "ocr_pending") return;
      const attachment = await db.select().from(attachments).where(and(eq(attachments.submissionId, row.id), eq(attachments.objectKey, input.objectKey), eq(attachments.uploadStatus, "stored"))).get();
      if (!attachment?.objectKey) throw new Error("OCR_EVIDENCE_UNAVAILABLE");
      let evidenceBytes: ArrayBuffer;
      let contentType: string;
      try {
        const evidenceObject = await evidenceBucket.get(attachment.objectKey);
        if (!evidenceObject || evidenceObject.size > maxUploadBytes) throw new Error("evidence_unavailable");
        evidenceBytes = await evidenceObject.arrayBuffer();
        if (evidenceBytes.byteLength === 0 || evidenceBytes.byteLength > maxUploadBytes) throw new Error("evidence_unavailable");
        contentType = evidenceObject.httpMetadata?.contentType ?? attachment.contentType;
      } catch {
        throw new Error("OCR_EVIDENCE_UNAVAILABLE");
      }
      let response: Response;
      try {
        const formData = new FormData();
        formData.append("file", new Blob([evidenceBytes], { type: contentType }), "evidence");
        response = await fetch(`${ocrkitBaseUrl.replace(/\/$/, "")}/api/v1/ocr/challenge`, { method: "POST", headers: { authorization: `Bearer ${ocrkitApiToken}`, "user-agent": "OWBastion-PlatformAPI/1.0", "x-request-id": ocrRequestId }, body: formData, signal: AbortSignal.timeout(ocrkitRequestTimeoutMs) });
      } catch (error) {
        logOcrEvent("ocrkit_request_failed", { ...context, stage: "fetch", durationMs: Date.now() - startedAt, ...errorDetails(error) });
        throw new Error("OCR_NETWORK");
      }
      logOcrEvent("ocrkit_response", { ...context, status: response.status, ok: response.ok, contentType: response.headers.get("content-type"), durationMs: Date.now() - startedAt });
      if (!response.ok) throw new Error(`OCR_HTTP_${response.status}`);
      let result: OcrResponse;
      try {
        const parsed = await response.json() as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("response_body_not_object");
        result = parsed as OcrResponse;
        logOcrEvent("ocrkit_response_parsed", { ...context, responseRequestId: result.request_id ?? null, schemaVersion: result.schema_version ?? null, responseOk: result.ok ?? null, dataFields: Object.keys(result.data ?? {}), evidenceFields: Object.keys(result.fields ?? {}), durationMs: Date.now() - startedAt });
      } catch (error) {
        logOcrEvent("ocrkit_response_parse_failed", { ...context, stage: "parse_response", durationMs: Date.now() - startedAt, ...errorDetails(error) });
        throw new Error("OCR_INVALID_RESPONSE");
      }
      let stage = "load_submission";
      try {
        stage = "resolve_auto_candidates";
        const preparedCanonicalCandidates = await preparePlayerAutoMatchChallenges(row, result);
        const canonicalDecision = matchOcrAgainstChallenges(preparedCanonicalCandidates.candidates, result, preparedCanonicalCandidates.mapIdsByName, preparedCanonicalCandidates.titleNamesByKey);
        const verifiedRunOutcome = await resolveVerifiedRunSubmissionOutcome(row, result, input.manual ? "submission_review" : "submission_automatic");
        const masteryAccepted = verifiedRunOutcome.status === "created" || verifiedRunOutcome.status === "reused";
        if (verifiedRunOutcome.status === "conflict") {
          stage = "persist_mastery_conflict";
          await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ verifiedRunOutcome: { status: verifiedRunOutcome.status, conflictFields: verifiedRunOutcome.conflictFields } }), nextStatus: "ocr_review_required", reviewReason: "通关码与已验证记录存在冲突，请人工核对", incrementFailCount: false, allowExistingStatus: Boolean(input.manual), verifiedRunOutcome });
          logOcrEvent("job_completed", { ...context, outcome: "mastery_conflict", conflictFields: verifiedRunOutcome.conflictFields, durationMs: Date.now() - startedAt });
          return;
        }
        {
          const prepared = preparedCanonicalCandidates;
          const decision = canonicalDecision;
          const candidateOutcomes = decision.candidates.map(({ challenge, canonicalChallengeId, evaluation, quality }) => ({
            challengeId: challenge.challengeId,
            canonicalChallengeId,
            challengeType: challenge.family === "map" ? challenge.kind : challenge.scope === "map" ? "map_title_achievement" : "title_achievement",
            targetMapName: challenge.family === "map" ? challenge.mapName : undefined,
            targetDifficulty: challenge.family === "map" ? challenge.difficulty ?? null : undefined,
            titleName: challenge.titleKey ? prepared.titleNamesByKey.get(challenge.titleKey) ?? null : null,
            matched: evaluation.matched,
            conditionsSupported: evaluation.supported,
            requiredFields: evaluation.requiredFields,
            quality,
          }));
          const matchJson = JSON.stringify({ mode: "canonical_conditions", outcome: decision.outcome, candidates: candidateOutcomes, verifiedRunOutcome: { status: verifiedRunOutcome.status } });
          if (decision.outcome === "automatic") {
            const completionRoots = [...new Map(decision.exact.map((item) => {
              const snapshot = prepared.snapshots.get(item.canonicalChallengeId);
              if (!snapshot?.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              return [item.canonicalChallengeId, { canonicalChallengeId: item.canonicalChallengeId, snapshot, slot: snapshot.slot }] as const;
            })).values()];
            const uniqueGrantCandidates = [...new Map(decision.exact.filter((item) => item.grantable).map((item) => {
              const snapshot = prepared.snapshots.get(item.canonicalChallengeId);
              if (!snapshot?.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              return [`${snapshot.titleKey}:${snapshot.mapId ?? ""}:${snapshot.gameplayRevisionId ?? ""}`, item] as const;
            })).values()];
            const grantTitleKeys = [...new Set(uniqueGrantCandidates.map((item) => prepared.snapshots.get(item.canonicalChallengeId)?.titleKey).filter((key): key is string => Boolean(key)))];
            const existingGrantRows = grantTitleKeys.length ? await db.select({ id: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId }).from(playerTitleGrants).where(and(
              eq(playerTitleGrants.playerAccountId, row.playerAccountId),
              eq(playerTitleGrants.status, "active"),
              sql`${playerTitleGrants.titleKey} IN (SELECT value FROM json_each(${JSON.stringify(grantTitleKeys)}))`,
            )) : [];
            const existingGrantByScope = new globalThis.Map(existingGrantRows.map((grant) => [JSON.stringify([grant.titleKey, grant.mapId, grant.gameplayRevisionId]), grant]));
            const grants: Array<{ snapshot: MapTitleRuleSnapshot; canonicalChallengeId: string; titleKey: string; mapId: string | null; slot: string | null; alreadyOwned: boolean; existingGrantId: string | null }> = [];
            for (const grantCandidate of uniqueGrantCandidates) {
              const snapshot = prepared.snapshots.get(grantCandidate.canonicalChallengeId);
              if (!snapshot?.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              const mapId = snapshot.mapId;
              const existing = existingGrantByScope.get(JSON.stringify([snapshot.titleKey, mapId, snapshot.gameplayRevisionId]));
              grants.push({ snapshot, canonicalChallengeId: grantCandidate.canonicalChallengeId, titleKey: snapshot.titleKey, mapId, slot: snapshot.slot, alreadyOwned: Boolean(existing), existingGrantId: existing?.id ?? null });
            }
            const sample = await shouldSampleAutomaticDecision(row.id);
            stage = "persist_automatic_decision";
            await persistAutomaticDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson, grants, completionRoots, canonicalChallengePlans: prepared.canonicalChallengePlans, sample, verifiedRunOutcome });
            logOcrEvent("job_completed", { ...context, outcome: "automatic", titleKey: grants[0]?.titleKey ?? null, grantCount: grants.length, spotCheck: sample, durationMs: Date.now() - startedAt });
            return;
          }
          stage = "persist_auto_routing";
          if (masteryAccepted && decision.outcome === "resubmit") {
            await persistMasteryOnlyDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson, verifiedRunOutcome, sample: await shouldSampleAutomaticDecision(row.id) });
          } else {
            await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: decision.outcome === "review" ? "review_required" : "mismatch", responseJson: JSON.stringify(result), matchJson, nextStatus: decision.outcome === "review" ? "ocr_review_required" : "resubmission_required", reviewReason: decision.outcome === "review" ? "无法唯一判断挑战，请人工核对" : "截图与当前挑战目录不匹配，请重新提交", incrementFailCount: decision.outcome === "resubmit", allowExistingStatus: Boolean(input.manual), verifiedRunOutcome });
          }
          logOcrEvent("job_completed", { ...context, outcome: decision.outcome, candidateCount: decision.exact.length, durationMs: Date.now() - startedAt });
          return;
        }
      } catch (error) {
        const errorCode = error instanceof Error && error.message.startsWith("OCR_") ? error.message : `OCR_PROCESS_FAILED_${stage.toUpperCase()}`;
        logOcrEvent("job_processing_failed", { ...context, stage, errorCode, durationMs: Date.now() - startedAt, ...errorDetails(error) });
        throw new Error(errorCode, { cause: error });
      }
    },

    async markOcrJobFailed(input) {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row || (!input.manual && row.status !== "ocr_pending")) return;
      const requestId = input.requestId ?? crypto.randomUUID();
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, error_code, created_at) VALUES (?, ?, ?, ?, 'error', ?, ?)").bind(crypto.randomUUID(), row.id, requestId, input.attempt, input.errorCode, now()),
        database.prepare("UPDATE submissions SET status = 'resubmission_required', review_reason = ?, ocr_fail_count = ocr_fail_count + 1, updated_at = ? WHERE id = ? AND status = 'ocr_pending'").bind("截图暂时无法处理，请重新提交截图。", now(), row.id),
      ]);
      logOcrEvent("job_failure_recorded", { submissionId: row.id, attempt: input.attempt, manual: Boolean(input.manual), requestId, errorCode: input.errorCode });
    },

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
        player: { playerId: player.playerId, playerName: player.playerName, isAdmin: player.isAdmin === 1 },
        recentSubmissions: recentSubmissions.map((submission) => {
          const verifiedRunOutcome = verifiedRunOutcomes.get(submission.submissionId);
          return { submissionId: submission.submissionId, status: playerSubmissionStatus(submission.status), resubmissionRequired: submission.status === "resubmission_required", mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: verifiedRunOutcome?.status === "conflict" ? undefined : submission.reason ?? undefined, ...playerVerifiedRunSubmissionOutcomeFields(verifiedRunOutcome), createdAt: submission.createdAt, updatedAt: submission.updatedAt };
        }),
      };
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

    ...createBindingServices({
      database, db, randomToken, randomCode,
      ...databaseServiceDependencies,
      normalizePlayerName, encryptBindingInviteCode, decryptBindingInviteCode, bindingInviteCodeEncryptionKey,
      sessionTtlMs, pruneExpiredPortalSessions, pruneExpiredBindingClaims,
    }),

    async getSubmission(input, _auth) {
      const submission = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
      const verifiedRunOutcome = await loadVerifiedRunSubmissionOutcome(submission.id);
      return { contractVersion: "1" as const, submissionId: submission.id, status: playerSubmissionStatus(submission.status), resubmissionRequired: submission.status === "resubmission_required", mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: verifiedRunOutcome?.status === "conflict" ? undefined : submission.reviewReason ?? undefined, ...playerVerifiedRunSubmissionOutcomeFields(verifiedRunOutcome), createdAt: submission.createdAt, updatedAt: submission.updatedAt };
    },
    ...createReviewServices(database, db, {
      ...databaseServiceDependencies,
    }),
  };
};

export * from "./schema";
