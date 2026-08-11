import { count, desc, eq, and, gt, gte, like, or, inArray, isNull, ne, lt, lte, notExists, sql, asc } from "drizzle-orm";

import { drizzle } from "drizzle-orm/d1";
import { buildMasteryProfiles, calculateMasteryXpV1, isMasteryGameVersionSupported, isMasteryOcrLayoutSupported, masteryDifficulties, masteryEvidenceCompatibilityV1, normalizeMasteryRunCode } from "@owbastion/domain";
import type { AdminMasteryRunQuery, AgentAchievementQuery, AgentEventQuery, AgentMapQuery, AgentSearchQuery, AgentTitleQuery, AgentPlayerTitleGrantQuery, AgentMapTitleHolderQuery, AuthContext, MasteryDifficulty, MasteryEventCounters, MasteryEvidenceCompatibilityV1, MasteryMapProfile, MasteryRunActor, MasteryRunConflictField, MasteryRunForProjection, MasteryXpSnapshot, PlatformServices, PublicReviewCommentPage, PublicReviewCommentQuery, RecordVerifiedMasteryRunResult, ReviewRating, ReviewRecord, ReviewSummary, ReviewSummaryBatchInput, ReviewTarget, ReviewTargetType, ReviewUpsertInput, AdminReviewDetail, AdminReviewQuery, VerifiedMasteryRun, VerifiedMasteryRunInput } from "@owbastion/domain";
import { agentGameplayRevisionSchema, agentSpatialConfigSchema } from "@owbastion/contracts";
import type { AdminAchievementCreateRequest, AdminChallenge, AdminChallengeUpdateRequest, AdminCatalogTitleUpdateRequest, AdminMapMetadataUpdateRequest, AdminMapEditorChallengeOption, AdminMapEditorResponse, AdminMapRevision, AdminMapRevisionChallengeAssignment, AdminMapRevisionCreateRequest, AdminMapRevisionUpdateRequest, AdminMapTitleRule, AdminMapTitleRuleCreateRequest, AdminMapTitleRuleUpdateRequest, AdminMapTitleRuleExceptionUpsertRequest, AdminRandomEventCreateRequest, AdminRandomEventImportRequest, AdminRandomEventUpdateRequest, AdminSubmissionChallengeRequest, AdminSubmissionChallengeResponse, AdminSubmissionOcrRetryResponse, AdminSubmissionReviewResponse, AdminSubmissionSpotCheckResponse, AdminManualTitleGrantResponse, AdminMasteryRun, AdminMasteryRunConflict, AdminMasteryRunDetailResponse, AdminMasteryRunProjection, AdminMasteryRunStateResponse, AdminMasteryRunConflictResolutionResponse, AdminReview, AgentMap, AgentSearchResult, Challenge, CurrentPlayerMasteryResponse, Map, QqBindingRequest, QqGroupAccessRequest, QqLoginAttemptRequest, QqLoginVerifyRequest, RandomEvent, SubmissionRequest, Title } from "@owbastion/contracts";
import { achievementChallengeMaps, achievementChallenges, attachments, auditEvents, bindingClaims, bindingInvites, bindingInviteHistoricalTitleGrants, bindings, effectGlossaryTerms, gameplayRevisionChallengeAssignments, gameplayRevisions, historicalTitleGrants, identities, idempotencyKeys, mapMetadata, mapTitleRewards, mapTitleRuleCompat, mapTitleRuleExceptions, mapTitleRules, maps, masteryRunConflictResolutions, masteryRunLifecycleEvents, masteryRuns, ocrResults, playerAccounts, playerTitleGrants, qqGroupAccess, qqGroupPolicyOutbox, qqLoginAttempts, qqSessions, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, reviews, submissionOutcomes, submissionReviews, submissionSpotChecks, submissions, titleCatalog, titleChallenges, uploadSessions } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { matchOcrResult } from "./ocr-match";
import { challengeTargetDifficulty, matchOcrAgainstChallenges } from "./ocr-auto-match";
import { assessOcrQuality, type OcrResponse } from "./ocr-response";

const now = () => Date.now();
const normalizedOcrLabel = (value: unknown) => typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
const normalizedOcrDifficulty = (value: unknown) => {
  const label = normalizedOcrLabel(value);
  return label.startsWith("地狱:") || label.startsWith("地狱：") ? "地狱" : label === "普通" ? "一般" : label;
};

const masteryRequiredOcrFields = ["challenge_completed", "viewer_player", "map_name", "difficulty", "version", "run_code", "duration_seconds"] as const;
export type MasteryOcrEvidenceAssessment =
  | {
    outcome: "eligible";
    mapName: string;
    viewerPlayer: string;
    mapVariant: "classic" | null;
    difficulty: MasteryDifficulty;
    gameVersion: string;
    runCode: string;
    completionDurationSeconds: number;
    deaths: number | null;
    skips: number | null;
  }
  | { outcome: "ineligible"; reason: string };

const hasReliableMasteryField = (response: OcrResponse, fieldName: string, compatibility: MasteryEvidenceCompatibilityV1) => {
  const field = response.fields?.[fieldName];
  return field?.status === "ok" && typeof field.confidence === "number" && field.confidence >= compatibility.requiredConfidence;
};

const ineligibleMasteryEvidence = (reason: string): MasteryOcrEvidenceAssessment => ({ outcome: "ineligible", reason });

export const assessMasteryOcrEvidence = (response: OcrResponse, compatibility: MasteryEvidenceCompatibilityV1 = masteryEvidenceCompatibilityV1): MasteryOcrEvidenceAssessment => {
  if (!compatibility.minimumGameVersion || !compatibility.supportedOcrLayoutVersions.length) return ineligibleMasteryEvidence("mastery_rollout_disabled");
  if (response.schema_version !== "1") return ineligibleMasteryEvidence("unsupported_schema_version");
  if (response.ok !== true) return ineligibleMasteryEvidence("unsuccessful_response");
  if (!isMasteryOcrLayoutSupported(response.layout_version, compatibility)) return ineligibleMasteryEvidence("unsupported_layout");
  for (const fieldName of masteryRequiredOcrFields) {
    if (!hasReliableMasteryField(response, fieldName, compatibility)) return ineligibleMasteryEvidence(`unreliable_${fieldName}`);
  }

  const data = response.data ?? {};
  if (data.challenge_completed !== true) return ineligibleMasteryEvidence("completion_not_confirmed");
  const mapName = typeof data.map_name === "string" ? data.map_name.trim() : "";
  if (!mapName) return ineligibleMasteryEvidence("missing_map");
  const viewerPlayer = typeof data.viewer_player === "string" ? data.viewer_player.trim() : "";
  if (!viewerPlayer) return ineligibleMasteryEvidence("missing_viewer_player");
  const gameVersion = typeof data.version === "string" ? data.version.trim() : "";
  if (!isMasteryGameVersionSupported(gameVersion, compatibility)) return ineligibleMasteryEvidence("unsupported_game_version");
  const difficulty = normalizedOcrDifficulty(data.difficulty);
  if (!masteryDifficulties.includes(difficulty as MasteryDifficulty)) return ineligibleMasteryEvidence("invalid_difficulty");
  const completionDurationSeconds = data.duration_seconds;
  if (typeof completionDurationSeconds !== "number" || !Number.isInteger(completionDurationSeconds) || completionDurationSeconds <= 0) return ineligibleMasteryEvidence("invalid_completion_duration");
  let runCode: string;
  try {
    runCode = normalizeMasteryRunCode(typeof data.run_code === "string" ? data.run_code : "");
  } catch {
    return ineligibleMasteryEvidence("invalid_run_code");
  }

  const rawVariant = typeof data.map_variant === "string" ? data.map_variant.trim() : "";
  if (rawVariant && rawVariant !== "classic") return ineligibleMasteryEvidence("invalid_map_variant");
  if (rawVariant && !hasReliableMasteryField(response, "map_variant", compatibility)) return ineligibleMasteryEvidence("unreliable_map_variant");
  const settlementValue = (value: number | null | undefined, fieldName: "deaths" | "skips") => {
    if (value === null || value === undefined || !hasReliableMasteryField(response, fieldName, compatibility)) return null;
    return Number.isInteger(value) && value >= 0 ? value : undefined;
  };
  const deaths = settlementValue(data.deaths, "deaths");
  const skips = settlementValue(data.skips, "skips");
  if (deaths === undefined || skips === undefined) return ineligibleMasteryEvidence("invalid_settlement_value");

  return {
    outcome: "eligible",
    mapName,
    viewerPlayer,
    mapVariant: rawVariant === "classic" ? "classic" : null,
    difficulty: difficulty as MasteryDifficulty,
    gameVersion,
    runCode,
    completionDurationSeconds,
    deaths: deaths ?? null,
    skips: skips ?? null,
  };
};
const logOcrEvent = (event: string, fields: Record<string, unknown>) => console.log(JSON.stringify({ layer: "ocr", event, ...fields }));
const errorDetails = (error: unknown) => ({ errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256) });
const paginate = <T>(items: T[], page: number, pageSize: number) => ({ items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length, hasMore: page * pageSize < items.length });
export type HistoricalHolderFilter = "all" | "pending" | "completed";
export type HistoricalGrantStatusFilter = "all" | "unclaimed" | "active" | "revoked";

export const paginateHistoricalHolderNames = (holderNames: string[], page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  return { holderNames: holderNames.slice((safePage - 1) * safePageSize, safePage * safePageSize), page: safePage, pageSize: safePageSize, total: holderNames.length, hasMore: safePage * safePageSize < holderNames.length };
};

export const summarizeHistoricalTitleGrantStatuses = (rows: Array<{ holderName: string; grantId: string | null }>) => {
  const pendingHolders = new Set(rows.filter(({ grantId }) => !grantId).map(({ holderName }) => holderName));
  return { pendingHolderCount: pendingHolders.size, unclaimedGrantCount: rows.filter(({ grantId }) => !grantId).length, migratedGrantCount: rows.filter(({ grantId }) => Boolean(grantId)).length };
};

export const summarizeHistoricalHolders = (rows: Array<{ holderName: string; grantId: string | null; grantStatus: string | null }>) => {
  const holders = new Map<string, { holderName: string; totalCount: number; unclaimedCount: number }>();
  for (const row of rows) {
    const current = holders.get(row.holderName) ?? { holderName: row.holderName, totalCount: 0, unclaimedCount: 0 };
    current.totalCount += 1;
    if (!row.grantId) current.unclaimedCount += 1;
    holders.set(row.holderName, current);
  }
  return [...holders.values()]
    .sort((left, right) => left.holderName.localeCompare(right.holderName))
    .map((holder) => ({
      ...holder,
      status: holder.unclaimedCount > 0 ? "pending" as const : "completed" as const,
    }));
};

export const filterHistoricalHolders = <T extends { unclaimedCount: number }>(holders: T[], filter: HistoricalHolderFilter = "all") => {
  if (filter === "pending") return holders.filter((holder) => holder.unclaimedCount > 0);
  if (filter === "completed") return holders.filter((holder) => holder.unclaimedCount === 0);
  return holders;
};

export const paginateHistoricalHolders = <T>(holders: T[], page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  return {
    items: holders.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: holders.length,
    hasMore: safePage * safePageSize < holders.length,
  };
};

export const paginateHistoricalGrants = <T>(grants: T[], page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(100, Math.max(1, pageSize));
  return {
    items: grants.slice((safePage - 1) * safePageSize, safePage * safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total: grants.length,
    hasMore: safePage * safePageSize < grants.length,
  };
};

export const filterHistoricalGrantsByStatus = <T extends { status: string }>(grants: T[], grantStatus: HistoricalGrantStatusFilter = "all") => {
  if (grantStatus === "all") return grants;
  return grants.filter((grant) => grant.status === grantStatus);
};

type HistoricalMigrationItem = { status: string };
const summarizeHistoricalMigration = (rows: HistoricalMigrationItem[], invite: { revokedAt: number | null; expiresAt: number }, claimStatus: string | undefined, timestamp: number) => {
  const completedCount = rows.filter((row) => row.status === "created" || row.status === "reused").length;
  const conflictCount = rows.filter((row) => row.status === "conflict").length;
  const retryCount = rows.filter((row) => row.status === "retry_required").length;
  let status: "not_requested" | "authorized" | "completed" | "partial" | "retry_required" | "cancelled" = "not_requested";
  if (rows.length > 0) {
    const cancelled = Boolean(invite.revokedAt) || (!(["approved"].includes(claimStatus ?? "")) && (invite.expiresAt <= timestamp || ["rejected", "expired"].includes(claimStatus ?? "")));
    if (cancelled) status = "cancelled";
    else if (retryCount > 0) status = "retry_required";
    else if (completedCount === rows.length) status = "completed";
    else if (conflictCount > 0 || completedCount > 0) status = "partial";
    else status = "authorized";
  }
  return { status, requestedCount: rows.length, completedCount, conflictCount, retryCount };
};

const toPublicHistoricalMigration = (summary: ReturnType<typeof summarizeHistoricalMigration>) => ({
  status: summary.status === "authorized" ? "pending" as const : summary.status,
  requestedCount: summary.requestedCount,
  restoredCount: summary.completedCount,
});
const loginTtlMs = 2 * 60 * 1000;
const bindingClaimTtlMs = 10 * 60 * 1000;
const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const uploadTtlMs = 10 * 60 * 1000;
const maxUploadBytes = 10 * 1024 * 1024;
const maxTitleIconBytes = 512 * 1024;
export const maxReviewCommentLength = 500;
export const reviewSampleThreshold = 3;
const titleIconContentTypes = new Map([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"]]);
export const publicTitleChallengeStatus = (status: string, startsAt: number | null, endsAt: number | null, timestamp: number) => {
  if (status !== "scheduled") return status === "active" || status === "sunsetting" ? status : null;
  if (startsAt === null || timestamp < startsAt) return "scheduled";
  if (endsAt !== null && timestamp >= endsAt) return null;
  return "active";
};
export const titleChallengeIsSubmittable = (status: string, startsAt: number | null, endsAt: number | null, timestamp: number) => {
  const publicStatus = publicTitleChallengeStatus(status, startsAt, endsAt, timestamp);
  return publicStatus === "active" || publicStatus === "sunsetting";
};
const randomToken = (bytes = 32) => {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const randomCode = () => {
  const value = new Uint8Array(6);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
};
const randomInviteCode = () => {
  const value = new Uint8Array(12);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => codeAlphabet[byte % codeAlphabet.length]).join("");
};

const hashRequest = async (value: unknown) => {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const bindingClaimSessionToken = (claimToken: string) => hashRequest({ purpose: "binding-claim-session", claimToken });

const bytesToHex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
const hexToBytes = (value: string) => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
  return Uint8Array.from(value.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
};
const bindingInviteCodeKey = async (secret?: string) => {
  if (!secret) throw new Error("BINDING_INVITE_CODE_ENCRYPTION_NOT_CONFIGURED");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
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

const asReviewRating = (value: number): ReviewRating => {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error("REVIEW_RATING_INVALID");
  return value as ReviewRating;
};

const normalizeReviewComment = (value: string | null | undefined) => {
  const comment = value?.trim() ?? "";
  if (Array.from(comment).length > maxReviewCommentLength) throw new Error("REVIEW_COMMENT_TOO_LONG");
  return comment || null;
};

const asReviewRecord = (row: typeof reviews.$inferSelect): ReviewRecord => ({
  reviewId: row.id,
  playerAccountId: row.playerAccountId,
  targetType: row.targetType as ReviewTargetType,
  targetId: row.targetId,
  rating: asReviewRating(row.rating),
  comment: row.comment,
  commentStatus: row.commentStatus as ReviewRecord["commentStatus"],
  anonymous: row.anonymous === 1,
  status: row.status as ReviewRecord["status"],
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  withdrawnAt: row.withdrawnAt,
  invalidatedAt: row.invalidatedAt,
  invalidatedBy: row.invalidatedBy,
  invalidationReason: row.invalidationReason,
});

const normalizePlayerName = (name: string) => name.trim().toLocaleLowerCase();

const titleColor = (value: string) => JSON.parse(value) as { kind: "heroColor"; index: number } | { kind: "rgb"; value: [number, number, number] } | { kind: "palette"; name: "orange" | "red" | "purple" | "gold" | "blue" } | null;

const digestHex = async (value: ArrayBuffer) => {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

type EventImportRow = Omit<AdminRandomEventCreateRequest, "contractVersion">;
const eventImportHeaders = ["事件名称", "事件效果", "事件类别", "稀有度级别", "类别概率", "内置冷却", "持续时间（秒）", "权重", "组内总权重", "组内个数", "单次失败率(Q)", "保底触发率", "最终出现概率", "全局出现概率", "版本", "效果类型", "事件状态"];
const parseCsv = (csv: string) => {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < csv.length; index += 1) { const char = csv[index]; const next = csv[index + 1]; if (quoted) { if (char === '"' && next === '"') { field += '"'; index += 1; } else if (char === '"') quoted = false; else field += char; } else if (char === '"') quoted = true; else if (char === ",") { row.push(field.trim()); field = ""; } else if (char === "\n") { row.push(field.trim()); rows.push(row); row = []; field = ""; } else if (char !== "\r") field += char; }
  if (quoted) throw new Error("CSV_QUOTE_INVALID"); if (field || row.length) { row.push(field.trim()); rows.push(row); } return rows;
};
const parseEventImport = async (input: AdminRandomEventImportRequest) => {
  const rows = parseCsv(input.csv.replace(/^\uFEFF/, "")); const errors: Array<{ row: number; message: string }> = [];
  if (!rows.length || eventImportHeaders.some((header, index) => rows[0][index] !== header)) return { sourceHash: await hashRequest(input.csv), rows: [] as EventImportRow[], errors: [{ row: 1, message: `表头必须为：${eventImportHeaders.join("、")}` }] };
  const parsed: EventImportRow[] = [];
  rows.slice(1).forEach((values, index) => { const rowNumber = index + 2; if (!values.some(Boolean)) return; const number = (value: string) => value === "" ? null : Number(value); const status = values[16] === "已实装" ? "implemented" : values[16] === "已移除" ? "removed" : values[16] === "开发中" ? "development" : ""; const candidate = { name: values[0], description: values[1], category: values[2], rarity: values[3], cooldownSeconds: number(values[5]), durationSeconds: number(values[6]), weight: number(values[7]), gameVersion: values[14], effectTags: values[15] ? values[15].split(/[、,]/).map((tag) => tag.trim()).filter(Boolean) : [], releaseStatus: status, challengeLinks: [] }; const valid = candidate.name && candidate.category && candidate.rarity && candidate.description && candidate.gameVersion && status && [candidate.cooldownSeconds, candidate.durationSeconds, candidate.weight].every((value) => value === null || Number.isFinite(value) && value >= 0) && Number.isInteger(candidate.durationSeconds ?? 0); if (!valid) errors.push({ row: rowNumber, message: "字段缺失、状态或数值格式无效" }); else parsed.push(candidate as EventImportRow); });
  const duplicates = new Set<string>(); parsed.forEach((item) => { if (duplicates.has(item.name)) errors.push({ row: rows.findIndex((values) => values[0] === item.name) + 1, message: "文件内事件名称重复" }); duplicates.add(item.name); });
  return { sourceHash: await hashRequest(input.csv), rows: parsed, errors };
};

const validateSourceUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0$|::1$|169\.254\.)/i.test(url.hostname)) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
};

const persistEvidence = async (db: ReturnType<typeof drizzle>, bucket: R2Bucket, submissionId: string, attachmentId: string, sourceUrl: string, contentType: string) => {
  validateSourceUrl(sourceUrl);
  const response = await fetch(sourceUrl, { headers: { "user-agent": "OWBastion-PlatformAPI/1.0" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
  const responseType = response.headers.get("content-type")?.split(";", 1)[0] ?? contentType;
  if (!responseType.startsWith("image/")) throw new Error("UNSUPPORTED_ATTACHMENT_TYPE");
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > 10 * 1024 * 1024) throw new Error("ATTACHMENT_SIZE_INVALID");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > 10 * 1024 * 1024) throw new Error("ATTACHMENT_SIZE_INVALID");
  const sha256 = await digestHex(bytes);
  const extension = responseType === "image/jpeg" ? "jpg" : responseType.split("/")[1] ?? "bin";
  const objectKey = userEvidenceObjectKey(submissionId, sha256, extension);
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: responseType } });
  await db.update(attachments).set({ objectKey, sha256, byteSize: bytes.byteLength, uploadStatus: "stored" }).where(eq(attachments.id, attachmentId));
  return objectKey;
};

export const createPlatformServices = (database: D1Database, evidenceBucket?: R2Bucket, uploadOrigin = "https://api.owbastion.com", ocrkitBaseUrl?: string, ocrkitApiToken?: string, ocrQueue?: Queue, ocrkitEvidenceBucket?: string, qqPolicyQueue?: Queue, bindingInviteCodeEncryptionKey?: string, evidencePublicOrigin?: string, ocrManualReviewThreshold = 1, ocrAutoReviewSampleRate = 0, masteryEvidenceCompatibility: MasteryEvidenceCompatibilityV1 = masteryEvidenceCompatibilityV1): PlatformServices => {
  const db = drizzle(database);
  const publicEvidenceBase = evidencePublicOrigin?.replace(/\/$/, "");
  const publicEvidenceUrl = (objectKey: string | null | undefined) => publicEvidenceBase && objectKey ? `${publicEvidenceBase}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : null;

  const findReviewAccount = async (subject: string) => db.select().from(playerAccounts).where(or(eq(playerAccounts.id, subject), eq(playerAccounts.playerId, subject))).get();
  const findReviewTarget = async (input: ReviewTarget) => input.targetType === "event"
    ? await db.select().from(randomEvents).where(eq(randomEvents.id, input.targetId)).get()
    : await db.select().from(maps).where(eq(maps.id, input.targetId)).get();
  type AdminReviewRow = {
    review_id: string;
    target_type: string;
    target_id: string;
    target_name: string | null;
    player_account_id: string;
    player_id: string;
    player_name: string;
    rating: number;
    comment: string | null;
    anonymous: number;
    comment_status: string;
    status: string;
    created_at: number;
    updated_at: number;
    withdrawn_at: number | null;
    invalidated_at: number | null;
    invalidated_by: string | null;
    invalidation_reason: string | null;
  };
  const asAdminReview = (row: AdminReviewRow): AdminReview => {
    if (!row.target_name) throw new Error("REVIEW_TARGET_NOT_FOUND");
    return {
      reviewId: row.review_id,
      targetType: row.target_type as AdminReview["targetType"],
      targetId: row.target_id,
      targetName: row.target_name,
      playerAccountId: row.player_account_id,
      playerId: row.player_id,
      playerName: row.player_name,
      rating: asReviewRating(row.rating),
      comment: row.comment,
      anonymous: row.anonymous === 1,
      commentStatus: row.comment_status as AdminReview["commentStatus"],
      status: row.status as AdminReview["status"],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      withdrawnAt: row.withdrawn_at,
      invalidatedAt: row.invalidated_at,
      invalidatedBy: row.invalidated_by,
      invalidationReason: row.invalidation_reason,
    };
  };
  const adminReviewQuery = `
    FROM reviews r
    INNER JOIN player_accounts p ON p.id = r.player_account_id
    WHERE 1 = 1`;
  const adminReviewSelect = `
    SELECT r.id AS review_id, r.target_type, r.target_id,
      CASE WHEN r.target_type = 'event' THEN (SELECT name FROM random_events WHERE id = r.target_id)
           ELSE (SELECT name FROM maps WHERE id = r.target_id) END AS target_name,
      r.player_account_id, p.player_id, p.player_name, r.rating, r.comment,
      r.anonymous, r.comment_status, r.status, r.created_at, r.updated_at,
      r.withdrawn_at, r.invalidated_at, r.invalidated_by, r.invalidation_reason
    ${adminReviewQuery}`;

  const mutateReviewComment = async (input: { reviewId: string; reason?: string }, auth: AuthContext, idempotencyKey: string, nextStatus: "visible" | "hidden"): Promise<ReviewRecord> => {
    const operation = nextStatus === "hidden" ? "review.comment.hide" : "review.comment.restore";
    const replay = await replayOrConflict<ReviewRecord>(db, auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const row = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).get();
    if (!row) throw new Error("REVIEW_NOT_FOUND");
    if (!row.comment) throw new Error("REVIEW_COMMENT_NOT_FOUND");
    const timestamp = now();
    if (row.commentStatus !== nextStatus) await db.update(reviews).set({ commentStatus: nextStatus, updatedAt: timestamp }).where(eq(reviews.id, row.id));
    const response = asReviewRecord((await db.select().from(reviews).where(eq(reviews.id, row.id)).get())!);
    await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
    await recordAudit(db, auth, operation, "review", row.id, { reason: input.reason ?? null, previousCommentStatus: row.commentStatus, commentStatus: response.commentStatus });
    return response;
  };

  const mutateReviewState = async (input: { reviewId: string; reason?: string }, auth: AuthContext, idempotencyKey: string, nextStatus: "active" | "invalidated"): Promise<ReviewRecord> => {
    const operation = nextStatus === "invalidated" ? "review.invalidate" : "review.restore";
    const replay = await replayOrConflict<ReviewRecord>(db, auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const row = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).get();
    if (!row) throw new Error("REVIEW_NOT_FOUND");
    if (nextStatus === "invalidated" && row.status === "invalidated" || nextStatus === "active" && row.status !== "invalidated") {
      const response = asReviewRecord(row);
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
      return response;
    }
    const timestamp = now();
    await db.update(reviews).set(nextStatus === "invalidated"
      ? { status: "invalidated", invalidatedAt: timestamp, invalidatedBy: auth.subject, invalidationReason: input.reason ?? null, updatedAt: timestamp }
      : { status: "active", invalidatedAt: null, invalidatedBy: null, invalidationReason: null, updatedAt: timestamp }).where(eq(reviews.id, row.id));
    const response = asReviewRecord((await db.select().from(reviews).where(eq(reviews.id, row.id)).get())!);
    await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
    await recordAudit(db, auth, operation, "review", row.id, { reason: input.reason ?? null, previousStatus: row.status, status: response.status });
    return response;
  };

  const performAuthorizedHistoricalTitleMigration = async (input: { inviteId: string; playerAccountId: string; claimId: string; auth: AuthContext; mode: "automatic" | "reviewed" | "retry" }) => {
    const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
    const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
    const items = await db.select().from(bindingInviteHistoricalTitleGrants).where(eq(bindingInviteHistoricalTitleGrants.inviteId, input.inviteId));
    if (!invite || !claim || claim.status !== "approved" || invite.revokedAt || !items.length) return;

    const timestamp = now();
    const statements: any[] = [];
    const audits: Array<{ entityId: string; payload: Record<string, unknown> }> = [];
    for (const item of items) {
      if (["created", "reused", "conflict"].includes(item.status)) continue;
      const historical = await db.select().from(historicalTitleGrants).where(eq(historicalTitleGrants.id, item.historicalTitleGrantId)).get();
      if (!historical) {
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: "retry_required", lastError: "HISTORICAL_TITLE_GRANT_NOT_FOUND", processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
        continue;
      }
      const existing = await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historical.id))).get();
      let outcome: "created" | "reused" | "conflict";
      let grantId: string;
      if (existing && existing.playerAccountId !== input.playerAccountId) {
        outcome = "conflict";
        grantId = existing.id;
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: "HISTORICAL_TITLE_GRANT_CLAIMED", processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else if (existing?.status === "revoked") {
        outcome = "reused";
        grantId = existing.id;
        statements.push(db.update(playerTitleGrants).set({ playerAccountId: input.playerAccountId, status: "active", grantedBy: `binding:${input.claimId}`, grantedAt: timestamp, revokedBy: null, revokedAt: null, revokeReason: null }).where(eq(playerTitleGrants.id, existing.id)));
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: null, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else if (existing) {
        outcome = "reused";
        grantId = existing.id;
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: null, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      } else {
        outcome = "created";
        grantId = crypto.randomUUID();
        statements.push(db.insert(playerTitleGrants).values({ id: grantId, playerAccountId: input.playerAccountId, titleKey: historical.titleKey, mapId: historical.mapId, gameplayRevisionId: historical.gameplayRevisionId, slot: historical.slot, status: "active", sourceType: "historical", sourceId: historical.id, grantedBy: `binding:${input.claimId}`, grantedAt: timestamp }));
        statements.push(db.update(bindingInviteHistoricalTitleGrants).set({ status: outcome, playerTitleGrantId: grantId, lastError: null, processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      }
      audits.push({ entityId: grantId, payload: { inviteId: input.inviteId, claimId: input.claimId, historicalTitleGrantId: historical.id, playerAccountId: input.playerAccountId, authorizedBy: item.authorizedBy, outcome, mode: input.mode } });
    }
    if (!statements.length) return;
    const auditStatements = audits.map(({ entityId, payload }) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: input.auth.actorType, actorId: input.auth.subject, operation: "binding_invite.historical_migration.item", entityType: "player_title_grant", entityId, payloadJson: JSON.stringify(payload), createdAt: timestamp }));
    try {
      await db.batch([...statements, ...auditStatements] as [any, ...any[]]);
    } catch {
      const retryStatements = items.filter((item) => !["created", "reused", "conflict"].includes(item.status)).map((item) => db.update(bindingInviteHistoricalTitleGrants).set({ status: "retry_required", lastError: "HISTORICAL_TITLE_MIGRATION_FAILED", processedAt: timestamp }).where(eq(bindingInviteHistoricalTitleGrants.id, item.id)));
      try {
        if (retryStatements.length) await db.batch(retryStatements as [any, ...any[]]);
        await recordAudit(db, input.auth, "binding_invite.historical_migration.failed", "binding_invite", input.inviteId, { claimId: input.claimId, playerAccountId: input.playerAccountId, mode: input.mode });
      } catch {
        // Binding activation remains successful even if migration recovery state cannot be written.
      }
    }
  };

  const migrateAuthorizedHistoricalTitles = async (input: { inviteId: string; playerAccountId: string; claimId: string; auth: AuthContext; mode: "automatic" | "reviewed" | "retry" }) => {
    try {
      await performAuthorizedHistoricalTitleMigration(input);
    } catch {
      try {
        await db.update(bindingInviteHistoricalTitleGrants).set({ status: "retry_required", lastError: "HISTORICAL_TITLE_MIGRATION_FAILED", processedAt: now() }).where(and(eq(bindingInviteHistoricalTitleGrants.inviteId, input.inviteId), inArray(bindingInviteHistoricalTitleGrants.status, ["authorized", "retry_required"])));
        await recordAudit(db, input.auth, "binding_invite.historical_migration.failed", "binding_invite", input.inviteId, { claimId: input.claimId, playerAccountId: input.playerAccountId, mode: input.mode });
      } catch {
        // Binding activation remains successful even if migration recovery state cannot be written.
      }
    }
  };

  const dispatchPendingQqGroupPolicyEvents = async () => {
    if (!qqPolicyQueue) return;
    const timestamp = now();
    const events = await db.select().from(qqGroupPolicyOutbox)
      .where(and(isNull(qqGroupPolicyOutbox.deliveredAt), or(isNull(qqGroupPolicyOutbox.enqueuedAt), lt(qqGroupPolicyOutbox.enqueuedAt, timestamp - 5 * 60 * 1000))))
      .orderBy(qqGroupPolicyOutbox.createdAt)
      .limit(25);
    for (const event of events) {
      try {
        await qqPolicyQueue.send({ version: 1 as const, eventId: event.id });
        await db.update(qqGroupPolicyOutbox).set({ enqueuedAt: timestamp }).where(and(eq(qqGroupPolicyOutbox.id, event.id), isNull(qqGroupPolicyOutbox.deliveredAt)));
      } catch {
        // The outbox remains pending for the scheduled repair pass.
      }
    }
  };

  // Batch-load challenge↔map associations once and group in memory.
  // The association table is small; prefer one full read over per-challenge queries.
  // Use globalThis.Map: the contracts `Map` type shadows the built-in Map constructor.
  const loadChallengeMapIds = async (challengeIds?: string[]): Promise<globalThis.Map<string, string[]>> => {
    const d1InBindSoftLimit = 80;
    const rows = challengeIds === undefined || challengeIds.length > d1InBindSoftLimit
      ? await db.select({ challengeId: achievementChallengeMaps.challengeId, mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps)
      : challengeIds.length === 0
        ? []
        : await db.select({ challengeId: achievementChallengeMaps.challengeId, mapId: achievementChallengeMaps.mapId })
          .from(achievementChallengeMaps)
          .where(inArray(achievementChallengeMaps.challengeId, challengeIds));
    const allowed = challengeIds && challengeIds.length > d1InBindSoftLimit ? new Set(challengeIds) : null;
    const grouped = new globalThis.Map<string, string[]>();
    for (const { challengeId, mapId } of rows) {
      if (allowed && !allowed.has(challengeId)) continue;
      const current = grouped.get(challengeId);
      if (current) current.push(mapId);
      else grouped.set(challengeId, [mapId]);
    }
    return grouped;
  };

  // ── Map title rule resolution ────────────────────────────────────────────────
  //
  // Immutable snapshot type persisted to submissions.rule_snapshot_json.
  // All fields are required; exceptionId is null when the rule default applies.
  type MapTitleRuleSnapshot = {
    challengeId?: string;
    challengeType?: string;
    ruleId: string;
    ruleRevision: number; // updatedAt timestamp of the rule row at resolution time
    mapId: string | null;
    gameplayRevisionId: string | null;
    titleKey: string;
    mapVariant: "classic" | null;
    slot: string | null;
    displayKind: string;
    condition: string;
    evidenceRule: string;
    submissionMode: string;
    defaultScope: string;
    exceptionId: string | null;
  };

  const selectGameplayRevision = async (input: {
    mapId: string;
    mapVariant: "classic" | null;
    gameplayRevisionId?: string | null;
    allowHistorical?: boolean;
  }) => {
    if (input.gameplayRevisionId) {
      const revision = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.id, input.gameplayRevisionId)).get();
      if (!revision || revision.mapId !== input.mapId) return null;
      if (!input.allowHistorical && !["default", "selectable"].includes(revision.lifecycle)) return null;
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
        isNull(gameplayRevisions.legacyMapVariant),
        eq(gameplayRevisions.lifecycle, "default"),
      )).get();
  };

  // Resolve the deterministic projection for a (ruleId, mapId) pair.
  // Returns null when no challenge is projected (retired map, disabled exception,
  // or map outside an explicit-scope rule with no exception).
  //
  // Exception precedence (from the issue's locked invariants):
  //   1. A retired or inactive map → no projection.
  //   2. A disabled exception (enabled=0) → no projection.
  //   3. An enabled exception → override fields win over rule defaults.
  //   4. Map is inside the rule's effective scope → rule default applies.
  //   5. Otherwise → no projection.
  const resolveMapTitleProjection = async (
    ruleId: string,
    mapId: string,
    gameplayRevisionId?: string | null,
  ): Promise<MapTitleRuleSnapshot | null> => {
    // Step 1: check map status.
    const map = await db.select({ id: maps.id, status: maps.status }).from(maps).where(eq(maps.id, mapId)).get();
    if (!map || map.status !== "active") return null;

    // Load the rule.
    const rule = await db.select().from(mapTitleRules).where(eq(mapTitleRules.id, ruleId)).get();
    if (!rule || rule.status === "inactive") return null;
    // Pioneer is a time-limited map event. It must never inherit to every
    // active map, including while an older database is being migrated.
    if (rule.kind.trim().toLocaleLowerCase() === "pioneer" && rule.defaultScope !== "explicit") return null;

    const mapVariant = (rule.mapVariant as "classic" | null) ?? null;
    const revision = await selectGameplayRevision({ mapId, mapVariant, gameplayRevisionId, allowHistorical: Boolean(gameplayRevisionId) });
    if (!revision) return null;
    const assignment = await db.select().from(gameplayRevisionChallengeAssignments).where(and(
      eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, revision.id),
      eq(gameplayRevisionChallengeAssignments.mapId, mapId),
      eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_title_rule"),
      eq(gameplayRevisionChallengeAssignments.challengeId, rule.id),
    )).get();
    if (!assignment || assignment.enabled === 0) return null;

    // The legacy exception remains useful provenance for migrated snapshots,
    // while the revision assignment is now authoritative for eligibility.
    const exception = await db.select().from(mapTitleRuleExceptions)
      .where(and(eq(mapTitleRuleExceptions.ruleId, ruleId), eq(mapTitleRuleExceptions.mapId, mapId)))
      .get();
    return {
      ruleId: rule.id,
      ruleRevision: Math.max(rule.updatedAt, assignment.updatedAt),
      mapId,
      gameplayRevisionId: revision.id,
      titleKey: rule.titleKey,
      mapVariant,
      slot: assignment.slot ?? rule.slot ?? null,
      displayKind: rule.displayKind,
      condition: assignment.condition ?? rule.condition,
      evidenceRule: assignment.evidenceRule ?? rule.evidenceRule,
      submissionMode: assignment.submissionMode ?? rule.submissionMode,
      defaultScope: rule.defaultScope,
      exceptionId: exception?.id ?? null,
    };
  };

  // Resolve a compat-mapped legacy challenge ID through the rule model.
  // Returns the snapshot if the compat entry exists and the map is still active,
  // or null if the map is retired / the compat entry is missing.
  const resolveCompatProjection = async (
    legacyChallengeId: string,
    mapId: string,
    gameplayRevisionId?: string | null,
  ): Promise<MapTitleRuleSnapshot | null> => {
    const compat = await db.select({ ruleId: mapTitleRuleCompat.ruleId })
      .from(mapTitleRuleCompat)
      .where(and(eq(mapTitleRuleCompat.legacyChallengeId, legacyChallengeId), eq(mapTitleRuleCompat.mapId, mapId)))
      .get();
    if (!compat) return null;
    return resolveMapTitleProjection(compat.ruleId, mapId, gameplayRevisionId);
  };

  const resolveLegacyProjection = async (legacyChallengeId: string, mapId?: string, gameplayRevisionId?: string | null): Promise<MapTitleRuleSnapshot | null> => {
    const rows = await db.select({ ruleId: mapTitleRuleCompat.ruleId, mapId: mapTitleRuleCompat.mapId })
      .from(mapTitleRuleCompat)
      .where(mapId ? and(eq(mapTitleRuleCompat.legacyChallengeId, legacyChallengeId), eq(mapTitleRuleCompat.mapId, mapId)) : eq(mapTitleRuleCompat.legacyChallengeId, legacyChallengeId));
    if (!rows.length) return null;
    if (!mapId && rows.length > 1) throw new Error("MAP_REQUIRED");
    const target = rows[0];
    return resolveMapTitleProjection(target.ruleId, target.mapId, gameplayRevisionId);
  };

  const snapshotTitleChallenge = async (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    mapId: string | null,
    gameplayRevisionId?: string | null,
  ): Promise<MapTitleRuleSnapshot | null> => {
    const mapVariant = (challenge.mapVariant as "classic" | null) ?? null;
    if (!mapId) {
      return {
        challengeId: challenge.id,
        challengeType: "title_achievement",
        ruleId: `title-challenge:${challenge.id}`,
        ruleRevision: challenge.updatedAt,
        mapId: null,
        gameplayRevisionId: null,
        titleKey: title.key,
        mapVariant,
        slot: null,
        displayKind: title.displayKind,
        condition: challenge.condition,
        evidenceRule: challenge.evidenceRule,
        submissionMode: challenge.submissionMode,
        defaultScope: challenge.scope ?? "global",
        exceptionId: null,
      };
    }
    const revision = await selectGameplayRevision({ mapId, mapVariant, gameplayRevisionId, allowHistorical: Boolean(gameplayRevisionId) });
    if (!revision) return null;
    const assignment = await db.select().from(gameplayRevisionChallengeAssignments).where(and(
      eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, revision.id),
      eq(gameplayRevisionChallengeAssignments.mapId, mapId),
      eq(gameplayRevisionChallengeAssignments.challengeFamily, "title_challenge"),
      eq(gameplayRevisionChallengeAssignments.challengeId, challenge.id),
    )).get();
    if (!assignment || assignment.enabled === 0) return null;
    return {
      challengeId: challenge.id,
      challengeType: "map_title_achievement",
      ruleId: `title-challenge:${challenge.id}`,
      ruleRevision: Math.max(challenge.updatedAt, assignment.updatedAt),
      mapId,
      gameplayRevisionId: revision.id,
      titleKey: title.key,
      mapVariant,
      slot: assignment.slot ?? null,
      displayKind: title.displayKind,
      condition: assignment.condition ?? challenge.condition,
      evidenceRule: assignment.evidenceRule ?? challenge.evidenceRule,
      submissionMode: assignment.submissionMode ?? challenge.submissionMode,
      defaultScope: challenge.scope ?? "map",
      exceptionId: null,
    };
  };

  const resolveAssignedGameplayRevision = async (input: {
    mapId: string;
    mapVariant: "classic" | null;
    challengeFamily: "map_challenge" | "map_title_rule" | "title_challenge";
    challengeId: string;
    gameplayRevisionId?: string | null;
  }) => {
    const revision = await selectGameplayRevision({
      mapId: input.mapId,
      mapVariant: input.mapVariant,
      gameplayRevisionId: input.gameplayRevisionId,
      allowHistorical: Boolean(input.gameplayRevisionId),
    });
    if (!revision) return null;
    const assignment = await db.select().from(gameplayRevisionChallengeAssignments).where(and(
      eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, revision.id),
      eq(gameplayRevisionChallengeAssignments.mapId, input.mapId),
      eq(gameplayRevisionChallengeAssignments.challengeFamily, input.challengeFamily),
      eq(gameplayRevisionChallengeAssignments.challengeId, input.challengeId),
      eq(gameplayRevisionChallengeAssignments.enabled, 1),
    )).get();
    return assignment ? { revision, assignment } : null;
  };

  const snapshotMapChallenge = async (
    challenge: typeof achievementChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    gameplayRevisionId?: string | null,
  ): Promise<MapTitleRuleSnapshot | null> => {
    if (!challenge.rewardTitleKey) return null;
    const mapVariant = challenge.type === "classic_completion" ? "classic" as const : null;
    const resolved = await resolveAssignedGameplayRevision({
      mapId: challenge.mapId,
      mapVariant,
      challengeFamily: "map_challenge",
      challengeId: challenge.id,
      gameplayRevisionId,
    });
    if (!resolved) return null;
    return {
      challengeId: challenge.id,
      challengeType: challenge.type,
      ruleId: `challenge:${challenge.id}`,
      ruleRevision: Math.max(challenge.updatedAt, resolved.assignment.updatedAt),
      mapId: challenge.mapId,
      gameplayRevisionId: resolved.revision.id,
      titleKey: challenge.rewardTitleKey,
      mapVariant,
      slot: resolved.assignment.slot ?? null,
      displayKind: title.displayKind,
      condition: resolved.assignment.condition ?? challenge.condition,
      evidenceRule: resolved.assignment.evidenceRule ?? challenge.evidenceRule,
      submissionMode: resolved.assignment.submissionMode ?? challenge.submissionMode,
      defaultScope: "map",
      exceptionId: null,
    };
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

  const materializeDefaultMapTitleRuleAssignments = async (rule: typeof mapTitleRules.$inferSelect) => {
    if (rule.status === "inactive" || rule.defaultScope !== "all_active" || rule.kind.trim().toLocaleLowerCase() === "pioneer") return;
    const mapVariant = (rule.mapVariant as "classic" | null) ?? null;
    const revisions = await db.select({ revision: gameplayRevisions }).from(gameplayRevisions)
      .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
      .where(and(eq(maps.status, "active"), mapVariant === "classic" ? and(eq(gameplayRevisions.lifecycle, "selectable"), eq(gameplayRevisions.legacyMapVariant, "classic")) : and(eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant))));
    if (!revisions.length) return;
    const timestamp = now();
    await db.insert(gameplayRevisionChallengeAssignments).values(revisions.map(({ revision }) => ({
      id: `assignment:${revision.id}:map_title_rule:${rule.id}`,
      gameplayRevisionId: revision.id,
      mapId: revision.mapId,
      challengeFamily: "map_title_rule",
      challengeId: rule.id,
      enabled: 1,
      condition: null,
      evidenceRule: null,
      submissionMode: null,
      slot: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }))).onConflictDoNothing();
  };


  const toPublicTitleChallenge = (
    challenge: typeof titleChallenges.$inferSelect,
    title: typeof titleCatalog.$inferSelect,
    timestamp: number,
    mapIdsByChallenge: globalThis.Map<string, string[]>,
  ): Extract<Challenge, { family: "achievement" }> | null => {
    const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp);
    if (!status) return null;
    return {
      challengeId: challenge.id,
      family: "achievement" as const,
      type: "title_achievement" as const,
      kind: "title_achievement" as const,
      titleKey: title.key,
      titleName: title.label,
      icon: title.icon,
      iconUrl: title.iconUrl,
      category: challenge.categoryOverride ?? title.category,
      condition: challenge.condition,
      evidenceRule: challenge.evidenceRule,
      gameVersion: challenge.gameVersion,
      status: status as "scheduled" | "active" | "sunsetting",
      startsAt: challenge.startsAt ?? undefined,
      endsAt: challenge.endsAt ?? undefined,
      retiredVersion: challenge.retiredVersion ?? undefined,
      submissionMode: challenge.submissionMode as "manual" | "automatic",
      scope: (challenge.scope ?? "global") as "global" | "map",
      mapIds: (challenge.scope ?? "global") === "map" ? (mapIdsByChallenge.get(challenge.id) ?? []) : [],
      ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}),
    };
  };

  const toPublicMapChallenge = (
    challenge: typeof achievementChallenges.$inferSelect,
    map: typeof maps.$inferSelect,
    assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect,
    revision: typeof gameplayRevisions.$inferSelect,
  ): Extract<Challenge, { family: "map" }> => ({
    challengeId: challenge.id,
    family: "map",
    gameplayRevisionId: revision.id,
    type: "map_completion",
    kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion",
    name: challenge.name,
    mapId: map.id,
    mapName: map.name,
    ...(challenge.rewardTitleKey ? { titleKey: challenge.rewardTitleKey } : {}),
    ...(challenge.type === "classic_completion" ? { mapVariant: "classic" as const } : {}),
    condition: assignment.condition ?? challenge.condition,
    evidenceRule: assignment.evidenceRule ?? challenge.evidenceRule,
    submissionMode: (assignment.submissionMode ?? challenge.submissionMode) as "manual" | "automatic",
    difficulty: challenge.difficulty ?? undefined,
    gameVersion: challenge.gameVersion,
    status: challenge.status as "active" | "sunsetting",
    retiredVersion: challenge.retiredVersion ?? undefined,
  });

  // Fetch all currently public challenges in a bounded number of queries.
  // Used by the batch event list path and other composed catalog reads.
  const fetchAllPublicChallenges = async (): Promise<Challenge[]> => {
    const [mapRows, titleRows, mapIdsByChallenge] = await Promise.all([
      db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions }).from(achievementChallenges)
        .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
        .innerJoin(gameplayRevisionChallengeAssignments, and(
          eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
          eq(gameplayRevisionChallengeAssignments.challengeId, achievementChallenges.id),
          eq(gameplayRevisionChallengeAssignments.mapId, achievementChallenges.mapId),
          eq(gameplayRevisionChallengeAssignments.enabled, 1),
        ))
        .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
        .where(and(
        inArray(achievementChallenges.status, ["active", "sunsetting"]),
        eq(maps.status, "active"),
        eq(gameplayRevisions.mapId, achievementChallenges.mapId),
        inArray(gameplayRevisions.lifecycle, ["default", "selectable"]),
        notExists(db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId })
          .from(mapTitleRuleCompat)
          .where(and(
            eq(mapTitleRuleCompat.legacyChallengeId, achievementChallenges.id),
            eq(mapTitleRuleCompat.mapId, achievementChallenges.mapId),
          ))),
        )),
      db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.availability, "active"))),
      loadChallengeMapIds(),
    ]);
    const timestamp = now();
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
    for (const { challenge, title } of titleRows) {
      const item = toPublicTitleChallenge(challenge, title, timestamp, mapIdsByChallenge);
      // Public event composition only surfaces currently open title challenges.
      if (item && (item.status === "active" || item.status === "sunsetting") && item.scope !== "map") items.push(item);
    }
    return items;
  };

  const fetchAllAutoMatchChallenges = async (): Promise<Challenge[]> => [
    ...await fetchAllPublicChallenges(),
    ...await loadMapTitleRuleChallenges(),
    ...await loadMapScopedTitleChallenges(),
  ];

  // Single-event path: load only linked challenges (bounded), not the full catalog.
  const publicEventChallenges = async (eventId: string) => {
    const [mapLinks, titleLinks] = await Promise.all([
      db.select().from(randomEventMapChallenges).where(eq(randomEventMapChallenges.eventId, eventId)),
      db.select().from(randomEventTitleChallenges).where(eq(randomEventTitleChallenges.eventId, eventId)),
    ]);
    const mapChallengeIds = mapLinks.map((link) => link.challengeId);
    const titleChallengeIds = titleLinks.map((link) => link.challengeId);
    if (!mapChallengeIds.length && !titleChallengeIds.length) return [];
    const [mapRows, titleRows, mapIdsByChallenge] = await Promise.all([
      mapChallengeIds.length
        ? db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .innerJoin(gameplayRevisionChallengeAssignments, and(
            eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
            eq(gameplayRevisionChallengeAssignments.challengeId, achievementChallenges.id),
            eq(gameplayRevisionChallengeAssignments.mapId, achievementChallenges.mapId),
            eq(gameplayRevisionChallengeAssignments.enabled, 1),
          ))
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(inArray(achievementChallenges.id, mapChallengeIds), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active"), eq(gameplayRevisions.mapId, achievementChallenges.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])))
        : Promise.resolve([] as Array<{ challenge: typeof achievementChallenges.$inferSelect; map: typeof maps.$inferSelect; assignment: typeof gameplayRevisionChallengeAssignments.$inferSelect; revision: typeof gameplayRevisions.$inferSelect }>),
      titleChallengeIds.length
        ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.id, titleChallengeIds), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.availability, "active")))
        : Promise.resolve([] as Array<{ challenge: typeof titleChallenges.$inferSelect; title: typeof titleCatalog.$inferSelect }>),
      loadChallengeMapIds(titleChallengeIds),
    ]);
    const timestamp = now();
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
    for (const { challenge, title } of titleRows) {
      const item = toPublicTitleChallenge(challenge, title, timestamp, mapIdsByChallenge);
      if (item && (item.status === "active" || item.status === "sunsetting")) items.push(item);
    }
    return items;
  };
  const loadMapTitleRuleChallenges = async (includeInactive = false): Promise<Challenge[]> => {
    const [rows, revisionRows, assignments, compat] = await Promise.all([
      db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .where(and(includeInactive ? undefined : inArray(mapTitleRules.status, ["active", "sunsetting"]), eq(titleCatalog.availability, "active"))),
      db.select({ map: maps, revision: gameplayRevisions }).from(gameplayRevisions)
        .innerJoin(maps, eq(gameplayRevisions.mapId, maps.id))
        .where(and(eq(maps.status, "active"), inArray(gameplayRevisions.lifecycle, ["default", "selectable"]))),
      db.select().from(gameplayRevisionChallengeAssignments).where(eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_title_rule")),
      db.select().from(mapTitleRuleCompat),
    ]);
    const assignmentByRevisionRule = new globalThis.Map(assignments.map((item) => [`${item.gameplayRevisionId}:${item.challengeId}`, item]));
    const compatByRuleMap = new globalThis.Map(compat.map((item) => [`${item.ruleId}:${item.mapId}`, item.legacyChallengeId]));
    const items: Challenge[] = [];
    for (const { rule, title } of rows) {
      if (rule.kind.trim().toLocaleLowerCase() === "pioneer" && rule.defaultScope !== "explicit") continue;
      for (const { map, revision } of revisionRows) {
        const assignment = assignmentByRevisionRule.get(`${revision.id}:${rule.id}`);
        if (!assignment || assignment.mapId !== map.id || assignment.enabled === 0) continue;
        const slot = assignment.slot ?? rule.slot ?? null;
        items.push({
          challengeId: compatByRuleMap.get(`${rule.id}:${map.id}`) ?? `${map.id}.${rule.kind}`,
          family: "map", gameplayRevisionId: revision.id, type: "map_completion", kind: "map_title_achievement",
          name: title.label, mapId: map.id, mapName: map.name, titleKey: title.key,
          ...(rule.mapVariant ? { mapVariant: rule.mapVariant as "classic" } : {}),
          condition: assignment.condition ?? rule.condition,
          evidenceRule: assignment.evidenceRule ?? rule.evidenceRule,
          submissionMode: (assignment.submissionMode ?? rule.submissionMode) as "manual" | "automatic",
          mapTitleRule: { ruleId: rule.id, kind: rule.kind, displayKind: rule.displayKind as "fixed" | "map_pioneer" | "map_name_suffix", slot: slot as "pioneer" | "conqueror" | "dominator" | null, dynamic: true },
          gameVersion: rule.introducedVersion,
          status: rule.status as "active" | "sunsetting",
          retiredVersion: rule.retiredVersion ?? undefined,
        });
      }
    }
    return items;
  };
  const loadMapScopedTitleChallenges = async (): Promise<Challenge[]> => {
    const rows = await db.select({ challenge: titleChallenges, title: titleCatalog, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions, map: maps })
      .from(gameplayRevisionChallengeAssignments)
      .innerJoin(titleChallenges, eq(gameplayRevisionChallengeAssignments.challengeId, titleChallenges.id))
      .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
      .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
      .innerJoin(maps, eq(gameplayRevisionChallengeAssignments.mapId, maps.id))
      .where(and(
        eq(gameplayRevisionChallengeAssignments.challengeFamily, "title_challenge"),
        eq(gameplayRevisionChallengeAssignments.enabled, 1),
        inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]),
        eq(titleChallenges.scope, "map"),
        eq(titleCatalog.availability, "active"),
        eq(maps.status, "active"),
        eq(gameplayRevisions.mapId, gameplayRevisionChallengeAssignments.mapId),
        inArray(gameplayRevisions.lifecycle, ["default", "selectable"]),
      ));
    const compatRows = await db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId }).from(mapTitleRuleCompat);
    const compatIds = new Set(compatRows.map(({ legacyChallengeId }) => legacyChallengeId));
    return rows.flatMap(({ challenge, title, assignment, revision, map }) => {
      if (compatIds.has(challenge.id)) return [];
      const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, now());
      if (!status || (status !== "active" && status !== "sunsetting")) return [];
      const mapVariant = (challenge.mapVariant as "classic" | null) ?? null;
      return [{
        challengeId: challenge.id,
        family: "map" as const,
        gameplayRevisionId: revision.id,
        type: "map_completion" as const,
        kind: "map_title_achievement" as const,
        titleKey: title.key,
        name: title.label,
        mapId: map.id,
        mapName: map.name,
        condition: assignment.condition ?? challenge.condition,
        evidenceRule: assignment.evidenceRule ?? challenge.evidenceRule,
        submissionMode: (assignment.submissionMode ?? challenge.submissionMode) as "manual" | "automatic",
        gameVersion: challenge.gameVersion,
        status: status as "active" | "sunsetting",
        retiredVersion: challenge.retiredVersion ?? undefined,
        ...(mapVariant ? { mapVariant } : {}),
      }];
    });
  };
  const parseAgentSpatialConfig = (value: string | null) => {
    if (!value) return null;
    try {
      const parsed = agentSpatialConfigSchema.safeParse(JSON.parse(value));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };

  type AdminRevisionAssignmentInput = Omit<AdminMapRevisionChallengeAssignment, "assignmentId" | "gameplayRevisionId" | "mapId">;
  const revisionChallengeFamilies = new Set(["map_challenge", "map_title_rule", "title_challenge"]);
  const revisionLifecycles = new Set(["preparing", "default", "selectable", "historical"]);
  const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
  const nullableEditorText = (value: string | null) => value?.trim() || null;

  const parseEditorSpatialConfig = (value: string | null) => {
    if (value === null) return null;
    let decoded: unknown;
    try {
      decoded = JSON.parse(value);
    } catch {
      throw new Error("INVALID_SPATIAL_CONFIG");
    }
    const parsed = agentSpatialConfigSchema.safeParse(decoded);
    if (!parsed.success) throw new Error("INVALID_SPATIAL_CONFIG");
    return parsed.data;
  };

  const asAdminMapRevision = (
    row: typeof gameplayRevisions.$inferSelect,
    assignmentRows: Array<typeof gameplayRevisionChallengeAssignments.$inferSelect>,
  ): AdminMapRevision => {
    if (!revisionLifecycles.has(row.lifecycle)) throw new Error("INVALID_REVISION_LIFECYCLE");
    if (row.legacyMapVariant !== null && row.legacyMapVariant !== "classic") throw new Error("INVALID_MAP_VARIANT");
    const challengeAssignments = assignmentRows.map((assignment) => {
      if (assignment.gameplayRevisionId !== row.id || assignment.mapId !== row.mapId || !revisionChallengeFamilies.has(assignment.challengeFamily)) throw new Error("INVALID_REVISION_ASSIGNMENT");
      return {
        assignmentId: assignment.id,
        gameplayRevisionId: assignment.gameplayRevisionId,
        mapId: assignment.mapId,
        challengeFamily: assignment.challengeFamily as AdminMapRevisionChallengeAssignment["challengeFamily"],
        challengeId: assignment.challengeId,
        enabled: assignment.enabled === 1,
        condition: nullableEditorText(assignment.condition),
        evidenceRule: nullableEditorText(assignment.evidenceRule),
        submissionMode: assignment.submissionMode === null ? null : assignment.submissionMode as "manual" | "automatic",
        slot: assignment.slot === null ? null : assignment.slot as "pioneer" | "conqueror" | "dominator",
      };
    });
    return {
      revisionId: row.id,
      mapId: row.mapId,
      lifecycle: row.lifecycle as AdminMapRevision["lifecycle"],
      mapVariant: row.legacyMapVariant as "classic" | null,
      copiedFromRevisionId: row.copiedFromRevisionId,
      resetReason: nullableEditorText(row.resetReason),
      gameVersion: row.gameVersion,
      spatialConfig: parseEditorSpatialConfig(row.spatialConfigJson),
      isDefault: row.lifecycle === "default",
      isSelectable: row.lifecycle === "selectable",
      challengeAssignments,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  const loadAdminMapRevision = async (revisionId: string): Promise<AdminMapRevision> => {
    const row = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.id, revisionId)).get();
    if (!row) throw new Error("REVISION_NOT_FOUND");
    const assignments = await db.select().from(gameplayRevisionChallengeAssignments)
      .where(eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, revisionId))
      .orderBy(asc(gameplayRevisionChallengeAssignments.challengeFamily), asc(gameplayRevisionChallengeAssignments.challengeId));
    return asAdminMapRevision(row, assignments);
  };

  const loadAdminMapEditorChallengeCatalog = async (mapId: string): Promise<AdminMapEditorChallengeOption[]> => {
    const [mapChallengeRows, ruleRows, titleChallengeRows] = await Promise.all([
      db.select().from(achievementChallenges).where(eq(achievementChallenges.mapId, mapId)),
      db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key)),
      db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .innerJoin(achievementChallengeMaps, eq(achievementChallengeMaps.challengeId, titleChallenges.id))
        .where(and(eq(achievementChallengeMaps.mapId, mapId), eq(titleChallenges.scope, "map"))),
    ]);
    return [
      ...mapChallengeRows.map((challenge): AdminMapEditorChallengeOption => ({
        challengeFamily: "map_challenge", challengeId: challenge.id, label: challenge.name, kind: challenge.type, status: challenge.status, gameVersion: challenge.gameVersion,
      })),
      ...ruleRows.map(({ rule, title }): AdminMapEditorChallengeOption => ({
        challengeFamily: "map_title_rule", challengeId: rule.id, label: title.label, kind: rule.kind, status: rule.status, gameVersion: rule.introducedVersion,
      })),
      ...titleChallengeRows.map(({ challenge, title }): AdminMapEditorChallengeOption => ({
        challengeFamily: "title_challenge", challengeId: challenge.id, label: title.label, kind: "title_challenge", status: challenge.status, gameVersion: challenge.gameVersion,
      })),
    ].sort((left, right) => compareText(`${left.challengeFamily}:${left.label}:${left.challengeId}`, `${right.challengeFamily}:${right.label}:${right.challengeId}`));
  };

  const loadAdminMapEditorAudit = async (mapId: string, revisionIds: string[]) => {
    const entityFilter = revisionIds.length ? or(eq(auditEvents.entityId, mapId), inArray(auditEvents.entityId, revisionIds)) : eq(auditEvents.entityId, mapId);
    const rows = await db.select().from(auditEvents).where(and(
      inArray(auditEvents.operation, ["admin.map.metadata.update", "admin.map.revision.create", "admin.map.revision.update"]),
      entityFilter,
    )).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(100);
    return rows.map((row) => {
      let payload: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(row.payloadJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
      } catch {
        payload = {};
      }
      return { operation: row.operation, actorType: row.actorType, actorId: row.actorId, entityType: row.entityType, entityId: row.entityId, payload, createdAt: row.createdAt };
    });
  };

  const loadAdminMap = async (mapId: string): Promise<Map | null> => {
    const row = await db.select({ map: maps, metadata: mapMetadata }).from(maps).leftJoin(mapMetadata, eq(mapMetadata.mapId, maps.id)).where(eq(maps.id, mapId)).get();
    if (!row) return null;
    return {
      mapId: row.map.id,
      mapName: row.map.name,
      gameVersion: row.map.gameVersion,
      difficultyRating: (row.metadata?.difficultyRating as Map["difficultyRating"]) ?? null,
      mechanics: row.metadata?.mechanicsJson ? JSON.parse(row.metadata.mechanicsJson) as string[] : [],
      coverUrl: row.metadata?.coverUrl ?? null,
      backgroundUrl: row.metadata?.backgroundUrl ?? null,
    };
  };

  const validateRevisionAssignments = async (mapId: string, assignments: AdminRevisionAssignmentInput[]) => {
    const seen = new Set<string>();
    for (const assignment of assignments) {
      if (!revisionChallengeFamilies.has(assignment.challengeFamily)) throw new Error("INVALID_REVISION_ASSIGNMENT");
      const identity = `${assignment.challengeFamily}:${assignment.challengeId}`;
      if (seen.has(identity)) throw new Error("DUPLICATE_REVISION_ASSIGNMENT");
      seen.add(identity);
      if (assignment.challengeFamily === "map_challenge") {
        const challenge = await db.select({ id: achievementChallenges.id, status: achievementChallenges.status }).from(achievementChallenges).where(and(eq(achievementChallenges.id, assignment.challengeId), eq(achievementChallenges.mapId, mapId))).get();
        if (!challenge) throw new Error("REVISION_CHALLENGE_NOT_FOUND");
        if (assignment.enabled && !["active", "sunsetting"].includes(challenge.status)) throw new Error("REVISION_CHALLENGE_NOT_ACTIVE");
      } else if (assignment.challengeFamily === "map_title_rule") {
        const rule = await db.select({ id: mapTitleRules.id, kind: mapTitleRules.kind, defaultScope: mapTitleRules.defaultScope, status: mapTitleRules.status }).from(mapTitleRules).where(eq(mapTitleRules.id, assignment.challengeId)).get();
        if (!rule) throw new Error("REVISION_CHALLENGE_NOT_FOUND");
        if (assignment.enabled && !["active", "sunsetting"].includes(rule.status)) throw new Error("REVISION_CHALLENGE_NOT_ACTIVE");
        if (assignment.enabled && rule.kind.trim().toLocaleLowerCase() === "pioneer" && rule.defaultScope !== "explicit") throw new Error("REVISION_CHALLENGE_NOT_ASSIGNABLE");
      } else {
        const challenge = await db.select({ id: titleChallenges.id, status: titleChallenges.status }).from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .innerJoin(achievementChallengeMaps, eq(achievementChallengeMaps.challengeId, titleChallenges.id))
          .where(and(eq(titleChallenges.id, assignment.challengeId), eq(achievementChallengeMaps.mapId, mapId), eq(titleChallenges.scope, "map"))).get();
        if (!challenge) throw new Error("REVISION_CHALLENGE_NOT_FOUND");
        if (assignment.enabled && !["scheduled", "active", "sunsetting"].includes(challenge.status)) throw new Error("REVISION_CHALLENGE_NOT_ACTIVE");
      }
    }
  };

  const assertRevisionLifecycle = (current: string, next: AdminMapRevisionUpdateRequest["lifecycle"]) => {
    const allowed: Record<string, string[]> = {
      preparing: ["preparing", "default", "selectable", "historical"],
      default: ["default", "selectable", "historical"],
      selectable: ["selectable", "default", "historical"],
      historical: ["historical", "selectable"],
    };
    if (!allowed[current]?.includes(next)) throw new Error("INVALID_REVISION_TRANSITION");
  };

  const assertRevisionConfiguration = (lifecycle: AdminMapRevisionUpdateRequest["lifecycle"], mapVariant: "classic" | null, spatialConfig: AdminMapRevisionUpdateRequest["spatialConfig"]) => {
    if (lifecycle === "default" && mapVariant !== null) throw new Error("DEFAULT_REVISION_CANNOT_USE_CLASSIC_VARIANT");
    if ((lifecycle === "default" || lifecycle === "selectable") && !spatialConfig) throw new Error("INVALID_SPATIAL_CONFIG");
    if (spatialConfig && !agentSpatialConfigSchema.safeParse(spatialConfig).success) throw new Error("INVALID_SPATIAL_CONFIG");
  };

  type AgentMapProjectionRow = {
    map_id: string;
    map_name: string;
    map_game_version: string;
    difficulty_rating: string | null;
    mechanics_json: string | null;
    cover_url: string | null;
    background_url: string | null;
    revision_id: string | null;
    revision_map_id: string | null;
    revision_lifecycle: string | null;
    legacy_map_variant: string | null;
    revision_game_version: string | null;
    spatial_config_json: string | null;
  };
  type AgentRevisionAssignmentRow = {
    revision_id: string;
    assignment_map_id: string;
    revision_map_id: string;
    challenge_family: string;
    challenge_id: string;
    public_challenge_id: string | null;
    compat_rule_id: string | null;
  };
  const loadAgentMapProjectionsFast = async (input: { mapId?: string }): Promise<AgentMap[]> => {
    const mapFilter = input.mapId ? " AND m.id = ?" : "";
    const mapQuery = database.prepare([
      "SELECT m.id AS map_id, m.name AS map_name, m.game_version AS map_game_version,",
      "md.difficulty_rating, md.mechanics_json, md.cover_url, md.background_url,",
      "r.id AS revision_id, r.map_id AS revision_map_id, r.lifecycle AS revision_lifecycle,",
      "r.legacy_map_variant, r.game_version AS revision_game_version, r.spatial_config_json",
      "FROM maps m",
      "LEFT JOIN map_metadata md ON md.map_id = m.id",
      "LEFT JOIN gameplay_revisions r ON r.map_id = m.id AND r.lifecycle IN ('default', 'selectable')",
      "WHERE m.status = 'active'" + mapFilter,
      "ORDER BY m.name, m.id, CASE r.lifecycle WHEN 'default' THEN 0 WHEN 'selectable' THEN 1 ELSE 2 END, r.id",
    ].join(" ")).bind(...(input.mapId ? [input.mapId] : [])).all<AgentMapProjectionRow>();
    const assignmentFilter = input.mapId ? " AND r.map_id = ?" : "";
    const assignmentQuery = database.prepare([
      "SELECT a.gameplay_revision_id AS revision_id, a.map_id AS assignment_map_id, r.map_id AS revision_map_id,",
      "a.challenge_family, a.challenge_id,",
      "CASE",
      "WHEN a.challenge_family = 'map_challenge' THEN (",
      "  SELECT ac.id FROM achievement_challenges ac",
      "  WHERE ac.id = a.challenge_id AND ac.map_id = a.map_id AND ac.status IN ('active', 'sunsetting')",
      ")",
      "WHEN a.challenge_family = 'map_title_rule' THEN (",
      "  SELECT COALESCE((",
      "    SELECT c.legacy_challenge_id FROM map_title_rule_compat c",
      "    WHERE c.rule_id = rule.id AND c.map_id = a.map_id LIMIT 1",
      "  ), a.map_id || '.' || trim(rule.kind))",
      "  FROM map_title_rules rule",
      "  INNER JOIN title_catalog title ON title.key = rule.title_key AND title.availability = 'active'",
      "  WHERE rule.id = a.challenge_id AND rule.status IN ('active', 'sunsetting')",
      "    AND NOT (lower(trim(rule.kind)) = 'pioneer' AND rule.default_scope <> 'explicit')",
      ")",
      "WHEN a.challenge_family = 'title_challenge' THEN (",
      "  SELECT tc.id FROM title_challenges tc",
      "  INNER JOIN title_catalog title ON title.key = tc.title_key AND title.availability = 'active'",
      "  WHERE tc.id = a.challenge_id AND tc.scope = 'map'",
      "    AND tc.status IN ('scheduled', 'active', 'sunsetting')",
      "    AND NOT EXISTS (SELECT 1 FROM map_title_rule_compat c WHERE c.legacy_challenge_id = tc.id)",
      ")",
      "ELSE NULL END AS public_challenge_id,",
      "CASE WHEN a.challenge_family = 'map_challenge' THEN (",
      "  SELECT c.rule_id FROM map_title_rule_compat c",
      "  WHERE c.legacy_challenge_id = a.challenge_id AND c.map_id = a.map_id LIMIT 1",
      ") ELSE NULL END AS compat_rule_id",
      "FROM gameplay_revision_challenge_assignments a",
      "INNER JOIN gameplay_revisions r ON r.id = a.gameplay_revision_id AND r.lifecycle IN ('default', 'selectable')",
      "INNER JOIN maps m ON m.id = r.map_id AND m.status = 'active'",
      "WHERE a.enabled = 1" + assignmentFilter,
    ].join(" ")).bind(...(input.mapId ? [input.mapId] : [])).all<AgentRevisionAssignmentRow>();
    const [mapResult, assignmentResult] = await Promise.all([mapQuery, assignmentQuery]);
    const revisionsByMap = new globalThis.Map<string, AgentMapProjectionRow[]>();
    for (const row of mapResult.results) {
      const current = revisionsByMap.get(row.map_id) ?? [];
      current.push(row);
      revisionsByMap.set(row.map_id, current);
    }
    const assignmentsByRevision = new globalThis.Map<string, AgentRevisionAssignmentRow[]>();
    for (const row of assignmentResult.results) {
      const current = assignmentsByRevision.get(row.revision_id) ?? [];
      current.push(row);
      assignmentsByRevision.set(row.revision_id, current);
    }
    const items: AgentMap[] = [];
    for (const [mapId, rows] of revisionsByMap) {
      const first = rows[0];
      if (!first) continue;
      const revisionRows = rows.filter((row) => row.revision_id !== null);
      const defaultRows = revisionRows.filter((row) => row.revision_lifecycle === "default");
      const projectRevision = (row: AgentMapProjectionRow): AgentMap["gameplayRevisions"][number] | null => {
        if (!row.revision_id || !row.revision_map_id || !row.revision_lifecycle || !row.revision_game_version) return null;
        if (row.revision_map_id !== mapId || row.revision_lifecycle === "default" && row.legacy_map_variant === "classic" || row.legacy_map_variant !== null && row.legacy_map_variant !== "classic") return null;
        const spatialConfig = parseAgentSpatialConfig(row.spatial_config_json);
        if (!spatialConfig) return null;
        const assignments = assignmentsByRevision.get(row.revision_id) ?? [];
        const challengeIds = new Set<string>();
        for (const assignment of assignments) {
          if (assignment.assignment_map_id !== mapId || assignment.revision_map_id !== mapId) return null;
          let publicChallengeId = assignment.public_challenge_id;
          if (assignment.challenge_family === "map_challenge" && assignment.compat_rule_id) {
            publicChallengeId = assignments.find((candidate) => candidate.challenge_family === "map_title_rule" && candidate.challenge_id === assignment.compat_rule_id)?.public_challenge_id ?? null;
          }
          if (!publicChallengeId) return null;
          challengeIds.add(publicChallengeId);
        }
        const challengeRefs = [...challengeIds].sort().map((challengeId) => ({ family: "map" as const, challengeId }));
        const parsed = agentGameplayRevisionSchema.safeParse({
          gameplayRevisionId: row.revision_id,
          mapId,
          mapVariant: row.legacy_map_variant === "classic" ? "classic" : null,
          lifecycle: row.revision_lifecycle,
          enabled: true,
          isDefault: row.revision_lifecycle === "default",
          isSelectable: row.revision_lifecycle === "selectable",
          gameVersion: row.revision_game_version,
          spatialConfig,
          challengeRefs,
        });
        return parsed.success ? parsed.data : null;
      };
      const defaultProjection = defaultRows.length === 1 ? projectRevision(defaultRows[0]) : null;
      const projectedRevisions = defaultProjection
        ? [defaultProjection, ...revisionRows.filter((row) => row.revision_lifecycle === "selectable").map(projectRevision).filter((revision): revision is NonNullable<typeof revision> => revision !== null)]
        : [];
      projectedRevisions.sort((left, right) => (left.isDefault ? 0 : 1) - (right.isDefault ? 0 : 1)
        || (left.gameplayRevisionId < right.gameplayRevisionId ? -1 : left.gameplayRevisionId > right.gameplayRevisionId ? 1 : 0));
      items.push({
        mapId,
        mapName: first.map_name,
        gameVersion: first.map_game_version,
        difficultyRating: first.difficulty_rating as Map["difficultyRating"] ?? null,
        mechanics: first.mechanics_json ? JSON.parse(first.mechanics_json) as string[] : [],
        coverUrl: first.cover_url,
        backgroundUrl: first.background_url,
        gameplayRevisions: projectedRevisions,
      });
    }
    return items.sort((left, right) => left.mapName < right.mapName ? -1 : left.mapName > right.mapName ? 1 : left.mapId < right.mapId ? -1 : left.mapId > right.mapId ? 1 : 0);
  };

  const glossary = async () => (await db.select().from(effectGlossaryTerms)).map((term) => ({ key: term.key, nameZh: term.nameZh, aliases: JSON.parse(term.aliasesJson) as string[], category: term.category, summary: term.summary, definition: term.definition, rules: JSON.parse(term.rulesJson) as string[], sourceVersion: term.sourceVersion }));
  const annotateEffects = async (tags: string[]) => { const terms = await glossary(); const byLabel = new Map(terms.flatMap((term) => [term.nameZh, ...term.aliases].map((label) => [label, term] as const))); return tags.flatMap((tag) => { const term = byLabel.get(tag); return term ? [{ tag, term }] : []; }); };
  const asRandomEvent = async (row: typeof randomEvents.$inferSelect): Promise<RandomEvent> => { const effectTags = JSON.parse(row.effectTagsJson) as string[]; return { eventId: row.id, name: row.name, category: row.category, rarity: row.rarity, description: row.description, durationSeconds: row.durationSeconds, cooldownSeconds: row.cooldownSeconds, weight: row.weight, gameVersion: row.gameVersion, effectTags, effectAnnotations: await annotateEffects(effectTags), releaseStatus: row.releaseStatus as RandomEvent["releaseStatus"], archived: row.archivedAt !== null, challenges: await publicEventChallenges(row.id) }; };
  const validateEventLinks = async (links: EventImportRow["challengeLinks"]) => { for (const link of links) { const table = link.family === "map" ? achievementChallenges : titleChallenges; const found = await db.select({ id: table.id }).from(table).where(eq(table.id, link.challengeId)).get(); if (!found) throw new Error("CHALLENGE_NOT_FOUND"); } };
  const replaceEventLinks = async (eventId: string, links: EventImportRow["challengeLinks"]) => { await db.delete(randomEventMapChallenges).where(eq(randomEventMapChallenges.eventId, eventId)); await db.delete(randomEventTitleChallenges).where(eq(randomEventTitleChallenges.eventId, eventId)); const mapsLinks = links.filter((link) => link.family === "map"); const titleLinks = links.filter((link) => link.family === "achievement"); if (mapsLinks.length) await db.insert(randomEventMapChallenges).values(mapsLinks.map((link) => ({ eventId, challengeId: link.challengeId }))); if (titleLinks.length) await db.insert(randomEventTitleChallenges).values(titleLinks.map((link) => ({ eventId, challengeId: link.challengeId }))); };

  const getPlayerOwnedSubmission = async (submissionId: string, sessionToken: string) => {
    const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
    if (!session) throw new Error("UNAUTHENTICATED");
    const currentBinding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
    if (!currentBinding) throw new Error("UNAUTHENTICATED");
    const submission = await db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
    if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
    const submissionBinding = await db.select().from(bindings).where(eq(bindings.id, submission.bindingId)).get();
    if (!submissionBinding || submissionBinding.playerAccountId !== currentBinding.playerAccountId) throw new Error("SUBMISSION_NOT_FOUND");
    return submission;
  };

  const getCurrentPortalPlayer = async (sessionToken: string) => {
    const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
    if (!session) return null;
    const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
    if (!binding) return null;
    const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
    if (!player || player.status === "banned") return null;
    return { binding, player };
  };

  const normalizeMasteryEventCounters = (value: MasteryEventCounters | undefined): MasteryEventCounters => {
    const entries = Object.entries(value ?? {}).map(([key, count]) => {
      const normalizedKey = key.trim();
      if (!normalizedKey || !Number.isInteger(count) || count < 0) throw new Error("MASTERY_EVENT_COUNTER_INVALID");
      return [normalizedKey, count] as const;
    }).sort(([left], [right]) => left.localeCompare(right));
    if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new Error("MASTERY_EVENT_COUNTER_INVALID");
    return Object.fromEntries(entries);
  };

  const asVerifiedMasteryRun = (row: typeof masteryRuns.$inferSelect): VerifiedMasteryRun => {
    try {
      const eventCounters = normalizeMasteryEventCounters(JSON.parse(row.eventCountersJson) as MasteryEventCounters);
      const xpInputSnapshot = JSON.parse(row.xpInputSnapshotJson) as MasteryXpSnapshot;
      return {
        runId: row.id,
        playerAccountId: row.playerAccountId,
        sourceSubmissionId: row.sourceSubmissionId,
        mapId: row.mapId,
        gameplayRevisionId: row.gameplayRevisionId,
        mapVariant: (row.mapVariant ?? null) as VerifiedMasteryRun["mapVariant"],
        difficulty: row.difficulty as VerifiedMasteryRun["difficulty"],
        gameVersion: row.gameVersion,
        runCode: row.runCode,
        completionDurationSeconds: row.completionDurationSeconds,
        deaths: row.deaths,
        skips: row.skips,
        eventCounters,
        acceptanceSource: row.acceptanceSource as VerifiedMasteryRun["acceptanceSource"],
        acceptedAt: row.acceptedAt,
        status: row.status as VerifiedMasteryRun["status"],
        invalidatedAt: row.invalidatedAt,
        invalidatedBy: row.invalidatedBy,
        invalidationReason: row.invalidationReason,
        xpRuleVersion: row.xpRuleVersion,
        xpInputSnapshot,
        awardedXp: row.awardedXp,
      };
    } catch {
      throw new Error("MASTERY_RUN_DATA_INVALID");
    }
  };

  const prepareVerifiedMasteryRun = (input: VerifiedMasteryRunInput) => {
    const required = (value: string, error: string) => {
      const normalized = value.trim();
      if (!normalized) throw new Error(error);
      return normalized;
    };
    const completionDurationSeconds = input.completionDurationSeconds;
    if (!Number.isInteger(completionDurationSeconds) || completionDurationSeconds <= 0) throw new Error("MASTERY_COMPLETION_DURATION_INVALID");
    const acceptedAt = input.acceptedAt ?? now();
    if (!Number.isInteger(acceptedAt) || acceptedAt <= 0) throw new Error("MASTERY_ACCEPTED_AT_INVALID");
    const mapVariant = input.mapVariant ?? null;
    if (mapVariant !== null && mapVariant !== "classic") throw new Error("MASTERY_MAP_VARIANT_INVALID");
    if (!(["submission_automatic", "submission_review"] as const).includes(input.acceptanceSource)) throw new Error("MASTERY_ACCEPTANCE_SOURCE_INVALID");
    return {
      playerAccountId: required(input.playerAccountId, "MASTERY_PLAYER_NOT_FOUND"),
      sourceSubmissionId: required(input.sourceSubmissionId, "MASTERY_SUBMISSION_NOT_FOUND"),
      mapId: required(input.mapId, "MASTERY_MAP_NOT_FOUND"),
      gameplayRevisionId: required(input.gameplayRevisionId, "MASTERY_GAMEPLAY_REVISION_NOT_FOUND"),
      mapVariant,
      difficulty: input.difficulty,
      gameVersion: required(input.gameVersion, "MASTERY_GAME_VERSION_INVALID"),
      runCode: normalizeMasteryRunCode(input.runCode),
      completionDurationSeconds,
      deaths: input.deaths ?? null,
      skips: input.skips ?? null,
      eventCounters: normalizeMasteryEventCounters(input.eventCounters),
      acceptanceSource: input.acceptanceSource,
      acceptedAt,
      mapFactor: input.mapFactor ?? null,
    };
  };

  const masteryConflictFields = (run: VerifiedMasteryRun, input: ReturnType<typeof prepareVerifiedMasteryRun>): MasteryRunConflictField[] => {
    const fields: MasteryRunConflictField[] = [];
    if (run.runCode !== input.runCode) fields.push("run_code");
    if (run.mapId !== input.mapId) fields.push("map");
    if (run.gameplayRevisionId !== input.gameplayRevisionId) fields.push("gameplay_revision");
    if (run.mapVariant !== input.mapVariant) fields.push("map_variant");
    if (run.difficulty !== input.difficulty) fields.push("difficulty");
    if (run.gameVersion !== input.gameVersion) fields.push("game_version");
    if (run.completionDurationSeconds !== input.completionDurationSeconds) fields.push("completion_duration");
    if (run.deaths !== input.deaths) fields.push("deaths");
    if (run.skips !== input.skips) fields.push("skips");
    if (JSON.stringify(run.eventCounters) !== JSON.stringify(input.eventCounters)) fields.push("event_counters");
    return fields;
  };

  const loadActiveMasteryRuns = async (input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; currentOnly?: boolean }) => {
    const rows = await db.select({ run: masteryRuns, lifecycle: gameplayRevisions.lifecycle }).from(masteryRuns)
      .innerJoin(gameplayRevisions, eq(masteryRuns.gameplayRevisionId, gameplayRevisions.id))
      .where(and(
        eq(masteryRuns.playerAccountId, input.playerAccountId),
        eq(masteryRuns.status, "active"),
        input.mapId ? eq(masteryRuns.mapId, input.mapId) : undefined,
        input.gameplayRevisionId ? eq(masteryRuns.gameplayRevisionId, input.gameplayRevisionId) : undefined,
        input.currentOnly ? eq(gameplayRevisions.lifecycle, "default") : undefined,
      ));
    return rows.map(({ run, lifecycle }) => ({ run: asVerifiedMasteryRun(run), gameplayRevisionLifecycle: masteryRevisionLifecycle(lifecycle) }));
  };

  const loadPlayerMasteryHistory = async (input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; page: number; pageSize: number }) => {
    const condition = and(
      eq(masteryRuns.playerAccountId, input.playerAccountId),
      input.mapId ? eq(masteryRuns.mapId, input.mapId) : undefined,
      input.gameplayRevisionId ? eq(masteryRuns.gameplayRevisionId, input.gameplayRevisionId) : undefined,
    );
    const [rows, [{ total }]] = await Promise.all([
      db.select({ run: masteryRuns, lifecycle: gameplayRevisions.lifecycle }).from(masteryRuns)
        .innerJoin(gameplayRevisions, eq(masteryRuns.gameplayRevisionId, gameplayRevisions.id))
        .where(condition).orderBy(desc(masteryRuns.acceptedAt), desc(masteryRuns.id)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
      db.select({ total: count() }).from(masteryRuns).where(condition),
    ]);
    return { runs: rows.map(({ run, lifecycle }) => ({ run: asVerifiedMasteryRun(run), gameplayRevisionLifecycle: masteryRevisionLifecycle(lifecycle) })), total };
  };

  const activeMasteryProfiles = async (input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; currentOnly?: boolean; recentLimit?: number }): Promise<MasteryMapProfile[]> => {
    const runs = await loadActiveMasteryRuns(input);
    const recentLimit = Math.min(50, Math.max(1, input.recentLimit ?? 10));
    return buildMasteryProfiles(runs.map(({ run }) => run), recentLimit);
  };

  const masteryRevisionLifecycle = (value: string) => {
    if (!["preparing", "default", "selectable", "historical"].includes(value)) throw new Error("GAMEPLAY_REVISION_DATA_INVALID");
    return value as CurrentPlayerMasteryResponse["runs"][number]["gameplayRevisionLifecycle"];
  };

  const playerMasteryRunView = (run: MasteryRunForProjection, gameplayRevisionLifecycle: CurrentPlayerMasteryResponse["runs"][number]["gameplayRevisionLifecycle"]): CurrentPlayerMasteryResponse["runs"][number] => ({
    runId: run.runId,
    mapId: run.mapId,
    gameplayRevisionId: run.gameplayRevisionId,
    gameplayRevisionLifecycle,
    mapVariant: run.mapVariant,
    difficulty: run.difficulty,
    completionDurationSeconds: run.completionDurationSeconds,
    deaths: run.deaths,
    skips: run.skips,
    awardedXp: run.awardedXp,
    acceptedAt: run.acceptedAt,
    status: run.status,
  });

  const playerMasteryProfileView = (profile: MasteryMapProfile, gameplayRevisionLifecycle: CurrentPlayerMasteryResponse["profiles"][number]["gameplayRevisionLifecycle"]): CurrentPlayerMasteryResponse["profiles"][number] => ({
    mapId: profile.mapId,
    gameplayRevisionId: profile.gameplayRevisionId,
    gameplayRevisionLifecycle,
    totalXp: profile.totalXp,
    verifiedRunCount: profile.verifiedRunCount,
    difficultyStats: profile.difficultyStats,
    lowestDeaths: profile.lowestDeaths,
    fewestSkips: profile.fewestSkips,
    highestSingleRunXp: profile.highestSingleRunXp,
    highestCompletedDifficulty: profile.highestCompletedDifficulty,
    recentRuns: profile.recentRuns.map((run) => playerMasteryRunView(run, gameplayRevisionLifecycle)),
  });

  const transitionVerifiedMasteryRun = async (input: { masteryRunId: string; reason?: string }, actor: MasteryRunActor, nextStatus: "active" | "invalidated"): Promise<VerifiedMasteryRun> => {
    const runId = input.masteryRunId.trim();
    if (!runId) throw new Error("MASTERY_RUN_NOT_FOUND");
    if (!actor.actorId.trim()) throw new Error("MASTERY_RUN_ACTOR_INVALID");
    const row = await db.select().from(masteryRuns).where(eq(masteryRuns.id, runId)).get();
    if (!row) throw new Error("MASTERY_RUN_NOT_FOUND");
    if (row.status === nextStatus) return asVerifiedMasteryRun(row);
    if (nextStatus === "active") {
      const activeDuplicate = await db.select({ id: masteryRuns.id }).from(masteryRuns).where(and(
        eq(masteryRuns.playerAccountId, row.playerAccountId),
        eq(masteryRuns.runCode, row.runCode),
        eq(masteryRuns.status, "active"),
        ne(masteryRuns.id, row.id),
      )).get();
      if (activeDuplicate) throw new Error("MASTERY_RUN_CODE_CONFLICT");
    }
    const timestamp = now();
    const reason = input.reason?.trim() || null;
    await database.batch([
      database.prepare("UPDATE mastery_runs SET status = ?, invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ?").bind(nextStatus, nextStatus === "invalidated" ? timestamp : null, nextStatus === "invalidated" ? actor.actorId : null, nextStatus === "invalidated" ? reason : null, row.id),
      database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), row.id, nextStatus === "invalidated" ? "invalidated" : "restored", actor.actorType, actor.actorId, reason, timestamp),
      masteryRunOutcomeStatusStatement({ run: row, status: nextStatus === "invalidated" ? "invalidated" : "created", timestamp }),
    ]);
    return asVerifiedMasteryRun((await db.select().from(masteryRuns).where(eq(masteryRuns.id, row.id)).get())!);
  };

  type MasterySubmissionOutcomeStatus = "created" | "reused" | "ineligible" | "conflict" | "invalidated";
  type MasterySubmissionOutcome = {
    status: MasterySubmissionOutcomeStatus;
    masteryRunId: string | null;
    awardedXp: number;
    reason: string | null;
    conflictFields: MasteryRunConflictField[];
  };
  const masterySubmissionOutcomeStatuses = new Set<MasterySubmissionOutcomeStatus>(["created", "reused", "ineligible", "conflict", "invalidated"]);
  const masteryConflictFieldSet = new Set<MasteryRunConflictField>(["run_code", "map", "gameplay_revision", "map_variant", "difficulty", "game_version", "completion_duration", "deaths", "skips", "event_counters"]);

  const parseMasteryOutcomeDetails = (value: string) => {
    try {
      const details = JSON.parse(value) as { reason?: unknown; conflictFields?: unknown };
      return {
        reason: typeof details.reason === "string" ? details.reason : null,
        conflictFields: Array.isArray(details.conflictFields)
          ? details.conflictFields.filter((field): field is MasteryRunConflictField => typeof field === "string" && masteryConflictFieldSet.has(field as MasteryRunConflictField))
          : [],
      };
    } catch {
      return { reason: null, conflictFields: [] as MasteryRunConflictField[] };
    }
  };

  const asMasterySubmissionOutcome = (row: typeof submissionOutcomes.$inferSelect): MasterySubmissionOutcome => {
    if (row.outcomeType !== "mastery_run" || !masterySubmissionOutcomeStatuses.has(row.status as MasterySubmissionOutcomeStatus)) throw new Error("SUBMISSION_OUTCOME_DATA_INVALID");
    const details = parseMasteryOutcomeDetails(row.detailsJson);
    return {
      status: row.status as MasterySubmissionOutcomeStatus,
      masteryRunId: row.entityId,
      awardedXp: row.awardedXp,
      ...details,
    };
  };

  const loadMasterySubmissionOutcome = async (submissionId: string) => {
    const row = await db.select().from(submissionOutcomes).where(and(eq(submissionOutcomes.submissionId, submissionId), eq(submissionOutcomes.outcomeKey, "mastery_run"))).get();
    return row ? asMasterySubmissionOutcome(row) : null;
  };

  const loadMasterySubmissionOutcomes = async (submissionIds: string[]) => {
    if (!submissionIds.length) return new globalThis.Map<string, MasterySubmissionOutcome>();
    const rows = await db.select().from(submissionOutcomes).where(and(inArray(submissionOutcomes.submissionId, submissionIds), eq(submissionOutcomes.outcomeKey, "mastery_run")));
    return new globalThis.Map(rows.map((row) => [row.submissionId, asMasterySubmissionOutcome(row)]));
  };

  const playerMasterySubmissionOutcome = (outcome: MasterySubmissionOutcome) => outcome.status === "conflict"
    ? null
    : { status: outcome.status, awardedXp: outcome.status === "created" ? outcome.awardedXp : 0 };

  const playerMasterySubmissionOutcomeFields = (outcome: MasterySubmissionOutcome | null | undefined) => {
    const safeOutcome = outcome ? playerMasterySubmissionOutcome(outcome) : null;
    return safeOutcome ? { masteryOutcome: safeOutcome } : {};
  };

  const masterySubmissionOutcomeStatement = (submissionId: string, outcome: MasterySubmissionOutcome) => {
    const timestamp = now();
    return database.prepare("INSERT INTO submission_outcomes (id, submission_id, outcome_key, outcome_type, status, entity_id, awarded_xp, details_json, created_at, updated_at) VALUES (?, ?, 'mastery_run', 'mastery_run', ?, ?, ?, ?, ?, ?) ON CONFLICT(submission_id, outcome_key) DO UPDATE SET status = excluded.status, entity_id = excluded.entity_id, awarded_xp = excluded.awarded_xp, details_json = excluded.details_json, updated_at = excluded.updated_at")
      .bind(crypto.randomUUID(), submissionId, outcome.status, outcome.masteryRunId, outcome.awardedXp, JSON.stringify({ reason: outcome.reason, conflictFields: outcome.conflictFields }), timestamp, timestamp);
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

  const existingMasteryOutcome = (outcome: MasterySubmissionOutcome) => ({ ...outcome, conflictFields: [...outcome.conflictFields] });

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
      const projection = await resolveLegacyProjection(row.challengeId, row.targetMapId, snapshotGameplayRevisionId(row));
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

  const persistSubmissionGameplayRevision = async (submissionId: string, gameplayRevisionId: string) => {
    await db.update(submissions).set({ gameplayRevisionId }).where(and(
      eq(submissions.id, submissionId),
      isNull(submissions.gameplayRevisionId),
    ));
    return db.select({ gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions).where(eq(submissions.id, submissionId)).get();
  };

  const resolveMasterySubmissionOutcome = async (
    row: typeof submissions.$inferSelect,
    response: OcrResponse,
    acceptanceSource: "submission_automatic" | "submission_review",
  ): Promise<MasterySubmissionOutcome> => {
    const existing = await loadMasterySubmissionOutcome(row.id);
    const evidence = assessMasteryOcrEvidence(response, masteryEvidenceCompatibility);
    if (evidence.outcome === "ineligible") {
      if (existing && ["created", "reused", "invalidated"].includes(existing.status)) return existingMasteryOutcome(existing);
      return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: evidence.reason, conflictFields: [] };
    }

    const requiredMapVariant = await requiredMasteryMapVariant(row);
    if (requiredMapVariant === "classic" && evidence.mapVariant !== requiredMapVariant) {
      return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: "required_map_variant_mismatch", conflictFields: [] };
    }

    const owner = await db.select({ playerAccountId: playerAccounts.id, playerName: playerAccounts.playerName }).from(bindings)
      .innerJoin(playerAccounts, eq(bindings.playerAccountId, playerAccounts.id))
      .where(and(eq(bindings.id, row.bindingId), eq(bindings.status, "active"), eq(playerAccounts.status, "active"))).get();
    if (!owner) {
      if (existing && ["created", "reused", "invalidated"].includes(existing.status)) return existingMasteryOutcome(existing);
      return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: "binding_not_active", conflictFields: [] };
    }
    if (normalizedOcrLabel(evidence.viewerPlayer).split("#")[0] !== normalizedOcrLabel(owner.playerName).split("#")[0]) {
      return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: "viewer_player_mismatch", conflictFields: [] };
    }

    const matchingMaps = (await db.select().from(maps).where(eq(maps.status, "active")))
      .filter((map) => normalizedOcrLabel(map.name) === normalizedOcrLabel(evidence.mapName));
    if (matchingMaps.length !== 1) return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: matchingMaps.length ? "ambiguous_map" : "canonical_map_not_found", conflictFields: [] };
    if (row.targetMapId && row.targetMapId !== matchingMaps[0].id) return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: "submission_map_mismatch", conflictFields: [] };

    const revision = await resolveMasteryGameplayRevision({
      mapId: matchingMaps[0].id,
      mapVariant: evidence.mapVariant,
      gameplayRevisionId: snapshotGameplayRevisionId(row),
    });
    if (!revision) return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: "gameplay_revision_not_found", conflictFields: [] };
    if (!row.gameplayRevisionId) {
      const persisted = await persistSubmissionGameplayRevision(row.id, revision.id);
      if (persisted?.gameplayRevisionId !== revision.id) return { status: "ineligible", masteryRunId: null, awardedXp: 0, reason: "submission_revision_mismatch", conflictFields: [] };
    }

    const recorded = await recordVerifiedMasteryRun({
      playerAccountId: owner.playerAccountId,
      sourceSubmissionId: row.id,
      mapId: matchingMaps[0].id,
      gameplayRevisionId: revision.id,
      mapVariant: evidence.mapVariant,
      difficulty: evidence.difficulty,
      gameVersion: evidence.gameVersion,
      runCode: evidence.runCode,
      completionDurationSeconds: evidence.completionDurationSeconds,
      deaths: evidence.deaths,
      skips: evidence.skips,
      eventCounters: {},
      acceptanceSource,
    });
    if (recorded.outcome === "conflict") {
      return { status: "conflict", masteryRunId: recorded.run.runId, awardedXp: 0, reason: "conflicting_run_code_evidence", conflictFields: recorded.conflictFields };
    }
    if (recorded.run.status === "invalidated") {
      if (existing?.status === "invalidated" && recorded.run.sourceSubmissionId === row.id) {
        const restored = await transitionVerifiedMasteryRun({ masteryRunId: recorded.run.runId, reason: "OCR evidence revalidated" }, { actorType: "service", actorId: acceptanceSource }, "active");
        return { status: "created", masteryRunId: restored.runId, awardedXp: restored.awardedXp, reason: null, conflictFields: [] };
      }
      return { status: "invalidated", masteryRunId: recorded.run.runId, awardedXp: 0, reason: existing?.reason ?? "mastery_run_invalidated", conflictFields: [] };
    }

    const sourceOwnsRun = recorded.run.sourceSubmissionId === row.id;
    const status: MasterySubmissionOutcomeStatus = recorded.outcome === "created" || sourceOwnsRun ? "created" : "reused";
    return {
      status,
      masteryRunId: recorded.run.runId,
      awardedXp: status === "created" ? recorded.run.awardedXp : 0,
      reason: status === "reused" ? "same_player_run_code" : null,
      conflictFields: [],
    };
  };

  type AdminSubmissionChallenge =
    | { family: "map"; name: string; mapName: string; difficulty: string | null; mapVariant?: "classic" }
    | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string; mapVariant?: "classic" };

  const resolveAdminSubmissionDetails = async (submissionRows: Array<typeof submissions.$inferSelect>) => {
    const mapChallengeIds = submissionRows.filter((row) => row.challengeType !== "title_achievement" && row.challengeId).map((row) => row.challengeId!);
    const titleChallengeIds = submissionRows.filter((row) => row.challengeType === "title_achievement" && row.challengeId).map((row) => row.challengeId!);
    const snapshots = submissionRows.flatMap((row) => {
      if (!row.ruleSnapshotJson || !row.challengeId) return [];
      try { return [{ challengeId: row.challengeId, snapshot: JSON.parse(row.ruleSnapshotJson) as MapTitleRuleSnapshot }]; } catch { return []; }
    });
    const snapshotTitleKeys = [...new Set(snapshots.map(({ snapshot }) => snapshot.titleKey))];
    const submissionIds = submissionRows.map((row) => row.id);
    const bindingIds = [...new Set(submissionRows.map((row) => row.bindingId))];
    const [mapRows, titleRows, snapshotTitleRows, ocrRows, spotCheckRows, bindingRows, masteryOutcomes] = await Promise.all([
      mapChallengeIds.length ? db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(inArray(achievementChallenges.id, mapChallengeIds)) : [],
      titleChallengeIds.length ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(inArray(titleChallenges.id, titleChallengeIds)) : [],
      snapshotTitleKeys.length ? db.select().from(titleCatalog).where(inArray(titleCatalog.key, snapshotTitleKeys)) : [],
      submissionIds.length ? db.select().from(ocrResults).where(inArray(ocrResults.submissionId, submissionIds)).orderBy(desc(ocrResults.createdAt)) : [],
      submissionIds.length ? db.select().from(submissionSpotChecks).where(inArray(submissionSpotChecks.submissionId, submissionIds)) : [],
      bindingIds.length ? db.select({ id: bindings.id, playerAccountId: bindings.playerAccountId }).from(bindings).where(inArray(bindings.id, bindingIds)) : [],
      loadMasterySubmissionOutcomes(submissionIds),
    ]);
    const challenges = new Map<string, AdminSubmissionChallenge>();
    const latestOcr = new Map<string, typeof ocrResults.$inferSelect>();
    for (const { challenge, map } of mapRows) challenges.set(challenge.id, { family: "map", name: challenge.name, mapName: map.name, difficulty: challenge.difficulty ?? "", ...(challenge.type === "classic_completion" ? { mapVariant: "classic" as const } : {}) });
    for (const { challenge, title } of titleRows) challenges.set(challenge.id, { family: "achievement", titleName: title.label, category: challenge.categoryOverride ?? title.category, condition: challenge.condition, evidenceRule: challenge.evidenceRule, ...(challenge.mapVariant ? { mapVariant: challenge.mapVariant as "classic" } : {}) });
    const snapshotTitlesByKey = new Map(snapshotTitleRows.map((title) => [title.key, title]));
    for (const { challengeId, snapshot } of snapshots) {
      const title = snapshotTitlesByKey.get(snapshot.titleKey);
      if (title) challenges.set(challengeId, { family: "achievement", titleName: title.label, category: title.category, condition: snapshot.condition, evidenceRule: snapshot.evidenceRule, ...(snapshot.mapVariant ? { mapVariant: snapshot.mapVariant } : {}) });
    }
    for (const result of ocrRows) if (!latestOcr.has(result.submissionId)) latestOcr.set(result.submissionId, result);
    return { challenges, latestOcr, spotChecks: new Map(spotCheckRows.map((spotCheck) => [spotCheck.submissionId, spotCheck])), playerAccountByBinding: new Map(bindingRows.map((binding) => [binding.id, binding.playerAccountId])), masteryOutcomes };
  };

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
      playerAccountId: details.playerAccountByBinding.get(row.bindingId) ?? "",
      playerName: row.playerName ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ocrStatus: (ocr?.status ?? (row.status === "ocr_pending" ? "pending" : "not_started")) as never,
      ocrAttempt: ocr?.attempt ?? null,
      ocrErrorCode: ocr?.errorCode ?? null,
      ocr: ocr?.responseJson ? JSON.parse(ocr.responseJson) : null,
      match,
      reason: row.reviewReason,
      evidenceUrl: `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence`,
      spotCheck: details.spotChecks.get(row.id) ? { status: details.spotChecks.get(row.id)!.status as "pending" | "confirmed" | "revoked", sampledAt: details.spotChecks.get(row.id)!.sampledAt, resolvedAt: details.spotChecks.get(row.id)!.resolvedAt, reviewer: details.spotChecks.get(row.id)!.reviewer, reason: details.spotChecks.get(row.id)!.reason } : null,
      ...(details.masteryOutcomes.get(row.id) ? { masteryOutcome: details.masteryOutcomes.get(row.id)! } : {}),
    };
  };

  const loadAdminSubmission = async (row: typeof submissions.$inferSelect) => {
    const [details, attachment] = await Promise.all([
      resolveAdminSubmissionDetails([row]),
      db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, row.id)).orderBy(desc(attachments.createdAt)).limit(1).get(),
    ]);
    return { ...asAdminSubmission(row, details), evidenceUrl: publicEvidenceUrl(attachment?.objectKey) ?? `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence` };
  };

  const countMasteryRunConflicts = async (runIds: string[]) => {
    if (!runIds.length) return new globalThis.Map<string, number>();
    const rows = await db.select({ masteryRunId: submissionOutcomes.entityId }).from(submissionOutcomes).where(and(
      eq(submissionOutcomes.outcomeType, "mastery_run"),
      eq(submissionOutcomes.status, "conflict"),
      inArray(submissionOutcomes.entityId, runIds),
    ));
    const counts = new globalThis.Map<string, number>();
    for (const row of rows) if (row.masteryRunId) counts.set(row.masteryRunId, (counts.get(row.masteryRunId) ?? 0) + 1);
    return counts;
  };

  type AdminMasteryRunJoin = {
    run: typeof masteryRuns.$inferSelect;
    player: typeof playerAccounts.$inferSelect;
    map: typeof maps.$inferSelect;
    revision: typeof gameplayRevisions.$inferSelect;
  };

  const asAdminMasteryRun = (row: AdminMasteryRunJoin, conflictCount: number): AdminMasteryRun => {
    const run = asVerifiedMasteryRun(row.run);
    return {
      runId: run.runId,
      playerAccountId: run.playerAccountId,
      playerId: row.player.playerId,
      playerName: row.player.playerName,
      sourceSubmissionId: run.sourceSubmissionId,
      mapId: run.mapId,
      mapName: row.map.name,
      gameplayRevisionId: run.gameplayRevisionId,
      gameplayRevisionLifecycle: masteryRevisionLifecycle(row.revision.lifecycle),
      mapVariant: run.mapVariant,
      difficulty: run.difficulty,
      gameVersion: run.gameVersion,
      runCode: run.runCode,
      completionDurationSeconds: run.completionDurationSeconds,
      deaths: run.deaths,
      skips: run.skips,
      eventCounters: run.eventCounters,
      acceptanceSource: run.acceptanceSource,
      acceptedAt: run.acceptedAt,
      status: run.status,
      invalidatedAt: run.invalidatedAt,
      invalidatedBy: run.invalidatedBy,
      invalidationReason: run.invalidationReason,
      xpRuleVersion: run.xpRuleVersion as "v1",
      xpInputSnapshot: run.xpInputSnapshot,
      awardedXp: run.awardedXp,
      conflictCount,
    };
  };

  const loadAdminMasteryRun = async (masteryRunId: string) => {
    const row = await db.select({ run: masteryRuns, player: playerAccounts, map: maps, revision: gameplayRevisions }).from(masteryRuns)
      .innerJoin(playerAccounts, eq(masteryRuns.playerAccountId, playerAccounts.id))
      .innerJoin(maps, eq(masteryRuns.mapId, maps.id))
      .innerJoin(gameplayRevisions, eq(masteryRuns.gameplayRevisionId, gameplayRevisions.id))
      .where(eq(masteryRuns.id, masteryRunId)).get();
    if (!row) return null;
    const conflictCounts = await countMasteryRunConflicts([row.run.id]);
    return { row, view: asAdminMasteryRun(row, conflictCounts.get(row.run.id) ?? 0) };
  };

  const adminMasteryProjection = async (input: { playerAccountId: string; mapId: string; gameplayRevisionId: string }): Promise<AdminMasteryRunProjection> => {
    const profile = (await activeMasteryProfiles({ playerAccountId: input.playerAccountId, mapId: input.mapId, gameplayRevisionId: input.gameplayRevisionId, recentLimit: 10 }))[0];
    if (!profile) {
      return {
        mapId: input.mapId,
        gameplayRevisionId: input.gameplayRevisionId,
        totalXp: 0,
        verifiedRunCount: 0,
        difficultyStats: [],
        lowestDeaths: null,
        fewestSkips: null,
        highestSingleRunXp: null,
        highestCompletedDifficulty: null,
      };
    }
    return {
      mapId: profile.mapId,
      gameplayRevisionId: profile.gameplayRevisionId,
      totalXp: profile.totalXp,
      verifiedRunCount: profile.verifiedRunCount,
      difficultyStats: profile.difficultyStats,
      lowestDeaths: profile.lowestDeaths,
      fewestSkips: profile.fewestSkips,
      highestSingleRunXp: profile.highestSingleRunXp,
      highestCompletedDifficulty: profile.highestCompletedDifficulty,
    };
  };

  const masteryConflictFacts = (responseJson: string | null): AdminMasteryRunConflict["facts"] => {
    let data: OcrResponse["data"] | undefined;
    try {
      const parsed = responseJson ? JSON.parse(responseJson) as OcrResponse : null;
      data = parsed?.data;
    } catch {
      data = undefined;
    }
    const asText = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
    const asCount = (value: unknown, positive = false) => typeof value === "number" && Number.isInteger(value) && (positive ? value > 0 : value >= 0) ? value : null;
    const normalizedDifficulty = normalizedOcrDifficulty(data?.difficulty);
    let runCode: string | null = null;
    try { runCode = normalizeMasteryRunCode(asText(data?.run_code) ?? ""); } catch { runCode = null; }
    return {
      mapName: asText(data?.map_name),
      mapVariant: data?.map_variant === "classic" ? "classic" : null,
      difficulty: masteryDifficulties.includes(normalizedDifficulty as MasteryDifficulty) ? normalizedDifficulty as MasteryDifficulty : null,
      gameVersion: asText(data?.version),
      runCode,
      completionDurationSeconds: asCount(data?.duration_seconds, true),
      deaths: asCount(data?.deaths),
      skips: asCount(data?.skips),
    };
  };

  const listAdminMasteryRunConflicts = async (masteryRunId: string): Promise<AdminMasteryRunConflict[]> => {
    const rows = await db.select({ outcome: submissionOutcomes, submission: submissions, player: playerAccounts }).from(submissionOutcomes)
      .innerJoin(submissions, eq(submissionOutcomes.submissionId, submissions.id))
      .innerJoin(bindings, eq(submissions.bindingId, bindings.id))
      .innerJoin(playerAccounts, eq(bindings.playerAccountId, playerAccounts.id))
      .where(and(eq(submissionOutcomes.outcomeType, "mastery_run"), eq(submissionOutcomes.status, "conflict"), eq(submissionOutcomes.entityId, masteryRunId)))
      .orderBy(desc(submissionOutcomes.updatedAt));
    if (!rows.length) return [];
    const submissionIds = rows.map(({ submission }) => submission.id);
    const [ocrRows, resolutions] = await Promise.all([
      db.select().from(ocrResults).where(inArray(ocrResults.submissionId, submissionIds)).orderBy(desc(ocrResults.createdAt)),
      db.select().from(masteryRunConflictResolutions).where(eq(masteryRunConflictResolutions.masteryRunId, masteryRunId)),
    ]);
    const latestOcr = new globalThis.Map<string, typeof ocrResults.$inferSelect>();
    for (const row of ocrRows) if (!latestOcr.has(row.submissionId)) latestOcr.set(row.submissionId, row);
    const resolutionBySubmission = new globalThis.Map(resolutions.map((resolution) => [resolution.conflictSubmissionId, resolution]));
    return rows.map(({ outcome, submission, player }) => {
      const outcomeDetail = asMasterySubmissionOutcome(outcome);
      const resolution = resolutionBySubmission.get(submission.id);
      return {
        submissionId: submission.id,
        submissionStatus: submission.status as AdminMasteryRunConflict["submissionStatus"],
        playerAccountId: player.id,
        playerName: player.playerName,
        conflictFields: outcomeDetail.conflictFields,
        facts: masteryConflictFacts(latestOcr.get(submission.id)?.responseJson ?? null),
        resolution: resolution ? {
          action: resolution.action as "keep_existing" | "invalidate_existing",
          actorType: resolution.actorType as "service" | "user",
          actorId: resolution.actorId,
          reason: resolution.reason,
          resolvedAt: resolution.resolvedAt,
        } : null,
      };
    });
  };

  const masteryRunOutcomeStatusStatement = (input: { run: typeof masteryRuns.$inferSelect; status: "created" | "invalidated"; timestamp: number }) => database.prepare(
    "UPDATE submission_outcomes SET status = ?, updated_at = ? WHERE submission_id = ? AND outcome_key = 'mastery_run' AND entity_id = ? AND status IN ('created', 'invalidated')"
  ).bind(input.status, input.timestamp, input.run.sourceSubmissionId, input.run.id);

  const transitionAdminMasteryRunState = async (input: { masteryRunId: string; action: "invalidate" | "restore"; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminMasteryRunStateResponse> => {
    const operation = input.action === "invalidate" ? "mastery_run.invalidate" : "mastery_run.restore";
    const replay = await replayOrConflict<AdminMasteryRunStateResponse>(db, auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const loaded = await loadAdminMasteryRun(input.masteryRunId);
    if (!loaded) throw new Error("MASTERY_RUN_NOT_FOUND");
    const nextStatus = input.action === "invalidate" ? "invalidated" : "active";
    if (loaded.row.run.status !== nextStatus) {
      if (nextStatus === "active") {
        const activeDuplicate = await db.select({ id: masteryRuns.id }).from(masteryRuns).where(and(
          eq(masteryRuns.playerAccountId, loaded.row.run.playerAccountId),
          eq(masteryRuns.runCode, loaded.row.run.runCode),
          eq(masteryRuns.status, "active"),
          ne(masteryRuns.id, loaded.row.run.id),
        )).get();
        if (activeDuplicate) throw new Error("MASTERY_RUN_CODE_CONFLICT");
      }
      const timestamp = now();
      const reason = input.reason?.trim() || null;
      await database.batch([
        database.prepare("UPDATE mastery_runs SET status = ?, invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ?").bind(nextStatus, nextStatus === "invalidated" ? timestamp : null, nextStatus === "invalidated" ? auth.subject : null, nextStatus === "invalidated" ? reason : null, loaded.row.run.id),
        database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), loaded.row.run.id, nextStatus === "invalidated" ? "invalidated" : "restored", auth.actorType, auth.subject, reason, timestamp),
        masteryRunOutcomeStatusStatement({ run: loaded.row.run, status: nextStatus === "invalidated" ? "invalidated" : "created", timestamp }),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'mastery_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, loaded.row.run.id, JSON.stringify({ playerAccountId: loaded.row.run.playerAccountId, sourceSubmissionId: loaded.row.run.sourceSubmissionId, previousStatus: loaded.row.run.status, status: nextStatus, reason }), timestamp),
      ]);
    }
    const updated = await loadAdminMasteryRun(input.masteryRunId);
    if (!updated) throw new Error("MASTERY_RUN_NOT_FOUND");
    const response: AdminMasteryRunStateResponse = {
      contractVersion: "1",
      run: updated.view,
      projection: await adminMasteryProjection({ playerAccountId: updated.row.run.playerAccountId, mapId: updated.row.run.mapId, gameplayRevisionId: updated.row.run.gameplayRevisionId }),
    };
    await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
    return response;
  };

  const resolveAdminMasteryRunConflictAction = async (input: { masteryRunId: string; submissionId: string; action: "keep_existing" | "invalidate_existing"; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminMasteryRunConflictResolutionResponse> => {
    const operation = "mastery_run.conflict.resolve";
    const replay = await replayOrConflict<AdminMasteryRunConflictResolutionResponse>(db, auth.subject, operation, idempotencyKey, input);
    if (replay) return replay;
    const loaded = await loadAdminMasteryRun(input.masteryRunId);
    if (!loaded) throw new Error("MASTERY_RUN_NOT_FOUND");
    const conflict = await db.select({ id: submissionOutcomes.id }).from(submissionOutcomes).where(and(
      eq(submissionOutcomes.submissionId, input.submissionId),
      eq(submissionOutcomes.outcomeKey, "mastery_run"),
      eq(submissionOutcomes.status, "conflict"),
      eq(submissionOutcomes.entityId, loaded.row.run.id),
    )).get();
    if (!conflict) throw new Error("MASTERY_RUN_CONFLICT_NOT_FOUND");
    const timestamp = now();
    const reason = input.reason?.trim() || null;
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT INTO mastery_run_conflict_resolutions (id, mastery_run_id, conflict_submission_id, action, actor_type, actor_id, reason, resolved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(mastery_run_id, conflict_submission_id) DO UPDATE SET action = excluded.action, actor_type = excluded.actor_type, actor_id = excluded.actor_id, reason = excluded.reason, resolved_at = excluded.resolved_at").bind(crypto.randomUUID(), loaded.row.run.id, input.submissionId, input.action, auth.actorType, auth.subject, reason, timestamp),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'mastery_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, operation, loaded.row.run.id, JSON.stringify({ conflictSubmissionId: input.submissionId, sourceSubmissionId: loaded.row.run.sourceSubmissionId, action: input.action, reason }), timestamp),
    ];
    if (input.action === "invalidate_existing" && loaded.row.run.status === "active") {
      statements.unshift(
        database.prepare("UPDATE mastery_runs SET status = 'invalidated', invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ? AND status = 'active'").bind(timestamp, auth.subject, reason, loaded.row.run.id),
        database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, 'invalidated', ?, ?, ?, ?)").bind(crypto.randomUUID(), loaded.row.run.id, auth.actorType, auth.subject, reason, timestamp),
        masteryRunOutcomeStatusStatement({ run: loaded.row.run, status: "invalidated", timestamp }),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'mastery_run.invalidate', 'mastery_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, loaded.row.run.id, JSON.stringify({ playerAccountId: loaded.row.run.playerAccountId, sourceSubmissionId: loaded.row.run.sourceSubmissionId, previousStatus: "active", status: "invalidated", reason, resolutionSubmissionId: input.submissionId }), timestamp),
      );
    }
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
    const updated = await loadAdminMasteryRun(input.masteryRunId);
    if (!updated) throw new Error("MASTERY_RUN_NOT_FOUND");
    const response: AdminMasteryRunConflictResolutionResponse = {
      contractVersion: "1",
      action: input.action,
      run: updated.view,
      projection: await adminMasteryProjection({ playerAccountId: updated.row.run.playerAccountId, mapId: updated.row.run.mapId, gameplayRevisionId: updated.row.run.gameplayRevisionId }),
    };
    await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
    return response;
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
    masteryOutcome?: MasterySubmissionOutcome;
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
      `UPDATE submissions SET status = ?, review_reason = ?, ocr_fail_count = ocr_fail_count + ?, rule_snapshot_json = COALESCE(?, rule_snapshot_json), updated_at = ? WHERE id = ? AND ${input.allowExistingStatus ? "status = 'ocr_pending'" : "status = 'ocr_pending'"}`
    ).bind(input.nextStatus, input.reviewReason, input.incrementFailCount ? 1 : 0, input.ruleSnapshotJson ?? null, timestamp, input.submissionId);
    await database.batch(input.masteryOutcome ? [resultInsert, submissionUpdate, masterySubmissionOutcomeStatement(input.submissionId, input.masteryOutcome)] : [resultInsert, submissionUpdate]);
  };

  const shouldSampleAutomaticDecision = async (submissionId: string) => {
    if (ocrAutoReviewSampleRate <= 0) return false;
    const digest = await hashRequest({ submissionId, policy: "ocr-auto-v1" });
    return Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff < ocrAutoReviewSampleRate;
  };

  const automaticSnapshot = async (candidate: Awaited<ReturnType<typeof matchOcrAgainstChallenges>>["exact"][number]): Promise<MapTitleRuleSnapshot | null> => {
    if (candidate.challenge.family === "map") {
      if (candidate.challenge.mapTitleRule) return resolveMapTitleProjection(candidate.challenge.mapTitleRule.ruleId, candidate.challenge.mapId, candidate.challenge.gameplayRevisionId);
      const titleChallenge = await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(eq(titleChallenges.id, candidate.challenge.challengeId))
        .get();
      if (titleChallenge) return snapshotTitleChallenge(titleChallenge.challenge, titleChallenge.title, candidate.challenge.mapId, candidate.challenge.gameplayRevisionId);
      const mapChallenge = await db.select({ challenge: achievementChallenges, title: titleCatalog })
        .from(achievementChallenges)
        .innerJoin(titleCatalog, eq(achievementChallenges.rewardTitleKey, titleCatalog.key))
        .where(eq(achievementChallenges.id, candidate.challenge.challengeId))
        .get();
      return mapChallenge ? snapshotMapChallenge(mapChallenge.challenge, mapChallenge.title, candidate.challenge.gameplayRevisionId) : null;
    }
    return {
      challengeId: candidate.challenge.challengeId,
      challengeType: candidate.challengeType,
      ruleId: `challenge:${candidate.challenge.challengeId}`,
      ruleRevision: now(),
      mapId: null,
      gameplayRevisionId: null,
      titleKey: candidate.challenge.titleKey,
      mapVariant: null,
      slot: null,
      displayKind: "fixed",
      condition: candidate.challenge.condition,
      evidenceRule: candidate.challenge.evidenceRule,
      submissionMode: candidate.challenge.submissionMode ?? "manual",
      defaultScope: candidate.challenge.scope ?? "global",
      exceptionId: null,
    };
  };

  const persistAutomaticDecision = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    responseJson: string;
    matchJson: string;
    grants: Array<{ snapshot: MapTitleRuleSnapshot; titleKey: string; mapId: string | null; slot: string | null; alreadyOwned: boolean; existingGrantId: string | null }>;
    sample: boolean;
    masteryOutcome?: MasterySubmissionOutcome;
  }) => {
    const timestamp = now();
    const reviewId = crypto.randomUUID();
    const spotCheckId = crypto.randomUUID();
    const grants = input.grants.map((grant) => ({ ...grant, grantId: crypto.randomUUID() }));
    const primaryGrant = grants[0];
    if (!primaryGrant) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
    if (grants.some((grant) => grant.mapId !== null && !grant.snapshot.gameplayRevisionId)) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
    const submission = await db.select({ gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions).where(eq(submissions.id, input.submissionId)).get();
    if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
    if (grants.some((grant) => grant.snapshot.gameplayRevisionId && submission.gameplayRevisionId && grant.snapshot.gameplayRevisionId !== submission.gameplayRevisionId)) throw new Error("SUBMISSION_REVISION_MISMATCH");
    const grantId = primaryGrant.grantId;
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, 'matched', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.responseJson, input.matchJson, timestamp, input.submissionId),
      database.prepare("INSERT OR IGNORE INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, ?, 'approved', NULL, 'system:ocr', ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(reviewId, input.submissionId, timestamp, input.submissionId),
    ];
    for (const grant of grants) {
      statements.push(
        database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) SELECT ?, b.player_account_id, ?, ?, ?, ?, 'active', 'automatic', s.id, 'system:ocr', ? FROM submissions s INNER JOIN bindings b ON b.id = s.binding_id WHERE s.id = ? AND s.status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(grant.grantId, grant.titleKey, grant.mapId, grant.snapshot.gameplayRevisionId, grant.slot, timestamp, input.submissionId, reviewId),
      );
    }
    statements.push(
      database.prepare("UPDATE submissions SET status = 'approved', review_reason = NULL, gameplay_revision_id = COALESCE(gameplay_revision_id, ?), grant_id = (SELECT g.id FROM player_title_grants g INNER JOIN bindings b ON b.player_account_id = g.player_account_id WHERE b.id = submissions.binding_id AND g.title_key = ? AND g.status = 'active' AND (g.map_id = ? OR (g.map_id IS NULL AND ? IS NULL)) AND (g.gameplay_revision_id = ? OR (g.gameplay_revision_id IS NULL AND ? IS NULL))), rule_snapshot_json = ?, updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(primaryGrant.snapshot.gameplayRevisionId, primaryGrant.titleKey, primaryGrant.mapId, primaryGrant.mapId, primaryGrant.snapshot.gameplayRevisionId, primaryGrant.snapshot.gameplayRevisionId, JSON.stringify(primaryGrant.snapshot), timestamp, input.submissionId, reviewId),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_review', 'submission', id, ?, ? FROM submissions WHERE id = ? AND status = 'approved' AND grant_id IS NOT NULL").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ requestId: input.requestId, attempt: input.attempt, decision: "approved", grants: grants.map(({ titleKey, mapId, slot, alreadyOwned }) => ({ titleKey, mapId, slot, alreadyOwned })), match: JSON.parse(input.matchJson), ruleSnapshot: primaryGrant.snapshot }), timestamp, input.submissionId),
    );
    if (input.masteryOutcome) statements.push(masterySubmissionOutcomeStatement(input.submissionId, input.masteryOutcome));
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
      if (grant.snapshot.challengeId) {
        statements.push(
          approvedSubmissionOutcomeStatement({
            submissionId: input.submissionId,
            outcomeKey: `challenge:${grant.snapshot.challengeId}:${grant.mapId ?? ""}:${grant.snapshot.gameplayRevisionId ?? ""}`,
            outcomeType: "challenge",
            status: "created",
            entityId: grant.snapshot.challengeId,
            details: { mapId: grant.mapId, gameplayRevisionId: grant.snapshot.gameplayRevisionId },
          }),
        );
      }
    }
    for (const grant of grants) {
      statements.push(
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_grant', 'player_title_grant', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved') AND EXISTS (SELECT 1 FROM player_title_grants WHERE id = ?)").bind(crypto.randomUUID(), input.requestId, grant.grantId, JSON.stringify({ submissionId: input.submissionId, sourceType: "automatic", sourceId: input.submissionId, titleKey: grant.titleKey, mapId: grant.mapId, gameplayRevisionId: grant.snapshot.gameplayRevisionId, alreadyOwned: grant.alreadyOwned, ruleSnapshot: grant.snapshot }), timestamp, input.submissionId, grant.grantId),
      );
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
    masteryOutcome: MasterySubmissionOutcome;
    sample: boolean;
  }) => {
    if (!["created", "reused"].includes(input.masteryOutcome.status)) throw new Error("MASTERY_OUTCOME_NOT_ACCEPTED");
    const timestamp = now();
    const reviewId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, 'matched', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.responseJson, input.matchJson, timestamp, input.submissionId),
      database.prepare("INSERT OR IGNORE INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, ?, 'approved', NULL, 'system:ocr', ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(reviewId, input.submissionId, timestamp, input.submissionId),
      database.prepare("UPDATE submissions SET status = 'approved', review_reason = NULL, grant_id = NULL, updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(timestamp, input.submissionId, reviewId),
      masterySubmissionOutcomeStatement(input.submissionId, input.masteryOutcome),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_mastery', 'submission', id, ?, ? FROM submissions WHERE id = ? AND status = 'approved' AND grant_id IS NULL").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ requestId: input.requestId, attempt: input.attempt, decision: "approved", masteryOutcome: { status: input.masteryOutcome.status, awardedXp: input.masteryOutcome.awardedXp } }), timestamp, input.submissionId),
    ];
    if (input.sample) statements.push(database.prepare("INSERT OR IGNORE INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) SELECT ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved')").bind(crypto.randomUUID(), input.submissionId, JSON.stringify({ version: "ocr-auto-v1", sampleRate: ocrAutoReviewSampleRate }), timestamp, input.submissionId));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  const getReviewSummaries = async (input: ReviewSummaryBatchInput): Promise<ReviewSummary[]> => {
    const targetIds = [...new Set(input.targetIds)];
    if (!targetIds.length || targetIds.length > 100) throw new Error("REVIEW_TARGET_BATCH_INVALID");
    const targetRows = input.targetType === "event"
      ? await db.select({ id: randomEvents.id }).from(randomEvents).where(inArray(randomEvents.id, targetIds))
      : await db.select({ id: maps.id }).from(maps).where(inArray(maps.id, targetIds));
    if (targetRows.length !== targetIds.length) throw new Error("REVIEW_TARGET_NOT_FOUND");
    const placeholders = targetIds.map(() => "?").join(", ");
    const aggregateResult = await database.prepare(`
      SELECT
        target_id,
        COUNT(*) AS review_count,
        AVG(rating) AS average_rating,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) AS rating_1,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) AS rating_2,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) AS rating_3,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) AS rating_4,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) AS rating_5
      FROM reviews
      WHERE target_type = ? AND target_id IN (${placeholders}) AND status = 'active'
      GROUP BY target_id
    `).bind(input.targetType, ...targetIds).all<{
      target_id: string;
      review_count: number;
      average_rating: number | null;
      rating_1: number | null;
      rating_2: number | null;
      rating_3: number | null;
      rating_4: number | null;
      rating_5: number | null;
    }>();
    const aggregates = new Map(aggregateResult.results.map((row) => [row.target_id, row]));
    return targetIds.map((targetId) => {
      const aggregate = aggregates.get(targetId);
      const reviewCount = Number(aggregate?.review_count ?? 0);
      return {
        targetType: input.targetType,
        targetId,
        averageRating: aggregate?.average_rating === null || aggregate?.average_rating === undefined ? null : Number(Number(aggregate.average_rating).toFixed(2)),
        reviewCount,
        ratingDistribution: {
          1: Number(aggregate?.rating_1 ?? 0),
          2: Number(aggregate?.rating_2 ?? 0),
          3: Number(aggregate?.rating_3 ?? 0),
          4: Number(aggregate?.rating_4 ?? 0),
          5: Number(aggregate?.rating_5 ?? 0),
        },
        sampleInsufficient: reviewCount < reviewSampleThreshold,
      };
    });
  };

  const recordVerifiedMasteryRun = async (input: VerifiedMasteryRunInput): Promise<RecordVerifiedMasteryRunResult> => {
    const candidate = prepareVerifiedMasteryRun(input);
    const source = await db.select({ playerAccountId: bindings.playerAccountId, gameplayRevisionId: submissions.gameplayRevisionId }).from(submissions)
      .innerJoin(bindings, eq(submissions.bindingId, bindings.id))
      .where(eq(submissions.id, candidate.sourceSubmissionId)).get();
    if (!source) throw new Error("MASTERY_SUBMISSION_NOT_FOUND");
    if (source.playerAccountId !== candidate.playerAccountId) throw new Error("MASTERY_SUBMISSION_PLAYER_MISMATCH");
    if (source.gameplayRevisionId && source.gameplayRevisionId !== candidate.gameplayRevisionId) throw new Error("MASTERY_SUBMISSION_REVISION_MISMATCH");
    const [player, map, revision] = await Promise.all([
      db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, candidate.playerAccountId)).get(),
      db.select({ id: maps.id }).from(maps).where(eq(maps.id, candidate.mapId)).get(),
      db.select({ id: gameplayRevisions.id, mapId: gameplayRevisions.mapId, legacyMapVariant: gameplayRevisions.legacyMapVariant }).from(gameplayRevisions).where(eq(gameplayRevisions.id, candidate.gameplayRevisionId)).get(),
    ]);
    if (!player) throw new Error("MASTERY_PLAYER_NOT_FOUND");
    if (!map) throw new Error("MASTERY_MAP_NOT_FOUND");
    if (!revision || revision.mapId !== candidate.mapId || (revision.legacyMapVariant ?? null) !== candidate.mapVariant) throw new Error("MASTERY_GAMEPLAY_REVISION_NOT_FOUND");

    const bySource = await db.select().from(masteryRuns).where(eq(masteryRuns.sourceSubmissionId, candidate.sourceSubmissionId)).get();
    if (bySource) {
      const run = asVerifiedMasteryRun(bySource);
      const conflictFields = masteryConflictFields(run, candidate);
      return conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run };
    }

    const activeByCode = await db.select().from(masteryRuns).where(and(
      eq(masteryRuns.playerAccountId, candidate.playerAccountId),
      eq(masteryRuns.runCode, candidate.runCode),
      eq(masteryRuns.status, "active"),
    )).get();
    if (activeByCode) {
      const run = asVerifiedMasteryRun(activeByCode);
      const conflictFields = masteryConflictFields(run, candidate);
      return conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run };
    }

    const award = calculateMasteryXpV1({
      difficulty: candidate.difficulty,
      mapFactor: candidate.mapFactor,
      deaths: candidate.deaths,
      skips: candidate.skips,
    });
    const runId = crypto.randomUUID();
    await database.batch([
      database.prepare("INSERT OR IGNORE INTO mastery_runs (id, player_account_id, source_submission_id, map_id, gameplay_revision_id, map_variant, difficulty, game_version, run_code, completion_duration_seconds, deaths, skips, event_counters_json, acceptance_source, accepted_at, status, xp_rule_version, xp_input_snapshot_json, awarded_xp, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)").bind(runId, candidate.playerAccountId, candidate.sourceSubmissionId, candidate.mapId, candidate.gameplayRevisionId, candidate.mapVariant, candidate.difficulty, candidate.gameVersion, candidate.runCode, candidate.completionDurationSeconds, candidate.deaths, candidate.skips, JSON.stringify(candidate.eventCounters), candidate.acceptanceSource, candidate.acceptedAt, award.snapshot.ruleVersion, JSON.stringify(award.snapshot), award.awardedXp, candidate.acceptedAt),
      database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) SELECT ?, ?, 'accepted', 'service', ?, NULL, ? WHERE EXISTS (SELECT 1 FROM mastery_runs WHERE id = ?)").bind(crypto.randomUUID(), runId, candidate.acceptanceSource, candidate.acceptedAt, runId),
    ]);
    const persistedBySource = await db.select().from(masteryRuns).where(eq(masteryRuns.sourceSubmissionId, candidate.sourceSubmissionId)).get();
    const persisted = persistedBySource ?? await db.select().from(masteryRuns).where(and(
      eq(masteryRuns.playerAccountId, candidate.playerAccountId),
      eq(masteryRuns.runCode, candidate.runCode),
      eq(masteryRuns.status, "active"),
    )).get();
    if (!persisted) throw new Error("MASTERY_RUN_PERSIST_FAILED");
    const run = asVerifiedMasteryRun(persisted);
    if (persisted.id === runId) return { outcome: "created", run };
    const conflictFields = masteryConflictFields(run, candidate);
    return conflictFields.length ? { outcome: "conflict", run, conflictFields } : { outcome: "reused", run };
  };

  return {
    dispatchPendingQqGroupPolicyEvents,
    recordVerifiedMasteryRun,

    async invalidateVerifiedMasteryRun(input, actor) {
      return transitionVerifiedMasteryRun(input, actor, "invalidated");
    },

    async restoreVerifiedMasteryRun(input, actor) {
      return transitionVerifiedMasteryRun(input, actor, "active");
    },

    async rebuildMasteryProfiles(input) {
      return activeMasteryProfiles(input);
    },

    async listAdminMasteryRuns(input: AdminMasteryRunQuery, _auth: AuthContext) {
      const condition = and(
        input.playerAccountId ? eq(masteryRuns.playerAccountId, input.playerAccountId) : undefined,
        input.mapId ? eq(masteryRuns.mapId, input.mapId) : undefined,
        input.gameplayRevisionId ? eq(masteryRuns.gameplayRevisionId, input.gameplayRevisionId) : undefined,
        input.difficulty ? eq(masteryRuns.difficulty, input.difficulty) : undefined,
        input.status ? eq(masteryRuns.status, input.status) : undefined,
        input.acceptanceSource ? eq(masteryRuns.acceptanceSource, input.acceptanceSource) : undefined,
        input.runCode ? eq(masteryRuns.runCode, input.runCode) : undefined,
        input.from !== undefined ? gte(masteryRuns.acceptedAt, input.from) : undefined,
        input.to !== undefined ? lte(masteryRuns.acceptedAt, input.to) : undefined,
      );
      const [rows, totalRows] = await Promise.all([
        db.select({ run: masteryRuns, player: playerAccounts, map: maps, revision: gameplayRevisions }).from(masteryRuns)
          .innerJoin(playerAccounts, eq(masteryRuns.playerAccountId, playerAccounts.id))
          .innerJoin(maps, eq(masteryRuns.mapId, maps.id))
          .innerJoin(gameplayRevisions, eq(masteryRuns.gameplayRevisionId, gameplayRevisions.id))
          .where(condition)
          .orderBy(desc(masteryRuns.acceptedAt), desc(masteryRuns.id))
          .limit(input.pageSize + 1)
          .offset((input.page - 1) * input.pageSize),
        db.select({ total: count() }).from(masteryRuns).where(condition),
      ]);
      const visibleRows = rows.slice(0, input.pageSize);
      const conflictCounts = await countMasteryRunConflicts(visibleRows.map(({ run }) => run.id));
      return {
        contractVersion: "1" as const,
        items: visibleRows.map((row) => asAdminMasteryRun(row, conflictCounts.get(row.run.id) ?? 0)),
        page: input.page,
        pageSize: input.pageSize,
        total: Number(totalRows[0]?.total ?? 0),
        hasMore: rows.length > input.pageSize,
      };
    },

    async getAdminMasteryRun(input, _auth: AuthContext): Promise<AdminMasteryRunDetailResponse> {
      const loaded = await loadAdminMasteryRun(input.masteryRunId);
      if (!loaded) throw new Error("MASTERY_RUN_NOT_FOUND");
      const sourceRow = await db.select().from(submissions).where(eq(submissions.id, loaded.row.run.sourceSubmissionId)).get();
      if (!sourceRow) throw new Error("MASTERY_SUBMISSION_NOT_FOUND");
      const [projection, sourceSubmission, lifecycle, conflicts] = await Promise.all([
        adminMasteryProjection({ playerAccountId: loaded.row.run.playerAccountId, mapId: loaded.row.run.mapId, gameplayRevisionId: loaded.row.run.gameplayRevisionId }),
        loadAdminSubmission(sourceRow),
        db.select().from(masteryRunLifecycleEvents).where(eq(masteryRunLifecycleEvents.masteryRunId, loaded.row.run.id)).orderBy(desc(masteryRunLifecycleEvents.createdAt)).limit(50),
        listAdminMasteryRunConflicts(loaded.row.run.id),
      ]);
      return {
        contractVersion: "1",
        run: loaded.view,
        projection,
        sourceSubmission,
        lifecycle: lifecycle.map((event) => ({
          transition: event.transition as "accepted" | "invalidated" | "restored",
          actorType: event.actorType as "service" | "user",
          actorId: event.actorId,
          reason: event.reason,
          createdAt: event.createdAt,
        })),
        conflicts,
      };
    },

    async transitionAdminMasteryRun(input, auth, idempotencyKey) {
      return transitionAdminMasteryRunState(input, auth, idempotencyKey);
    },

    async resolveAdminMasteryRunConflict(input, auth, idempotencyKey) {
      return resolveAdminMasteryRunConflictAction(input, auth, idempotencyKey);
    },

    async listAgentEvents(input: AgentEventQuery) {
      const events = await this.listRandomEvents({ category: input.category, rarity: input.rarity });
      const query = input.query?.toLocaleLowerCase();
      const filtered = query ? events.filter((event) => [event.name, event.description, ...event.effectTags].some((value) => value.toLocaleLowerCase().includes(query))) : events;
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async getAgentEvent(input) { return this.getRandomEvent({ eventId: input.eventId }); },
    async listAgentMaps(input: AgentMapQuery) {
      const maps = await loadAgentMapProjectionsFast({});
      const query = input.query?.toLocaleLowerCase();
      const mechanic = input.mechanic?.toLocaleLowerCase();
      const filtered = maps.filter((map) => (!query || map.mapName.toLocaleLowerCase().includes(query)) && (!mechanic || map.mechanics.some((value) => value.toLocaleLowerCase() === mechanic)));
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async getAgentMap(input) {
      return (await loadAgentMapProjectionsFast({ mapId: input.mapId }))[0] ?? null;
    },
    async listAgentAchievements(input: AgentAchievementQuery) {
      const allChallenges = await this.listChallenges();
      const projectableRevisionIds = new Set((await loadAgentMapProjectionsFast({})).flatMap((map) => map.gameplayRevisions.map((revision) => revision.gameplayRevisionId)));
      const challenges = allChallenges.filter((challenge) => challenge.family === "achievement" || challenge.family === "map" && projectableRevisionIds.has(challenge.gameplayRevisionId));
      const query = input.query?.toLocaleLowerCase();
      const filtered = challenges.filter((challenge) => {
        const values = challenge.family === "achievement"
          ? [challenge.titleName, challenge.category, challenge.condition, challenge.evidenceRule]
          : [challenge.name, challenge.mapName, challenge.condition ?? "", challenge.evidenceRule ?? ""];
        return (!query || values.some((value) => value.toLocaleLowerCase().includes(query)))
          && (!input.status || challenge.status === input.status)
          && (!input.mapId || (challenge.family === "map" ? challenge.mapId === input.mapId : challenge.scope !== "map" || !challenge.mapIds?.length || challenge.mapIds.includes(input.mapId)));
      });
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async getAgentAchievement(input) {
      const row = await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(
          eq(titleChallenges.id, input.challengeId),
          inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]),
          eq(titleCatalog.scope, "global"),
          eq(titleCatalog.availability, "active"),
        ))
        .get();
      if (row) {
        const mapIdsByChallenge = (row.challenge.scope ?? "global") === "map"
          ? await loadChallengeMapIds([row.challenge.id])
          : new globalThis.Map<string, string[]>();
        return toPublicTitleChallenge(row.challenge, row.title, now(), mapIdsByChallenge);
      }
      const allChallenges = await this.listChallenges();
      const projectableRevisionIds = new Set((await loadAgentMapProjectionsFast({})).flatMap((map) => map.gameplayRevisions.map((revision) => revision.gameplayRevisionId)));
      const mapMatches = allChallenges.filter((challenge): challenge is Extract<Challenge, { family: "map" }> => challenge.family === "map"
        && challenge.challengeId === input.challengeId
        && projectableRevisionIds.has(challenge.gameplayRevisionId)
        && (!input.mapId || challenge.mapId === input.mapId)
        && (!input.gameplayRevisionId || challenge.gameplayRevisionId === input.gameplayRevisionId));
      if (mapMatches.length) return mapMatches.length === 1 ? mapMatches[0] : null;
      return null;
    },
    async listAgentTitles(input: AgentTitleQuery) {
      const titles = await this.listTitles({ mapId: input.mapId });
      const query = input.query?.toLocaleLowerCase();
      const filtered = titles.filter((title) => (!query || [title.label, title.category, title.condition].some((value) => value.toLocaleLowerCase().includes(query))) && (!input.category || title.category === input.category) && (!input.scope || title.scope === input.scope) && (!input.mapId || title.scope === "global" || title.mapId === input.mapId));
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async listAgentPlayerTitleGrants(input: AgentPlayerTitleGrantQuery) {
      const rows = await db.select({ playerId: playerAccounts.playerId, playerName: playerAccounts.playerName, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId })
        .from(playerTitleGrants)
        .innerJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .innerJoin(titleCatalog, and(eq(playerTitleGrants.titleKey, titleCatalog.key), eq(titleCatalog.availability, "active"), eq(titleCatalog.scope, "global")))
        .where(and(eq(playerTitleGrants.status, "active"), isNull(playerTitleGrants.mapId), isNull(playerTitleGrants.gameplayRevisionId))).orderBy(playerAccounts.playerId, playerTitleGrants.titleKey);
      const grouped = new Map<string, { playerId: string; playerName: string; titleKeys: string[]; allTitleKeys: Set<string> }>();
      for (const row of rows) {
        const current = grouped.get(row.playerId) ?? { playerId: row.playerId, playerName: row.playerName, titleKeys: [], allTitleKeys: new Set<string>() };
        current.allTitleKeys.add(row.titleKey);
        if (!current.titleKeys.includes(row.titleKey)) current.titleKeys.push(row.titleKey);
        grouped.set(row.playerId, current);
      }
      const titleCount = (await db.select({ key: titleCatalog.key }).from(titleCatalog).where(and(eq(titleCatalog.availability, "active"), eq(titleCatalog.scope, "global")))).length;
      const items = [...grouped.values()].map(({ allTitleKeys, ...player }) => ({ ...player, allTitles: allTitleKeys.size === titleCount }));
      return { contractVersion: "1" as const, ...paginate(items, input.page, input.pageSize) };
    },
    async listAgentMapTitleHolders(input: AgentMapTitleHolderQuery) {
      const map = await this.getAgentMap({ mapId: input.mapId });
      const projectableRevisionIds = map?.gameplayRevisions.map((revision) => revision.gameplayRevisionId) ?? [];
      if (!projectableRevisionIds.length) return { contractVersion: "1" as const, ...paginate([], input.page, input.pageSize) };
      const rows = await db.select({ mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId, titleKey: playerTitleGrants.titleKey, slot: playerTitleGrants.slot, playerId: playerAccounts.playerId, playerName: playerAccounts.playerName })
        .from(playerTitleGrants)
        .innerJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .innerJoin(gameplayRevisions, and(eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id), eq(gameplayRevisions.mapId, input.mapId), inArray(gameplayRevisions.lifecycle, ["default", "selectable"])))
        .innerJoin(titleCatalog, and(eq(playerTitleGrants.titleKey, titleCatalog.key), eq(titleCatalog.availability, "active"), eq(titleCatalog.scope, "map")))
        .where(and(eq(playerTitleGrants.status, "active"), eq(playerTitleGrants.mapId, input.mapId), inArray(playerTitleGrants.gameplayRevisionId, projectableRevisionIds)))
        .orderBy(playerTitleGrants.gameplayRevisionId, playerTitleGrants.slot, playerAccounts.playerId, playerTitleGrants.titleKey);
      return { contractVersion: "1" as const, ...paginate(rows.map((row) => ({ mapId: row.mapId!, gameplayRevisionId: row.gameplayRevisionId!, titleKey: row.titleKey, slot: row.slot as "pioneer" | "conqueror" | "dominator" | null, slotSemantics: row.slot ? "named" as const : "none" as const, playerId: row.playerId, playerName: row.playerName })), input.page, input.pageSize) };
    },
    async getAgentTitle(input) {
      const title = await db.select().from(titleCatalog).where(and(eq(titleCatalog.key, input.titleKey), eq(titleCatalog.availability, "active"))).get();
      if (!title) return null;
      if (title.scope === "global") {
        return {
          titleKey: title.key,
          label: title.label,
          icon: title.icon,
          iconUrl: title.iconUrl,
          category: title.category,
          condition: title.condition,
          availability: title.availability as Title["availability"],
          scope: "global" as const,
          displayKind: title.displayKind as Title["displayKind"],
          color: titleColor(title.colorJson),
          gameVersion: title.gameVersion,
        };
      }
      // Deterministic first match: lowest mapId, then slot — mirrors prior listMaps+listTitles flatten order.
      const reward = await db.select({ title: titleCatalog, reward: mapTitleRewards })
        .from(mapTitleRewards)
        .innerJoin(titleCatalog, eq(mapTitleRewards.titleKey, titleCatalog.key))
        .innerJoin(maps, and(eq(maps.id, mapTitleRewards.mapId), eq(maps.status, "active")))
        .where(eq(mapTitleRewards.titleKey, input.titleKey))
        .orderBy(mapTitleRewards.mapId, mapTitleRewards.slot)
        .get();
      if (reward) {
        return {
          titleKey: reward.title.key,
          label: reward.title.label,
          icon: reward.title.icon,
          iconUrl: reward.title.iconUrl,
          category: reward.title.category,
          condition: reward.title.condition,
          availability: reward.title.availability as Title["availability"],
          scope: "map" as const,
          displayKind: reward.title.displayKind as Title["displayKind"],
          mapId: reward.reward.mapId,
          slot: reward.reward.slot as Title["slot"],
          pioneerPrefixes: JSON.parse(reward.reward.pioneerPrefixesJson) as string[],
          color: titleColor(reward.title.colorJson),
          gameVersion: reward.title.gameVersion,
        };
      }
      const custom = await db.select({ title: titleCatalog, challenge: titleChallenges })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(
          eq(titleChallenges.titleKey, input.titleKey),
          eq(titleChallenges.scope, "map"),
          eq(titleCatalog.scope, "map"),
          eq(titleCatalog.availability, "active"),
        ))
        .get();
      if (!custom || !titleChallengeIsSubmittable(custom.challenge.status, custom.challenge.startsAt, custom.challenge.endsAt, now())) return null;
      const targets = await loadChallengeMapIds([custom.challenge.id]);
      const targetIds = targets.get(custom.challenge.id) ?? [];
      const mapRow = targetIds.length
        ? await db.select({ id: maps.id }).from(maps).where(and(eq(maps.status, "active"), inArray(maps.id, targetIds))).orderBy(maps.id).get()
        : await db.select({ id: maps.id }).from(maps).where(eq(maps.status, "active")).orderBy(maps.id).get();
      if (!mapRow) return null;
      return {
        titleKey: custom.title.key,
        label: custom.title.label,
        icon: custom.title.icon,
        iconUrl: custom.title.iconUrl,
        category: custom.title.category,
        condition: custom.title.condition,
        availability: custom.title.availability as Title["availability"],
        scope: "map" as const,
        displayKind: custom.title.displayKind as Title["displayKind"],
        mapId: mapRow.id,
        color: titleColor(custom.title.colorJson),
        gameVersion: custom.title.gameVersion,
      };
    },
    async searchAgentContent(input: AgentSearchQuery) {
      const query = input.query.toLocaleLowerCase();
      const [events, maps, achievements, titles] = await Promise.all([this.listRandomEvents({}), this.listMaps(), this.listChallenges({ family: "achievement" }), this.listTitles({})]);
      const results: AgentSearchResult[] = [];
      if (!input.kind || input.kind === "event") results.push(...events.filter((event) => [event.name, event.description, ...event.effectTags].some((value) => value.toLocaleLowerCase().includes(query))).map((event) => ({ kind: "event" as const, id: event.eventId, name: event.name, summary: event.description })));
      if (!input.kind || input.kind === "map") results.push(...maps.filter((map) => [map.mapName, ...map.mechanics].some((value) => value.toLocaleLowerCase().includes(query))).map((map) => ({ kind: "map" as const, id: map.mapId, name: map.mapName, summary: map.mechanics.join("、") || `游戏版本 ${map.gameVersion}` })));
      if (!input.kind || input.kind === "achievement") results.push(...achievements.filter((challenge): challenge is Extract<Challenge, { family: "achievement" }> => challenge.family === "achievement" && [challenge.titleName, challenge.category, challenge.condition, challenge.evidenceRule].some((value) => value.toLocaleLowerCase().includes(query))).map((challenge) => ({ kind: "achievement" as const, id: challenge.challengeId, name: challenge.titleName, summary: challenge.condition })));
      if (!input.kind || input.kind === "title") results.push(...titles.filter((title) => title.availability === "active" && [title.label, title.category, title.condition].some((value) => value.toLocaleLowerCase().includes(query))).map((title) => ({ kind: "title" as const, id: title.titleKey, name: title.label, summary: title.condition })));
      return { contractVersion: "1" as const, ...paginate(results, input.page, input.pageSize) };
    },
    async listRandomEvents(input) {
      const filters = [input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.status ? eq(randomEvents.releaseStatus, input.status) : input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined, input.category ? eq(randomEvents.category, input.category) : undefined, input.rarity ? eq(randomEvents.rarity, input.rarity) : undefined, input.query ? like(randomEvents.name, `%${input.query}%`) : undefined].filter(Boolean) as any[];
      const rows = await db.select().from(randomEvents).where(and(...filters)).orderBy(randomEvents.name);
      if (!rows.length) return [];
        // Batch path: 3 parallel queries regardless of event count, then in-memory assembly.
        // Cold-cache cost: O(1) queries instead of O(4N).
        const eventIds = rows.map((row) => row.id);
        const [mapLinks, titleLinks, allChallenges, terms] = await Promise.all([
          // D1 limits bound SQL parameters. Read the small catalog link tables once
          // and discard links outside the selected public event IDs below.
          db.select().from(randomEventMapChallenges),
          db.select().from(randomEventTitleChallenges),
          fetchAllPublicChallenges(),
          glossary(),
        ]);
        const byLabel = new Map(terms.flatMap((term) => [term.nameZh, ...term.aliases].map((label) => [label, term] as const)));
        const challengeById = new Map(allChallenges.map((c) => [c.challengeId, c]));
        const challengesByEvent = new Map<string, Challenge[]>(eventIds.map((id) => [id, []]));
        for (const link of mapLinks) { const c = challengeById.get(link.challengeId); if (c) challengesByEvent.get(link.eventId)?.push(c); }
        for (const link of titleLinks) { const c = challengeById.get(link.challengeId); if (c) challengesByEvent.get(link.eventId)?.push(c); }
      return rows.map((row): RandomEvent => { const effectTags = JSON.parse(row.effectTagsJson) as string[]; return { eventId: row.id, name: row.name, category: row.category, rarity: row.rarity, description: row.description, durationSeconds: row.durationSeconds, cooldownSeconds: row.cooldownSeconds, weight: row.weight, gameVersion: row.gameVersion, effectTags, effectAnnotations: effectTags.flatMap((tag) => { const term = byLabel.get(tag); return term ? [{ tag, term }] : []; }), releaseStatus: row.releaseStatus as RandomEvent["releaseStatus"], archived: row.archivedAt !== null, challenges: challengesByEvent.get(row.id) ?? [] }; });
    },
    async getRandomEvent(input) {
      const row = await db.select().from(randomEvents).where(and(eq(randomEvents.id, input.eventId), input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined)).get();
      return row ? asRandomEvent(row) : null;
    },
    async createAdminRandomEvent(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.create", idempotencyKey, input); if (replay) return replay;
      await validateEventLinks(input.challengeLinks); const timestamp = now(); const eventId = `event.${crypto.randomUUID()}`;
      await db.insert(randomEvents).values({ id: eventId, name: input.name, category: input.category, rarity: input.rarity, description: input.description, durationSeconds: input.durationSeconds, cooldownSeconds: input.cooldownSeconds, weight: input.weight, gameVersion: input.gameVersion, effectTagsJson: JSON.stringify([...new Set(input.effectTags)]), releaseStatus: input.releaseStatus, createdAt: timestamp, updatedAt: timestamp });
      await replaceEventLinks(eventId, input.challengeLinks); const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, eventId)).get())!);
      await recordIdempotency(db, auth.subject, "admin.random-event.create", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.create", "random_event", eventId, input); return response;
    },
    async updateAdminRandomEvent(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.update", idempotencyKey, input); if (replay) return replay;
      const existing = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!existing) throw new Error("EVENT_NOT_FOUND"); await validateEventLinks(input.challengeLinks);
      await db.update(randomEvents).set({ name: input.name, category: input.category, rarity: input.rarity, description: input.description, durationSeconds: input.durationSeconds, cooldownSeconds: input.cooldownSeconds, weight: input.weight, gameVersion: input.gameVersion, effectTagsJson: JSON.stringify([...new Set(input.effectTags)]), releaseStatus: input.releaseStatus, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await replaceEventLinks(input.eventId, input.challengeLinks);
      const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get())!); await recordIdempotency(db, auth.subject, "admin.random-event.update", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.update", "random_event", input.eventId, input); return response;
    },
    async archiveAdminRandomEvent(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.random-event.archive", idempotencyKey, input); if (replay) return;
      const event = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!event) throw new Error("EVENT_NOT_FOUND"); await db.update(randomEvents).set({ archivedAt: now(), archivedBy: auth.subject, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await recordIdempotency(db, auth.subject, "admin.random-event.archive", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.random-event.archive", "random_event", input.eventId, {});
    },
    async previewAdminRandomEventImport(input) {
      const parsed = await parseEventImport(input); for (const item of parsed.rows) { try { await validateEventLinks(item.challengeLinks); } catch { parsed.errors.push({ row: 0, message: `未知挑战关联：${item.name}` }); } }
      return { sourceHash: parsed.sourceHash, validRowCount: parsed.errors.length ? 0 : parsed.rows.length, errors: parsed.errors, rows: parsed.rows.slice(0, 20).map((row) => ({ name: row.name, category: row.category, releaseStatus: row.releaseStatus })) };
    },
    async importAdminRandomEvents(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<{ importedCount: number }>(db, auth.subject, "admin.random-event.import", idempotencyKey, input); if (replay) return replay;
      const parsed = await parseEventImport(input); if (parsed.errors.length) throw new Error("EVENT_IMPORT_INVALID"); const duplicate = await db.select().from(randomEventImports).where(eq(randomEventImports.sourceHash, parsed.sourceHash)).get(); if (duplicate) throw new Error("EVENT_IMPORT_DUPLICATE");
      for (const item of parsed.rows) { await validateEventLinks(item.challengeLinks); const exists = await db.select({ id: randomEvents.id }).from(randomEvents).where(eq(randomEvents.name, item.name)).get(); if (exists) throw new Error("EVENT_IMPORT_NAME_CONFLICT"); }
      const timestamp = now(); const response = { importedCount: parsed.rows.length }; const statements: D1PreparedStatement[] = [];
      for (const item of parsed.rows) { const eventId = `event.${crypto.randomUUID()}`; statements.push(database.prepare("INSERT INTO random_events (id,name,category,rarity,description,duration_seconds,cooldown_seconds,weight,game_version,effect_tags_json,release_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId, item.name, item.category, item.rarity, item.description, item.durationSeconds, item.cooldownSeconds, item.weight, item.gameVersion, JSON.stringify(item.effectTags), item.releaseStatus, timestamp, timestamp)); for (const link of item.challengeLinks) statements.push(database.prepare(link.family === "map" ? "INSERT INTO random_event_map_challenges (event_id,challenge_id) VALUES (?,?)" : "INSERT INTO random_event_title_challenges (event_id,challenge_id) VALUES (?,?)").bind(eventId, link.challengeId)); }
      statements.push(database.prepare("INSERT INTO random_event_imports (id,source_hash,file_name,row_count,imported_by,imported_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), parsed.sourceHash, input.fileName, parsed.rows.length, auth.subject, timestamp)); statements.push(database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(`${auth.subject}:admin.random-event.import:${idempotencyKey}`, auth.subject, "admin.random-event.import", await hashRequest(input), JSON.stringify(response), timestamp)); statements.push(database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, "admin.random-event.import", "random_event_import", parsed.sourceHash, JSON.stringify({ fileName: input.fileName, importedCount: parsed.rows.length }), timestamp));
      await database.batch(statements); return response;
    },
    async listMaps() {
      const rows = await db.select({ map: maps, metadata: mapMetadata }).from(maps).leftJoin(mapMetadata, eq(mapMetadata.mapId, maps.id)).where(eq(maps.status, "active")).orderBy(maps.name);
      return rows.map(({ map, metadata }): Map => ({
          mapId: map.id,
          mapName: map.name,
          gameVersion: map.gameVersion,
          difficultyRating: (metadata?.difficultyRating as Map["difficultyRating"]) ?? null,
          mechanics: metadata?.mechanicsJson ? JSON.parse(metadata.mechanicsJson) as string[] : [],
          coverUrl: metadata?.coverUrl ?? null,
          backgroundUrl: metadata?.backgroundUrl ?? null,
      }));
    },

    async updateAdminMapMetadata(input: AdminMapMetadataUpdateRequest & { mapId: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Map>(db, auth.subject, "admin.map.metadata.update", idempotencyKey, input);
      if (replay) return replay;
      const map = await db.select().from(maps).where(eq(maps.id, input.mapId)).get();
      if (!map) throw new Error("MAP_NOT_FOUND");
      const mechanics = [...new Set(input.mechanics.map((value) => value.trim()).filter(Boolean))];
      const timestamp = now();
      await db.insert(mapMetadata).values({ mapId: input.mapId, difficultyRating: input.difficultyRating, mechanicsJson: JSON.stringify(mechanics), coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl, updatedAt: timestamp, updatedBy: auth.subject }).onConflictDoUpdate({ target: mapMetadata.mapId, set: { difficultyRating: input.difficultyRating, mechanicsJson: JSON.stringify(mechanics), coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl, updatedAt: timestamp, updatedBy: auth.subject } });
      const response: Map = { mapId: map.id, mapName: map.name, gameVersion: map.gameVersion, difficultyRating: input.difficultyRating, mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl };
      await recordIdempotency(db, auth.subject, "admin.map.metadata.update", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map.metadata.update", "map_metadata", input.mapId, { difficultyRating: input.difficultyRating, mechanics, coverUrl: input.coverUrl, backgroundUrl: input.backgroundUrl });
      return response;
    },

    async getAdminMapEditor(input) {
      const map = await loadAdminMap(input.mapId);
      if (!map) throw new Error("MAP_NOT_FOUND");
      const revisionRows = await db.select().from(gameplayRevisions).where(eq(gameplayRevisions.mapId, input.mapId)).orderBy(asc(gameplayRevisions.createdAt), asc(gameplayRevisions.id));
      const revisions = await Promise.all(revisionRows.map((row) => loadAdminMapRevision(row.id)));
      const [challengeCatalog, audit] = await Promise.all([
        loadAdminMapEditorChallengeCatalog(input.mapId),
        loadAdminMapEditorAudit(input.mapId, revisions.map((revision) => revision.revisionId)),
      ]);
      return { contractVersion: "1" as const, map, revisions, challengeCatalog, audit } satisfies AdminMapEditorResponse;
    },

    async createAdminMapRevision(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminMapRevision>(db, auth.subject, "admin.map.revision.create", idempotencyKey, input);
      if (replay) return replay;
      const map = await db.select().from(maps).where(eq(maps.id, input.mapId)).get();
      if (!map) throw new Error("MAP_NOT_FOUND");

      let source: typeof gameplayRevisions.$inferSelect | null = null;
      if (input.sourceRevisionId) {
        source = await db.select().from(gameplayRevisions).where(and(eq(gameplayRevisions.id, input.sourceRevisionId), eq(gameplayRevisions.mapId, input.mapId))).get() ?? null;
        if (!source) throw new Error("REVISION_SOURCE_NOT_FOUND");
      } else if (input.copyConfiguration) {
        source = await db.select().from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.lifecycle, "default"))).get() ?? null;
        if (!source) throw new Error("REVISION_SOURCE_NOT_FOUND");
      }

      const sourceAssignments = source
        ? await db.select().from(gameplayRevisionChallengeAssignments).where(eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, source.id)).orderBy(asc(gameplayRevisionChallengeAssignments.challengeFamily), asc(gameplayRevisionChallengeAssignments.challengeId))
        : [];
      const assignments: AdminRevisionAssignmentInput[] = input.copyConfiguration
        ? sourceAssignments.map((assignment) => ({
          challengeFamily: assignment.challengeFamily as AdminRevisionAssignmentInput["challengeFamily"],
          challengeId: assignment.challengeId,
          enabled: assignment.enabled === 1,
          condition: nullableEditorText(assignment.condition),
          evidenceRule: nullableEditorText(assignment.evidenceRule),
          submissionMode: assignment.submissionMode === null ? null : assignment.submissionMode as "manual" | "automatic",
          slot: assignment.slot === null ? null : assignment.slot as "pioneer" | "conqueror" | "dominator",
        }))
        : input.challengeAssignments ?? [];
      const spatialConfig = input.copyConfiguration ? parseEditorSpatialConfig(source?.spatialConfigJson ?? null) : input.spatialConfig ?? null;
      await validateRevisionAssignments(input.mapId, assignments);
      if (spatialConfig && !agentSpatialConfigSchema.safeParse(spatialConfig).success) throw new Error("INVALID_SPATIAL_CONFIG");
      if (input.mapVariant === "classic") {
        const existingClassic = await db.select({ id: gameplayRevisions.id }).from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.legacyMapVariant, "classic"))).get();
        if (existingClassic) throw new Error("LEGACY_VARIANT_CONFLICT");
      }

      const timestamp = now();
      const revisionId = `revision:${input.mapId}:${crypto.randomUUID()}`;
      const statements = [database.prepare("INSERT INTO gameplay_revisions (id, map_id, lifecycle, legacy_map_variant, copied_from_revision_id, reset_reason, game_version, spatial_config_json, created_at, updated_at) VALUES (?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?)").bind(
        revisionId, input.mapId, input.mapVariant, source?.id ?? input.sourceRevisionId ?? null, input.resetReason, input.gameVersion, spatialConfig ? JSON.stringify(spatialConfig) : null, timestamp, timestamp,
      )];
      for (const assignment of assignments) {
        statements.push(database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
          `assignment:${revisionId}:${crypto.randomUUID()}`, revisionId, input.mapId, assignment.challengeFamily, assignment.challengeId, assignment.enabled ? 1 : 0, assignment.condition, assignment.evidenceRule, assignment.submissionMode, assignment.slot, timestamp, timestamp,
        ));
      }
      await database.batch(statements);
      const response = await loadAdminMapRevision(revisionId);
      await recordIdempotency(db, auth.subject, "admin.map.revision.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map.revision.create", "gameplay_revision", revisionId, {
        sourceRevisionId: source?.id ?? input.sourceRevisionId ?? null,
        copyConfiguration: input.copyConfiguration,
        copiedAssignmentCount: input.copyConfiguration ? assignments.length : 0,
        progressCopied: false,
      });
      return response;
    },

    async updateAdminMapRevision(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminMapRevision>(db, auth.subject, "admin.map.revision.update", idempotencyKey, input);
      if (replay) return replay;
      const current = await db.select().from(gameplayRevisions).where(and(eq(gameplayRevisions.id, input.revisionId), eq(gameplayRevisions.mapId, input.mapId))).get();
      if (!current) throw new Error("REVISION_NOT_FOUND");
      assertRevisionLifecycle(current.lifecycle, input.lifecycle);
      assertRevisionConfiguration(input.lifecycle, input.mapVariant, input.spatialConfig);
      await validateRevisionAssignments(input.mapId, input.challengeAssignments);

      if (input.lifecycle === "default") {
        const otherDefault = await db.select({ id: gameplayRevisions.id }).from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.lifecycle, "default"), ne(gameplayRevisions.id, input.revisionId))).get();
        if (otherDefault) throw new Error("DEFAULT_REVISION_CONFLICT");
      }
      if (input.mapVariant === "classic") {
        const otherClassic = await db.select({ id: gameplayRevisions.id }).from(gameplayRevisions).where(and(eq(gameplayRevisions.mapId, input.mapId), eq(gameplayRevisions.legacyMapVariant, "classic"), ne(gameplayRevisions.id, input.revisionId))).get();
        if (otherClassic) throw new Error("LEGACY_VARIANT_CONFLICT");
      }

      const timestamp = now();
      const statements = [database.prepare("UPDATE gameplay_revisions SET lifecycle = ?, legacy_map_variant = ?, game_version = ?, spatial_config_json = ?, updated_at = ? WHERE id = ? AND map_id = ?").bind(
        input.lifecycle, input.mapVariant, input.gameVersion, input.spatialConfig ? JSON.stringify(input.spatialConfig) : null, timestamp, input.revisionId, input.mapId,
      ), database.prepare("DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ?").bind(input.revisionId)];
      for (const assignment of input.challengeAssignments) {
        statements.push(database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(
          `assignment:${input.revisionId}:${crypto.randomUUID()}`, input.revisionId, input.mapId, assignment.challengeFamily, assignment.challengeId, assignment.enabled ? 1 : 0, assignment.condition, assignment.evidenceRule, assignment.submissionMode, assignment.slot, timestamp, timestamp,
        ));
      }
      await database.batch(statements);
      const response = await loadAdminMapRevision(input.revisionId);
      await recordIdempotency(db, auth.subject, "admin.map.revision.update", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.map.revision.update", "gameplay_revision", input.revisionId, {
        previousLifecycle: current.lifecycle,
        lifecycle: input.lifecycle,
        assignmentCount: input.challengeAssignments.length,
        spatialConfigUpdated: true,
        progressCopied: false,
      });
      return response;
    },

    async listChallenges(input) {
      const items: Challenge[] = [];
      if (!input?.family || input.family === "map") {
        const rows = await db.select({ challenge: achievementChallenges, map: maps, assignment: gameplayRevisionChallengeAssignments, revision: gameplayRevisions })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .innerJoin(gameplayRevisionChallengeAssignments, and(
            eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
            eq(gameplayRevisionChallengeAssignments.challengeId, achievementChallenges.id),
            eq(gameplayRevisionChallengeAssignments.mapId, achievementChallenges.mapId),
            eq(gameplayRevisionChallengeAssignments.enabled, 1),
          ))
          .innerJoin(gameplayRevisions, eq(gameplayRevisionChallengeAssignments.gameplayRevisionId, gameplayRevisions.id))
          .where(and(
            inArray(achievementChallenges.status, ["active", "sunsetting"]),
            eq(maps.status, "active"),
            eq(gameplayRevisions.mapId, achievementChallenges.mapId),
            inArray(gameplayRevisions.lifecycle, ["default", "selectable"]),
            notExists(db.select({ legacyChallengeId: mapTitleRuleCompat.legacyChallengeId })
              .from(mapTitleRuleCompat)
              .where(and(
                eq(mapTitleRuleCompat.legacyChallengeId, achievementChallenges.id),
                eq(mapTitleRuleCompat.mapId, achievementChallenges.mapId),
              )))
          ))
          .orderBy(maps.name, achievementChallenges.name);
        items.push(...rows.map(({ challenge, map, assignment, revision }) => toPublicMapChallenge(challenge, map, assignment, revision)));
        items.push(...await loadMapTitleRuleChallenges());
        items.push(...await loadMapScopedTitleChallenges());
      }
      if (!input?.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.availability, "active")))
          .orderBy(titleCatalog.category, titleCatalog.label);
        const timestamp = now();
        items.push(...rows.flatMap(({ challenge, title }): Challenge[] => {
          const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp);
          if (!status || (challenge.scope ?? "global") === "map" && challenge.mapVariant) return [];
          return [{
          challengeId: challenge.id,
          family: "achievement",
          type: "title_achievement",
          kind: "title_achievement",
          titleKey: title.key,
          titleName: title.label,
          icon: title.icon,
          iconUrl: title.iconUrl,
          category: challenge.categoryOverride ?? title.category,
          condition: challenge.condition,
          evidenceRule: challenge.evidenceRule,
          gameVersion: challenge.gameVersion,
          status: status as "scheduled" | "active" | "sunsetting",
          startsAt: challenge.startsAt ?? undefined,
          endsAt: challenge.endsAt ?? undefined,
          retiredVersion: challenge.retiredVersion ?? undefined,
          submissionMode: challenge.submissionMode as "manual" | "automatic",
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
          .innerJoin(gameplayRevisionChallengeAssignments, and(
            eq(gameplayRevisionChallengeAssignments.challengeFamily, "map_challenge"),
            eq(gameplayRevisionChallengeAssignments.challengeId, achievementChallenges.id),
            eq(gameplayRevisionChallengeAssignments.mapId, achievementChallenges.mapId),
            eq(gameplayRevisionChallengeAssignments.enabled, 1),
          ))
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
          challengeId: challenge.id,
          family: "achievement",
          type: "title_achievement",
          kind: "title_achievement",
          titleKey: title.key,
          titleName: title.label,
          icon: title.icon,
          iconUrl: title.iconUrl,
          category: challenge.categoryOverride ?? title.category,
          categoryOverride: challenge.categoryOverride,
          condition: challenge.condition,
          evidenceRule: challenge.evidenceRule,
          gameVersion: challenge.gameVersion,
          status: challenge.status as "active" | "sunsetting" | "retired",
          submissionMode: challenge.submissionMode as "manual" | "automatic",
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
          .where(input.status && input.status !== "sunsetting" ? eq(titleCatalog.availability, input.status) : undefined);
        items.push(...rows.filter(({ challenge }) => !challenge).map(({ title }): AdminChallenge => ({
          challengeId: `title.${title.key}`,
          family: "title_catalog",
          type: "title_catalog",
          titleKey: title.key,
          titleName: title.label,
          icon: title.icon,
          iconUrl: title.iconUrl,
          category: title.category,
          condition: title.condition,
          availability: title.availability as "active" | "retired",
          scope: title.scope as "global" | "map",
          displayKind: title.displayKind as "fixed" | "map_pioneer" | "map_name_suffix",
          color: titleColor(title.colorJson),
          status: title.availability as "active" | "retired",
          gameVersion: title.gameVersion,
          hasChallenge: false,
        })));
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
          exception: exception ? { exceptionId: exception.id, ruleId: exception.ruleId, mapId: exception.mapId, enabled: exception.enabled === 1, condition: exception.condition, evidenceRule: exception.evidenceRule, submissionMode: exception.submissionMode as "manual" | "automatic" | null, slot: exception.slot as "pioneer" | "conqueror" | "dominator" | null } : null };
      }));
      return { contractVersion: "1" as const, items };
    },

    async upsertAdminMapTitleRuleException(input: AdminMapTitleRuleExceptionUpsertRequest & { mapId: string; ruleId: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.map-title-rule-exception.upsert", idempotencyKey, input);
      if (replay) return;
      const [map, rule] = await Promise.all([db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get(), db.select({ id: mapTitleRules.id, mapVariant: mapTitleRules.mapVariant }).from(mapTitleRules).where(eq(mapTitleRules.id, input.ruleId)).get()]);
      if (!map) throw new Error("MAP_NOT_FOUND");
      if (!rule) throw new Error("MAP_TITLE_RULE_NOT_FOUND");
      const timestamp = now();
      await database.prepare("INSERT INTO map_title_rule_exceptions (id,rule_id,map_id,enabled,condition,evidence_rule,submission_mode,slot,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(rule_id,map_id) DO UPDATE SET enabled=excluded.enabled, condition=excluded.condition, evidence_rule=excluded.evidence_rule, submission_mode=excluded.submission_mode, slot=excluded.slot, updated_at=excluded.updated_at")
        .bind(crypto.randomUUID(), input.ruleId, input.mapId, input.enabled ? 1 : 0, input.condition ?? null, input.evidenceRule ?? null, input.submissionMode ?? null, input.slot ?? null, timestamp, timestamp).run();
      const revision = await selectGameplayRevision({ mapId: input.mapId, mapVariant: rule.mapVariant === "classic" ? "classic" : null });
      if (!revision) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
      await database.prepare("INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) VALUES (?, ?, ?, 'map_title_rule', ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(gameplay_revision_id, challenge_family, challenge_id) DO UPDATE SET enabled = excluded.enabled, condition = excluded.condition, evidence_rule = excluded.evidence_rule, submission_mode = excluded.submission_mode, slot = excluded.slot, updated_at = excluded.updated_at")
        .bind(`assignment:${revision.id}:map_title_rule:${input.ruleId}`, revision.id, input.mapId, input.ruleId, input.enabled ? 1 : 0, input.condition ?? null, input.evidenceRule ?? null, input.submissionMode ?? null, input.slot ?? null, timestamp, timestamp).run();
      await recordIdempotency(db, auth.subject, "admin.map-title-rule-exception.upsert", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.map-title-rule-exception.upsert", "map_title_rule_exception", `${input.ruleId}:${input.mapId}`, input);
    },

    async createAdminAchievement(input: AdminAchievementCreateRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminChallenge>(db, auth.subject, "admin.achievement.create", idempotencyKey, input);
      if (replay) return replay;
      const existing = await db.select({ key: titleCatalog.key, category: titleCatalog.category }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (existing) throw new Error("TITLE_KEY_CONFLICT");
      const targetMapIds = [...new Set(input.mapIds)];
      if (input.scope === "global" && targetMapIds.length) throw new Error("INVALID_MAP_SCOPE");
      if (input.scope === "map" && targetMapIds.length) {
        const targetMaps = await db.select({ id: maps.id, status: maps.status }).from(maps).where(inArray(maps.id, targetMapIds));
        if (targetMaps.length !== targetMapIds.length) throw new Error("MAP_NOT_FOUND");
        if (targetMaps.some((map) => map.status !== "active")) throw new Error("MAP_NOT_ACTIVE");
      }
      const timestamp = now();
      const challengeId = `title.${input.titleKey}`;
      const assignedMapIds = input.scope === "map"
        ? targetMapIds.length
          ? targetMapIds
          : (await db.select({ id: maps.id }).from(maps).where(eq(maps.status, "active"))).map(({ id }) => id)
        : [];
      const mapVariant = input.mapVariant ?? null;
      const revisions = assignedMapIds.length
        ? await db.select({ revision: gameplayRevisions }).from(gameplayRevisions).where(and(
          inArray(gameplayRevisions.mapId, assignedMapIds),
          mapVariant === "classic"
            ? and(eq(gameplayRevisions.lifecycle, "selectable"), eq(gameplayRevisions.legacyMapVariant, "classic"))
            : and(eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant)),
        ))
        : [];
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
        gameVersion: input.gameVersion,
        status: input.status,
        submissionMode: input.submissionMode,
        introducedVersion: input.gameVersion,
        retiredVersion: input.status === "sunsetting" ? input.retiredVersion ?? null : null,
        startsAt: input.status === "scheduled" ? input.startsAt ?? null : null,
        endsAt: input.status === "scheduled" ? input.endsAt ?? null : null,
        scope: input.scope,
        mapIds: targetMapIds,
        ...(input.mapVariant ? { mapVariant: input.mapVariant } : {}),
      };
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT INTO title_catalog (key,label,icon,icon_url,category,condition,availability,scope,display_kind,color_json,game_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(input.titleKey, input.titleName, input.icon, input.iconUrl, input.category, input.condition, input.status === "retired" ? "retired" : "active", input.scope, "fixed", "null", input.gameVersion),
        database.prepare("INSERT INTO title_challenges (id,title_key,category_override,condition,evidence_rule,submission_mode,game_version,status,introduced_version,retired_version,starts_at,ends_at,scope,map_variant,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(challengeId, input.titleKey, input.categoryOverride, input.condition, input.evidenceRule, input.submissionMode, input.gameVersion, input.status, input.gameVersion, input.status === "sunsetting" ? input.retiredVersion ?? null : null, input.status === "scheduled" ? input.startsAt ?? null : null, input.status === "scheduled" ? input.endsAt ?? null : null, input.scope, input.mapVariant ?? null, timestamp, timestamp),
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
      } else {
        const row = await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, input.challengeId)).get();
        if (!row) throw new Error("CHALLENGE_NOT_FOUND");
        const scope = input.scope ?? (row.challenge.scope as "global" | "map" ?? "global");
        const mapIds = input.mapIds !== undefined ? [...new Set(input.mapIds)] : (scope === "map" ? (await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, row.challenge.id))).map(({ mapId }) => mapId) : []);
        if (scope === "global" && mapIds.length) throw new Error("INVALID_MAP_SCOPE");
        if (scope === "map" && mapIds.length) {
          const targetMaps = await db.select({ id: maps.id, status: maps.status }).from(maps).where(inArray(maps.id, mapIds));
          if (targetMaps.length !== mapIds.length) throw new Error("MAP_NOT_FOUND");
          if (targetMaps.some((map) => map.status !== "active")) throw new Error("MAP_NOT_ACTIVE");
        }
        await db.update(titleChallenges).set({
          condition: input.condition,
          evidenceRule: input.evidenceRule,
          submissionMode: input.submissionMode,
          categoryOverride: input.categoryOverride,
          status: input.status,
          retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null,
          startsAt: input.status === "scheduled" ? input.startsAt! : null,
          endsAt: input.status === "scheduled" ? input.endsAt! : null,
          scope,
          mapVariant: scope === "global" ? null : input.mapVariant !== undefined ? input.mapVariant : row.challenge.mapVariant,
          updatedAt: timestamp,
        }).where(eq(titleChallenges.id, row.challenge.id));
        if (input.scope !== undefined || input.mapIds !== undefined) {
          await db.delete(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, row.challenge.id));
          if (scope === "map" && mapIds.length) await db.insert(achievementChallengeMaps).values(mapIds.map((mapId) => ({ challengeId: row.challenge.id, mapId })));
        }
        if (scope === "map") {
          const assignedMapIds = mapIds.length
            ? mapIds
            : (await db.select({ id: maps.id }).from(maps).where(eq(maps.status, "active"))).map(({ id }) => id);
          const mapVariant = input.mapVariant !== undefined ? input.mapVariant : (row.challenge.mapVariant as "classic" | null) ?? null;
          const revisions = assignedMapIds.length
            ? await db.select({ revision: gameplayRevisions }).from(gameplayRevisions).where(and(
              inArray(gameplayRevisions.mapId, assignedMapIds),
              mapVariant === "classic"
                ? and(eq(gameplayRevisions.lifecycle, "selectable"), eq(gameplayRevisions.legacyMapVariant, "classic"))
                : and(eq(gameplayRevisions.lifecycle, "default"), isNull(gameplayRevisions.legacyMapVariant)),
            ))
            : [];
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
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: row.title.key, titleName: row.title.label, icon: row.title.icon, iconUrl: input.iconUrl !== undefined ? input.iconUrl : row.title.iconUrl, category: input.categoryOverride ?? row.title.category, categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: row.challenge.gameVersion, status: input.status, submissionMode: input.submissionMode, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, startsAt: input.status === "scheduled" ? input.startsAt! : null, endsAt: input.status === "scheduled" ? input.endsAt! : null, scope, mapIds, ...(input.mapVariant !== undefined ? { mapVariant: input.mapVariant } : row.challenge.mapVariant ? { mapVariant: row.challenge.mapVariant as "classic" } : {}) };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
        return response;
      }
    },

    async updateAdminCatalogTitle(input: AdminCatalogTitleUpdateRequest & { titleKey: string }, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.catalog.update", idempotencyKey, input); if (replay) return;
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title) throw new Error("TITLE_NOT_FOUND");
      const challenge = await db.select({ id: titleChallenges.id }).from(titleChallenges).where(eq(titleChallenges.titleKey, input.titleKey)).get();
      if (challenge) throw new Error("TITLE_HAS_CHALLENGE");
      await db.update(titleCatalog).set({
        availability: input.status === "retired" ? "retired" : "active",
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.displayKind !== undefined ? { displayKind: input.displayKind } : {}),
        ...(input.color !== undefined ? { colorJson: JSON.stringify(input.color) } : {}),
      }).where(eq(titleCatalog.key, input.titleKey));
      if (input.iconUrl !== undefined) await db.update(titleCatalog).set({ iconUrl: input.iconUrl, iconObjectKey: input.iconUrl === title.iconUrl ? title.iconObjectKey : null }).where(eq(titleCatalog.key, title.key));
      if (input.status !== "active" && input.status !== "retired" && title.category === "开发保留") throw new Error("DEVELOPER_TITLE_CANNOT_BE_A_CHALLENGE");
      const hasChallengeFields = input.condition !== undefined || input.evidenceRule !== undefined || input.submissionMode !== undefined || input.categoryOverride !== undefined || input.iconUrl !== undefined || input.startsAt !== undefined || input.endsAt !== undefined || input.retiredVersion !== undefined;
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
          status: input.status,
          introducedVersion: title.gameVersion,
          retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null,
          startsAt: input.status === "scheduled" ? input.startsAt! : null,
          endsAt: input.status === "scheduled" ? input.endsAt! : null,
          scope: title.scope as "global" | "map",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      await recordIdempotency(db, auth.subject, "admin.title.catalog.update", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.title.catalog.update", "title_catalog", input.titleKey, { status: input.status });
    },

    async uploadAdminTitleIcon(input, auth) {
      if (!evidenceBucket) throw new Error("ICON_BUCKET_UNAVAILABLE");
      const extension = titleIconContentTypes.get(input.contentType);
      if (!extension || input.body.byteLength === 0 || input.body.byteLength > maxTitleIconBytes) throw new Error("ICON_FILE_INVALID");
      const title = await db.select().from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title) throw new Error("TITLE_NOT_FOUND");
      const objectKey = `public/achievement-icons/${encodeURIComponent(input.titleKey)}/${crypto.randomUUID()}.${extension}`;
      await evidenceBucket.put(objectKey, input.body, { httpMetadata: { contentType: input.contentType, cacheControl: "public, max-age=31536000, immutable" } });
      const iconUrl = `${uploadOrigin}/v1/public/achievement-icons/${encodeURIComponent(input.titleKey)}`;
      await db.update(titleCatalog).set({ iconUrl, iconObjectKey: objectKey }).where(eq(titleCatalog.key, input.titleKey));
      if (title.iconObjectKey) await evidenceBucket.delete(title.iconObjectKey);
      await recordAudit(db, auth, "admin.title.icon.upload", "title_catalog", input.titleKey, { contentType: input.contentType, byteSize: input.body.byteLength });
      return { iconUrl };
    },

    async getPublicTitleIcon(input) {
      if (!evidenceBucket) return null;
      const title = await db.select({ objectKey: titleCatalog.iconObjectKey }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title?.objectKey) return null;
      const object = await evidenceBucket.get(title.objectKey);
      if (!object) return null;
      return { body: object.body, contentType: object.httpMetadata?.contentType ?? "application/octet-stream", etag: object.httpEtag };
    },

    async listTitles(input) {
      const globalRows = await db.select().from(titleCatalog).where(eq(titleCatalog.scope, "global")).orderBy(titleCatalog.key);
      const globalTitles: Title[] = globalRows.map((row) => ({
        titleKey: row.key,
        label: row.label,
        icon: row.icon,
        iconUrl: row.iconUrl,
        category: row.category,
        condition: row.condition,
        availability: row.availability as Title["availability"],
        scope: "global",
        displayKind: row.displayKind as Title["displayKind"],
        color: titleColor(row.colorJson),
        gameVersion: row.gameVersion,
      }));
      if (!input.mapId) return globalTitles;
      const [mapRows, customCandidates, mapIdsByChallenge] = await Promise.all([
        db.select({ title: titleCatalog, reward: mapTitleRewards })
          .from(mapTitleRewards)
          .innerJoin(titleCatalog, eq(mapTitleRewards.titleKey, titleCatalog.key))
          .where(eq(mapTitleRewards.mapId, input.mapId)).orderBy(titleCatalog.key),
        db.select({ title: titleCatalog, challenge: titleChallenges })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(eq(titleChallenges.scope, "map"), eq(titleCatalog.scope, "map"), eq(titleCatalog.availability, "active"))),
        loadChallengeMapIds(),
      ]);
      const customMapRows = customCandidates.filter((row) => {
        const targets = mapIdsByChallenge.get(row.challenge.id) ?? [];
        return !targets.length || targets.some((mapId) => mapId === input.mapId);
      });
      const mappedTitles = mapRows.map(({ title, reward }): Title => ({
        titleKey: title.key,
        label: title.label,
        icon: title.icon,
        iconUrl: title.iconUrl,
        category: title.category,
        condition: title.condition,
        availability: title.availability as Title["availability"],
        scope: "map",
        displayKind: title.displayKind as Title["displayKind"],
        mapId: input.mapId,
        slot: reward.slot as Title["slot"],
        pioneerPrefixes: JSON.parse(reward.pioneerPrefixesJson) as string[],
        color: titleColor(title.colorJson),
        gameVersion: title.gameVersion,
      }));
      const mappedKeys = new Set(mappedTitles.map((title) => title.titleKey));
      const timestamp = now();
      const customTitles = customMapRows.filter(({ title, challenge }) => !mappedKeys.has(title.key) && titleChallengeIsSubmittable(challenge.status, challenge.startsAt, challenge.endsAt, timestamp)).map(({ title }): Title => ({
        titleKey: title.key,
        label: title.label,
        icon: title.icon,
        iconUrl: title.iconUrl,
        category: title.category,
        condition: title.condition,
        availability: title.availability as Title["availability"],
        scope: "map",
        displayKind: title.displayKind as Title["displayKind"],
        mapId: input.mapId,
        color: titleColor(title.colorJson),
        gameVersion: title.gameVersion,
      }));
      return globalTitles.concat(mappedTitles, customTitles);
    },

    async listCurrentPlayerTitles(input) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(input.sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) return null;
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) return null;
      const rows = await db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name }).from(playerTitleGrants)
        .innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key))
        .leftJoin(maps, eq(playerTitleGrants.mapId, maps.id))
        .leftJoin(gameplayRevisions, eq(playerTitleGrants.gameplayRevisionId, gameplayRevisions.id))
        .where(and(
          eq(playerTitleGrants.playerAccountId, binding.playerAccountId),
          eq(playerTitleGrants.status, "active"),
          or(isNull(playerTitleGrants.mapId), eq(gameplayRevisions.lifecycle, "default")),
        )).orderBy(desc(playerTitleGrants.grantedAt));
      return rows.map(({ grant, title, mapName }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: grant.mapId ? "map" as const : "global" as const, mapName: mapName ?? undefined, slot: grant.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt }));
    },

    async listHistoricalTitleGrants(input) {
      const filter = input.filter ?? "all";
      const safePage = Math.max(1, input.page);
      const safePageSize = Math.min(50, Math.max(1, input.pageSize));
      const query = input.query?.trim() ? `%${input.query.trim()}%` : undefined;

      let matchingHolderNames: string[] | null = null;
      if (query) {
        const matched = await db.selectDistinct({ holderName: historicalTitleGrants.holderName })
          .from(historicalTitleGrants)
          .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key))
          .where(or(like(historicalTitleGrants.holderName, query), like(titleCatalog.label, query)));
        matchingHolderNames = matched.map((row) => row.holderName);
        if (!matchingHolderNames.length) {
          const [statsRow] = await db.select({
            pendingHolderCount: sql<number>`count(distinct case when ${playerTitleGrants.id} is null then ${historicalTitleGrants.holderName} end)`,
            unclaimedGrantCount: sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`,
            migratedGrantCount: sql<number>`sum(case when ${playerTitleGrants.id} is not null then 1 else 0 end)`,
          }).from(historicalTitleGrants)
            .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)));
          return {
            contractVersion: "1" as const,
            holders: [],
            page: safePage,
            pageSize: safePageSize,
            total: 0,
            hasMore: false,
            filter,
            stats: {
              pendingHolderCount: Number(statsRow?.pendingHolderCount ?? 0),
              unclaimedGrantCount: Number(statsRow?.unclaimedGrantCount ?? 0),
              migratedGrantCount: Number(statsRow?.migratedGrantCount ?? 0),
            },
          };
        }
      }

      const holderScope = matchingHolderNames ? inArray(historicalTitleGrants.holderName, matchingHolderNames) : undefined;
      const totalCountExpr = sql<number>`count(*)`;
      const unclaimedCountExpr = sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`;
      const havingClause = filter === "pending"
        ? sql`${unclaimedCountExpr} > 0`
        : filter === "completed"
          ? sql`${unclaimedCountExpr} = 0`
          : undefined;

      const aggregated = db.select({
        holderName: historicalTitleGrants.holderName,
        totalCount: totalCountExpr,
        unclaimedCount: unclaimedCountExpr,
      }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)))
        .where(holderScope)
        .groupBy(historicalTitleGrants.holderName)
        .having(havingClause)
        .as("historical_holder_summary");

      const [[{ total }], pageRows, [statsRow]] = await Promise.all([
        db.select({ total: count() }).from(aggregated),
        db.select({
          holderName: aggregated.holderName,
          totalCount: aggregated.totalCount,
          unclaimedCount: aggregated.unclaimedCount,
        }).from(aggregated)
          .orderBy(asc(aggregated.holderName))
          .limit(safePageSize)
          .offset((safePage - 1) * safePageSize),
        db.select({
          pendingHolderCount: sql<number>`count(distinct case when ${playerTitleGrants.id} is null then ${historicalTitleGrants.holderName} end)`,
          unclaimedGrantCount: sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`,
          migratedGrantCount: sql<number>`sum(case when ${playerTitleGrants.id} is not null then 1 else 0 end)`,
        }).from(historicalTitleGrants)
          .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id))),
      ]);

      return {
        contractVersion: "1" as const,
        holders: pageRows.map((row) => {
          const totalCount = Number(row.totalCount);
          const unclaimedCount = Number(row.unclaimedCount);
          return {
            holderName: row.holderName,
            totalCount,
            unclaimedCount,
            status: unclaimedCount > 0 ? "pending" as const : "completed" as const,
          };
        }),
        page: safePage,
        pageSize: safePageSize,
        total: Number(total),
        hasMore: safePage * safePageSize < Number(total),
        filter,
        stats: {
          pendingHolderCount: Number(statsRow?.pendingHolderCount ?? 0),
          unclaimedGrantCount: Number(statsRow?.unclaimedGrantCount ?? 0),
          migratedGrantCount: Number(statsRow?.migratedGrantCount ?? 0),
        },
      };
    },

    async getHistoricalTitleHolder(input) {
      const holderName = input.holderName.trim();
      if (!holderName) throw new Error("HISTORICAL_HOLDER_NOT_FOUND");
      const grantStatus = input.grantStatus ?? "all";
      const safePage = Math.max(1, input.page);
      const safePageSize = Math.min(100, Math.max(1, input.pageSize));

      const [totals] = await db.select({
        totalCount: sql<number>`count(*)`,
        unclaimedCount: sql<number>`sum(case when ${playerTitleGrants.id} is null then 1 else 0 end)`,
      }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)))
        .where(eq(historicalTitleGrants.holderName, holderName));
      const totalCount = Number(totals?.totalCount ?? 0);
      if (!totalCount) throw new Error("HISTORICAL_HOLDER_NOT_FOUND");
      const unclaimedCount = Number(totals?.unclaimedCount ?? 0);
      const holder = {
        holderName,
        totalCount,
        unclaimedCount,
        status: unclaimedCount > 0 ? "pending" as const : "completed" as const,
      };

      const statusCondition = grantStatus === "unclaimed"
        ? isNull(playerTitleGrants.id)
        : grantStatus === "active"
          ? eq(playerTitleGrants.status, "active")
          : grantStatus === "revoked"
            ? eq(playerTitleGrants.status, "revoked")
            : undefined;

      const itemWhere = and(eq(historicalTitleGrants.holderName, holderName), statusCondition);
      const [[{ filteredTotal }], rows] = await Promise.all([
        db.select({ filteredTotal: count() }).from(historicalTitleGrants)
          .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)))
          .where(itemWhere),
        db.select({ historical: historicalTitleGrants, grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, player: playerAccounts }).from(historicalTitleGrants)
          .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key))
          .leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id))
          .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)))
          .leftJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
          .where(itemWhere)
          .orderBy(asc(titleCatalog.category), asc(titleCatalog.label))
          .limit(safePageSize)
          .offset((safePage - 1) * safePageSize),
      ]);

      const items = rows.map(({ historical, grant, title, mapName, player }) => ({
        grantId: grant?.id ?? historical.id,
        titleKey: title.key,
        label: title.label,
        icon: title.icon,
        iconUrl: title.iconUrl,
        category: title.category,
        condition: title.condition,
        scope: historical.scope as "global" | "map",
        mapName: mapName ?? undefined,
        slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined,
        grantedAt: grant?.grantedAt ?? 0,
        holderName: historical.holderName,
        playerAccountId: grant?.playerAccountId,
        playerName: player?.playerName,
        playerId: player?.playerId,
        status: (grant ? grant.status as "active" | "revoked" : "unclaimed") as "unclaimed" | "active" | "revoked",
        revokeReason: grant?.revokeReason ?? undefined,
      }));
      const total = Number(filteredTotal);
      return {
        contractVersion: "1" as const,
        holder,
        items,
        page: safePage,
        pageSize: safePageSize,
        total,
        hasMore: safePage * safePageSize < total,
        grantStatus,
      };
    },


    async createAdminTitleGrant(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.grant", idempotencyKey, input); if (replay) return;
      const historical = await db.select().from(historicalTitleGrants).where(eq(historicalTitleGrants.id, input.historicalTitleGrantId)).get();
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!historical) throw new Error("HISTORICAL_TITLE_GRANT_NOT_FOUND"); if (!player) throw new Error("PLAYER_NOT_FOUND");
      const existing = await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historical.id))).get(); if (existing?.status === "active") throw new Error("HISTORICAL_TITLE_GRANT_CLAIMED");
      const timestamp = now(); const id = crypto.randomUUID();
      if (existing) await db.update(playerTitleGrants).set({ playerAccountId: player.id, status: "active", grantedBy: auth.subject, grantedAt: timestamp, revokedBy: null, revokedAt: null, revokeReason: null }).where(eq(playerTitleGrants.id, existing.id));
      else await db.insert(playerTitleGrants).values({ id, playerAccountId: player.id, titleKey: historical.titleKey, mapId: historical.mapId, gameplayRevisionId: historical.gameplayRevisionId, slot: historical.slot, status: "active", sourceType: "historical", sourceId: historical.id, grantedBy: auth.subject, grantedAt: timestamp });
      const grantId = existing?.id ?? id;
      await recordIdempotency(db, auth.subject, "admin.title.grant", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.title.grant", "player_title_grant", grantId, { playerAccountId: player.id, historicalTitleGrantId: historical.id });
    },

    async createAdminManualTitleGrant(input, auth, idempotencyKey): Promise<AdminManualTitleGrantResponse> {
      const replay = await replayOrConflict<AdminManualTitleGrantResponse>(db, auth.subject, "admin.title.grant.manual", idempotencyKey, input);
      if (replay) return replay;
      const player = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!player) throw new Error("PLAYER_NOT_FOUND");
      const title = await db.select({ key: titleCatalog.key, label: titleCatalog.label, scope: titleCatalog.scope }).from(titleCatalog).where(eq(titleCatalog.key, input.titleKey)).get();
      if (!title) throw new Error("TITLE_NOT_FOUND");
      if (title.scope === "global" && input.mapId) throw new Error("GLOBAL_TITLE_CANNOT_HAVE_MAP");
      if (title.scope === "map" && !input.mapId) throw new Error("MAP_TITLE_REQUIRES_MAP");
      let slot: string | null = null;
      let gameplayRevisionId: string | null = null;
      if (input.mapId) {
        const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
        if (!map) throw new Error("MAP_NOT_FOUND");
        const revision = await selectGameplayRevision({ mapId: input.mapId, mapVariant: null });
        if (!revision) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
        gameplayRevisionId = revision.id;
        const rule = await db.select({ ruleId: mapTitleRules.id }).from(mapTitleRules).where(and(eq(mapTitleRules.titleKey, title.key), ne(mapTitleRules.status, "inactive"))).get();
        const projection = rule ? await resolveMapTitleProjection(rule.ruleId, input.mapId) : null;
        if (projection) slot = projection.slot;
        else {
          const reward = await db.select({ slot: mapTitleRewards.slot }).from(mapTitleRewards).where(and(eq(mapTitleRewards.mapId, input.mapId), eq(mapTitleRewards.titleKey, title.key))).get();
          if (reward) slot = reward.slot;
          else {
          const customChallenge = await db.select({ id: titleChallenges.id }).from(titleChallenges).where(and(eq(titleChallenges.titleKey, title.key), eq(titleChallenges.scope, "map"))).get();
          if (!customChallenge) throw new Error("TITLE_MAP_REWARD_NOT_CONFIGURED");
          }
        }
      }
      const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(eq(playerTitleGrants.playerAccountId, player.id), eq(playerTitleGrants.titleKey, title.key), eq(playerTitleGrants.status, "active"), input.mapId ? eq(playerTitleGrants.mapId, input.mapId) : isNull(playerTitleGrants.mapId), gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
      const grantId = existing?.id ?? crypto.randomUUID();
      const response: AdminManualTitleGrantResponse = { contractVersion: "1", grantId, titleKey: title.key, titleName: title.label, mapId: input.mapId ?? null, slot: slot as "pioneer" | "conqueror" | "dominator" | null, alreadyOwned: Boolean(existing) };
      const timestamp = now();
      const sourceId = `manual:${auth.subject}:${idempotencyKey}`;
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, ?, 'active', 'manual', ?, ?, ?)").bind(grantId, player.id, title.key, input.mapId ?? null, gameplayRevisionId, slot, sourceId, auth.subject, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'admin.title.grant.manual', ?, ?, ?)").bind(`${auth.subject}:admin.title.grant.manual:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'admin.title.grant.manual', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grantId, JSON.stringify({ playerAccountId: player.id, titleKey: title.key, mapId: input.mapId ?? null, gameplayRevisionId, slot, alreadyOwned: Boolean(existing), reason: input.reason ?? null }), timestamp),
      ]);
      return response;
    },

    async createAdminTitleGrantBulk(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<{ contractVersion: "1"; grantedCount: number; skippedClaimedCount: number }>(db, auth.subject, "admin.title.grant.bulk", idempotencyKey, input);
      if (replay) return replay;
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!player) throw new Error("PLAYER_NOT_FOUND");
      const holderRows = await db.select({ id: historicalTitleGrants.id, titleKey: historicalTitleGrants.titleKey, mapId: historicalTitleGrants.mapId, gameplayRevisionId: historicalTitleGrants.gameplayRevisionId, slot: historicalTitleGrants.slot, grantId: playerTitleGrants.id }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)))
        .where(eq(historicalTitleGrants.holderName, input.holderName));
      const unclaimed = holderRows.filter((row) => !row.grantId);
      const skippedClaimedCount = holderRows.length - unclaimed.length;
      const timestamp = now();
      const grants = unclaimed.map((item) => ({ id: crypto.randomUUID(), historical: item }));
      const response = { contractVersion: "1" as const, grantedCount: grants.length, skippedClaimedCount };
      const statements = [
        ...grants.map((grant) => db.insert(playerTitleGrants).values({ id: grant.id, playerAccountId: player.id, titleKey: grant.historical.titleKey, mapId: grant.historical.mapId, gameplayRevisionId: grant.historical.gameplayRevisionId, slot: grant.historical.slot, status: "active", sourceType: "historical", sourceId: grant.historical.id, grantedBy: auth.subject, grantedAt: timestamp })),
        ...grants.map((grant) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.title.grant.bulk", entityType: "player_title_grant", entityId: grant.id, payloadJson: JSON.stringify({ playerAccountId: player.id, historicalTitleGrantId: grant.historical.id, holderName: input.holderName }), createdAt: timestamp })),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:admin.title.grant.bulk:${idempotencyKey}`, actorId: auth.subject, operation: "admin.title.grant.bulk", requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
      ];
      if (statements.length === 1) {
        await db.batch(statements as [typeof statements[number]]);
      } else {
        await db.batch(statements as [typeof statements[number], ...typeof statements]);
      }
      return response;
    },

    async revokeAdminTitleGrant(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.revoke", idempotencyKey, input); if (replay) return;
      const grant = await db.select().from(playerTitleGrants).where(eq(playerTitleGrants.id, input.grantId)).get(); if (!grant) throw new Error("TITLE_GRANT_NOT_FOUND");
      await db.update(playerTitleGrants).set({ status: "revoked", revokedBy: auth.subject, revokedAt: now(), revokeReason: input.reason ?? null }).where(eq(playerTitleGrants.id, grant.id));
      await recordIdempotency(db, auth.subject, "admin.title.revoke", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.title.revoke", "player_title_grant", grant.id, { reason: input.reason ?? null });
    },

    async createPlayerUploadSession(input, sessionToken) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) throw new Error("UNAUTHENTICATED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("UNAUTHENTICATED");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      const mapChallenge = input.challengeId ? await db.select({ challenge: achievementChallenges, map: maps })
        .from(achievementChallenges)
        .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
        .where(and(eq(achievementChallenges.id, input.challengeId), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active")))
        .get() : null;
      const ruleProjection = input.challengeId && !mapChallenge
        ? await resolveLegacyProjection(input.challengeId, input.mapId, input.gameplayRevisionId)
        : null;
      const titleChallenge = input.challengeId && !mapChallenge ? await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(eq(titleChallenges.id, input.challengeId), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.availability, "active")))
        .get() : null;
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      if (input.challengeId && !mapChallenge && !ruleProjection && !titleChallenge) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge && !titleChallengeIsSubmittable(titleChallenge.challenge.status, titleChallenge.challenge.startsAt, titleChallenge.challenge.endsAt, now())) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge?.challenge.submissionMode === "automatic") throw new Error("CHALLENGE_AUTOMATIC");
      if (titleChallenge?.challenge.scope === "global" && input.mapId) throw new Error("GLOBAL_CHALLENGE_CANNOT_HAVE_MAP");
      if (ruleProjection && input.mapId && input.mapId !== ruleProjection.mapId) throw new Error("MAP_NOT_IN_CHALLENGE");
      let targetMap = mapChallenge?.map ?? (ruleProjection?.mapId ? await db.select().from(maps).where(eq(maps.id, ruleProjection.mapId)).get() ?? null : null);
      if (titleChallenge?.challenge.scope === "map") {
        if (!input.mapId) throw new Error("MAP_REQUIRED");
        targetMap = await db.select().from(maps).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get() ?? null;
        if (!targetMap) throw new Error("MAP_NOT_ACTIVE");
        const target = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(and(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id), eq(achievementChallengeMaps.mapId, input.mapId))).get();
        const hasExplicitTargets = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id)).limit(1).get();
        if (hasExplicitTargets && !target) throw new Error("MAP_NOT_IN_CHALLENGE");
      }
      if (ruleProjection?.submissionMode === "automatic") throw new Error("CHALLENGE_AUTOMATIC");
      const directRevision = mapChallenge
        ? await resolveAssignedGameplayRevision({
          mapId: mapChallenge.map.id,
          mapVariant: mapChallenge.challenge.type === "classic_completion" ? "classic" : null,
          challengeFamily: "map_challenge",
          challengeId: mapChallenge.challenge.id,
          gameplayRevisionId: input.gameplayRevisionId,
        })
        : null;
      if (mapChallenge && !directRevision) throw new Error("CHALLENGE_NOT_FOUND");
      const challengeType = ruleProjection ? "map_title_achievement" : mapChallenge?.challenge.type ?? (titleChallenge ? "title_achievement" : "unknown");
      const mapName = targetMap?.name ?? "成就挑战";
      const difficulty = mapChallenge?.challenge.difficulty ?? null;
      const snapshot = ruleProjection ?? (titleChallenge?.challenge.scope === "map" && targetMap ? await snapshotTitleChallenge(titleChallenge.challenge, titleChallenge.title, targetMap.id, input.gameplayRevisionId) : null);
      if (titleChallenge?.challenge.scope === "map" && !snapshot) throw new Error("CHALLENGE_NOT_FOUND");
      const submissionId = crypto.randomUUID();
      const uploadId = crypto.randomUUID();
      const timestamp = now();
      const objectKey = userEvidenceObjectKey(submissionId, input.sha256, "upload");
      await db.insert(submissions).values({ id: submissionId, bindingId: binding.id, status: "upload_pending", challengeType, challengeId: input.challengeId ?? null, targetMapId: targetMap?.id ?? null, gameplayRevisionId: snapshot?.gameplayRevisionId ?? directRevision?.revision.id ?? null, mapName, difficulty, playerName: account.playerName, ruleSnapshotJson: snapshot ? JSON.stringify(snapshot) : null, sourceProvider: "portal", sourceConversationId: "portal", sourceMessageId: uploadId, createdAt: timestamp, updatedAt: timestamp });
      await db.insert(uploadSessions).values({ id: uploadId, submissionId, playerAccountId: account.id, contentType: input.contentType, byteSize: input.byteSize, sha256: input.sha256, objectKey, status: "pending", expiresAt: timestamp + uploadTtlMs, createdAt: timestamp });
      return { contractVersion: "1" as const, submissionId, uploadId, uploadUrl: `${uploadOrigin}/v1/uploads/${uploadId}`, expiresAt: timestamp + uploadTtlMs, maxBytes: maxUploadBytes };
    },

    async confirmPlayerSubmissionChallenge(input, sessionToken) {
      const submission = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      if (submission.status !== "awaiting_player_confirmation" || submission.challengeId) throw new Error("SUBMISSION_NOT_CONFIRMABLE");
      const mapChallenge = await db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(and(eq(achievementChallenges.id, input.challengeId), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active"))).get();
      const ruleProjection = !mapChallenge
        ? await resolveLegacyProjection(input.challengeId, input.mapId, input.gameplayRevisionId)
        : null;
      const titleChallenge = !mapChallenge && !ruleProjection ? await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(eq(titleChallenges.id, input.challengeId), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.availability, "active"))).get() : null;
      if (!mapChallenge && !ruleProjection && !titleChallenge) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge && (!titleChallengeIsSubmittable(titleChallenge.challenge.status, titleChallenge.challenge.startsAt, titleChallenge.challenge.endsAt, now()) || titleChallenge.challenge.submissionMode === "automatic")) throw new Error("CHALLENGE_NOT_FOUND");
      let targetMap = mapChallenge?.map ?? null;
      if (titleChallenge?.challenge.scope === "global" && input.mapId) throw new Error("GLOBAL_CHALLENGE_CANNOT_HAVE_MAP");
      if (ruleProjection && input.mapId && input.mapId !== ruleProjection.mapId) throw new Error("MAP_NOT_IN_CHALLENGE");
      if (ruleProjection?.mapId) targetMap = await db.select().from(maps).where(and(eq(maps.id, ruleProjection.mapId), eq(maps.status, "active"))).get() ?? null;
      if (ruleProjection && !targetMap) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge?.challenge.scope === "map") {
        if (!input.mapId) throw new Error("MAP_REQUIRED");
        targetMap = await db.select().from(maps).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get() ?? null;
        if (!targetMap) throw new Error("MAP_NOT_ACTIVE");
        const target = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(and(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id), eq(achievementChallengeMaps.mapId, input.mapId))).get();
        const hasExplicitTargets = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id)).limit(1).get();
        if (hasExplicitTargets && !target) throw new Error("MAP_NOT_IN_CHALLENGE");
      }
      const directRevision = mapChallenge
        ? await resolveAssignedGameplayRevision({
          mapId: mapChallenge.map.id,
          mapVariant: mapChallenge.challenge.type === "classic_completion" ? "classic" : null,
          challengeFamily: "map_challenge",
          challengeId: mapChallenge.challenge.id,
          gameplayRevisionId: input.gameplayRevisionId,
        })
        : null;
      if (mapChallenge && !directRevision) throw new Error("CHALLENGE_NOT_FOUND");
      const result = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get();
      const raw = result?.responseJson ? JSON.parse(result.responseJson) as OcrResponse : null;
      const data = raw?.data ?? {};
      const challengeType = ruleProjection ? "map_title_achievement" : mapChallenge ? "map_completion" : "title_achievement";
      const matchChallengeType = ruleProjection || titleChallenge?.challenge.scope === "map" ? "map_title_achievement" : challengeType;
      const requiredMapVariant = ruleProjection?.mapVariant ?? titleChallenge?.challenge.mapVariant ?? null;
      const qualityChallengeType = matchChallengeType === "map_title_achievement" && mapChallenge?.challenge.difficulty ? "difficulty_completion" : matchChallengeType;
      const quality = raw ? assessOcrQuality(qualityChallengeType, raw, requiredMapVariant, matchChallengeType === "title_achievement") : { accepted: false, requiredFields: [], reasons: ["missing_ocr_result"] };
      const expectedTitleName = ruleProjection
        ? (await db.select({ label: titleCatalog.label }).from(titleCatalog).where(eq(titleCatalog.key, ruleProjection.titleKey)).get())?.label
        : titleChallenge?.title.label;
      const { skipped, ...match } = matchOcrResult({ challengeType: matchChallengeType, targetMapName: targetMap?.name ?? "成就挑战", targetDifficulty: mapChallenge?.challenge.difficulty ?? null, targetPlayerName: submission.playerName, mapName: data.map_name, difficulty: data.difficulty, challengeCompleted: data.challenge_completed, player: data.viewer_player, mapVariant: data.map_variant, requiredMapVariant, titleName: expectedTitleName, achievementTitles: data.achievement_titles, achievementPanelText: data.achievement_panel_text });
      const snapshot = ruleProjection ?? (titleChallenge?.challenge.scope === "map" && targetMap ? await snapshotTitleChallenge(titleChallenge.challenge, titleChallenge.title, targetMap.id, input.gameplayRevisionId) : null);
      if (titleChallenge?.challenge.scope === "map" && !snapshot) throw new Error("CHALLENGE_NOT_FOUND");
      const matched = quality.accepted && Object.values(match).every(Boolean);
      await db.update(submissions).set({ status: matched ? "ready_for_review" : "resubmission_required", challengeType, challengeId: input.challengeId, targetMapId: targetMap?.id ?? null, gameplayRevisionId: snapshot?.gameplayRevisionId ?? directRevision?.revision.id ?? null, mapName: targetMap?.name ?? "成就挑战", difficulty: mapChallenge?.challenge.difficulty ?? null, ruleSnapshotJson: snapshot ? JSON.stringify(snapshot) : null, updatedAt: now(), reviewReason: matched ? null : quality.accepted ? "OCR 结果与目标挑战不匹配" : "截图未满足识别要求，请重新提交" }).where(eq(submissions.id, submission.id));
      if (result) await db.update(ocrResults).set({ matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality }) }).where(eq(ocrResults.id, result.id));
      return await this.getPlayerSubmission({ submissionId: submission.id }, sessionToken);
    },

    async uploadEvidence(input, sessionToken) {
      if (!evidenceBucket) throw new Error("EVIDENCE_BUCKET_UNAVAILABLE");
      const session = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.uploadId)).get();
      if (!session || session.expiresAt <= now() || session.status !== "pending") throw new Error("UPLOAD_SESSION_INVALID");
      const authSession = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!authSession) throw new Error("UNAUTHENTICATED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, authSession.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding || binding.playerAccountId !== session.playerAccountId) throw new Error("UPLOAD_SESSION_INVALID");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, session.playerAccountId)).get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      if (input.contentType !== session.contentType || input.body.byteLength !== session.byteSize || input.body.byteLength > maxUploadBytes) throw new Error("UPLOAD_METADATA_MISMATCH");
      const sha256 = await digestHex(input.body);
      if (sha256 !== session.sha256) throw new Error("UPLOAD_HASH_MISMATCH");
      await evidenceBucket.put(session.objectKey, input.body, { httpMetadata: { contentType: input.contentType } });
      await db.update(uploadSessions).set({ status: "uploaded" }).where(eq(uploadSessions.id, session.id));
      await db.insert(attachments).values({ id: crypto.randomUUID(), submissionId: session.submissionId, provider: "portal", externalAttachmentId: session.id, contentType: input.contentType, byteSize: input.body.byteLength, sha256, objectKey: session.objectKey, uploadStatus: "stored", createdAt: now() });
    },

    async completePlayerUpload(input, sessionToken, requestId) {
      const session = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.uploadId)).get();
      if (!session || session.expiresAt <= now() || session.status !== "uploaded") throw new Error("UPLOAD_SESSION_INVALID");
      const authSession = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!authSession) throw new Error("UNAUTHENTICATED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, authSession.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding || binding.playerAccountId !== session.playerAccountId) throw new Error("UPLOAD_SESSION_INVALID");
      await db.update(uploadSessions).set({ status: "completed" }).where(eq(uploadSessions.id, session.id));
      await db.update(submissions).set({ status: "ocr_pending", updatedAt: now() }).where(eq(submissions.id, session.submissionId));
      if (ocrQueue) {
        try {
          await ocrQueue.send({ version: 1, submissionId: session.submissionId, objectKey: session.objectKey, ...(requestId ? { requestId } : {}) });
          logOcrEvent("job_enqueued", { attempt: 0, manual: false, requestId: requestId ?? null });
        } catch (error) {
          logOcrEvent("job_enqueue_failed", { attempt: 0, manual: false, requestId: requestId ?? null, ...errorDetails(error) });
          throw error;
        }
      }
      return { submissionId: session.submissionId, status: "ocr_pending" };
    },

    async listAdminSubmissions(input) {
      const conditions = input.statuses?.length ? [inArray(submissions.status, input.statuses)] : [];
      if (input.spotCheck) {
        const spotChecks = await db.select({ submissionId: submissionSpotChecks.submissionId }).from(submissionSpotChecks).where(eq(submissionSpotChecks.status, input.spotCheck));
        conditions.push(spotChecks.length ? inArray(submissions.id, spotChecks.map(({ submissionId }) => submissionId)) : eq(submissions.id, "__no_matching_spot_check__"));
      }
      const condition = conditions.length ? and(...conditions) : undefined;
      const [rows, [{ total }]] = await Promise.all([
        db.select().from(submissions).where(condition).orderBy(desc(submissions.updatedAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize),
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

    async selectAdminSubmissionChallenge(input, auth, idempotencyKey): Promise<AdminSubmissionChallengeResponse> {
      const replay = await replayOrConflict<AdminSubmissionChallengeResponse>(db, auth.subject, "submission.challenge.select", idempotencyKey, input);
      if (replay) return replay;
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (["approved", "rejected"].includes(row.status)) throw new Error("SUBMISSION_NOT_SELECTABLE");

      const latestOcr = await db.select({ matchJson: ocrResults.matchJson, responseJson: ocrResults.responseJson }).from(ocrResults)
        .where(eq(ocrResults.submissionId, row.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get();
      type StoredMatchCandidate = { challengeId?: unknown; mapId?: unknown; gameplayRevisionId?: unknown; challengeType?: unknown; targetMapName?: unknown; targetDifficulty?: unknown; titleName?: unknown; match?: { achievement?: unknown } };
      let matchCandidates: StoredMatchCandidate[] = [];
      let ocrData: { map_name?: unknown; difficulty?: unknown } = {};
      try {
        const parsed = latestOcr?.matchJson ? JSON.parse(latestOcr.matchJson) as { candidates?: unknown } : null;
        matchCandidates = Array.isArray(parsed?.candidates) ? parsed.candidates.filter((candidate): candidate is StoredMatchCandidate => Boolean(candidate) && typeof candidate === "object") : [];
        const response = latestOcr?.responseJson ? JSON.parse(latestOcr.responseJson) as { data?: unknown } : null;
        if (response?.data && typeof response.data === "object" && !Array.isArray(response.data)) ocrData = response.data as { map_name?: unknown; difficulty?: unknown };
      } catch {
        matchCandidates = [];
        ocrData = {};
      }
      const recognizedMapName = normalizedOcrLabel(ocrData.map_name);
      const recognizedDifficulty = normalizedOcrDifficulty(ocrData.difficulty);
      const matchedCandidates = matchCandidates.filter((candidate) => {
        if (candidate.challengeId !== input.challengeId) return false;
        if (candidate.challengeType === "title_achievement") return !input.mapId && typeof candidate.titleName === "string";
        if (typeof candidate.mapId !== "string" || !input.mapId || candidate.mapId !== input.mapId) return false;
        if (input.gameplayRevisionId && typeof candidate.gameplayRevisionId === "string" && candidate.gameplayRevisionId !== input.gameplayRevisionId) return false;
        if (typeof candidate.targetMapName !== "string" || !recognizedMapName || normalizedOcrLabel(candidate.targetMapName) !== recognizedMapName) return false;
        return candidate.targetDifficulty === null || candidate.targetDifficulty === undefined || Boolean(recognizedDifficulty) && normalizedOcrDifficulty(candidate.targetDifficulty) === recognizedDifficulty;
      });
      const matchedCandidate = matchedCandidates[0];
      if (!matchedCandidate) throw new Error("CHALLENGE_NOT_FOUND");
      if (matchedCandidate.titleName && matchedCandidate.match?.achievement !== true) throw new Error("CHALLENGE_NOT_SELECTABLE");

      const candidateRevisionIds = new Set(matchedCandidates.flatMap((candidate) => typeof candidate.gameplayRevisionId === "string" ? [candidate.gameplayRevisionId] : []));
      if (!input.gameplayRevisionId && candidateRevisionIds.size > 1) throw new Error("GAMEPLAY_REVISION_REQUIRED");
      const selectedGameplayRevisionId = input.gameplayRevisionId ?? (typeof matchedCandidate.gameplayRevisionId === "string" ? matchedCandidate.gameplayRevisionId : undefined);

      const challenges = (await fetchAllAutoMatchChallenges()).filter((candidate): candidate is Challenge => candidate.challengeId === input.challengeId && (candidate.family === "map" ? candidate.mapId === input.mapId && (!selectedGameplayRevisionId || candidate.gameplayRevisionId === selectedGameplayRevisionId) : !input.mapId));
      if (!selectedGameplayRevisionId && challenges.filter((candidate) => candidate.family === "map").length > 1) throw new Error("GAMEPLAY_REVISION_REQUIRED");
      const challenge = challenges[0];
      if (!challenge) throw new Error("CHALLENGE_NOT_FOUND");
      if (challenge.submissionMode === "automatic") throw new Error("CHALLENGE_AUTOMATIC");

      let challengeType: string;
      let targetMapId: string | null = null;
      let mapName = "成就挑战";
      let difficulty: string | null = null;
      let snapshot: MapTitleRuleSnapshot | null = null;
      if (challenge.family === "achievement") {
        const titleChallenge = await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, input.challengeId)).get();
        if (!titleChallenge || titleChallenge.challenge.scope === "map" || !titleChallengeIsSubmittable(titleChallenge.challenge.status, titleChallenge.challenge.startsAt, titleChallenge.challenge.endsAt, now())) throw new Error("CHALLENGE_NOT_FOUND");
        challengeType = "title_achievement";
      } else {
        targetMapId = challenge.mapId;
        mapName = challenge.mapName;
        difficulty = challengeTargetDifficulty(challenge);
        challengeType = challenge.kind === "map_title_achievement" ? "map_title_achievement" : challenge.kind;
        if (challenge.mapTitleRule) {
          snapshot = await resolveMapTitleProjection(challenge.mapTitleRule.ruleId, challenge.mapId, challenge.gameplayRevisionId);
          if (!snapshot) throw new Error("CHALLENGE_NOT_FOUND");
        } else if (challengeType === "map_title_achievement") {
          const titleChallenge = await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, input.challengeId)).get();
          if (titleChallenge) {
            if (titleChallenge.challenge.scope !== "map" || !titleChallengeIsSubmittable(titleChallenge.challenge.status, titleChallenge.challenge.startsAt, titleChallenge.challenge.endsAt, now()) || titleChallenge.challenge.submissionMode === "automatic") throw new Error("CHALLENGE_NOT_FOUND");
            const target = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(and(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id), eq(achievementChallengeMaps.mapId, challenge.mapId))).get();
            if (!target) throw new Error("MAP_NOT_IN_CHALLENGE");
            snapshot = await snapshotTitleChallenge(titleChallenge.challenge, titleChallenge.title, challenge.mapId, challenge.gameplayRevisionId);
          }
        }
      }
      let gameplayRevisionId = snapshot?.gameplayRevisionId ?? (challenge.family === "map" ? challenge.gameplayRevisionId : null);
      if (challenge.family === "map" && !gameplayRevisionId) {
        const directChallenge = await db.select({ challenge: achievementChallenges }).from(achievementChallenges).where(eq(achievementChallenges.id, challenge.challengeId)).get();
        if (!directChallenge) throw new Error("CHALLENGE_NOT_FOUND");
        const directRevision = await resolveAssignedGameplayRevision({
          mapId: directChallenge.challenge.mapId,
          mapVariant: directChallenge.challenge.type === "classic_completion" ? "classic" : null,
          challengeFamily: "map_challenge",
          challengeId: directChallenge.challenge.id,
          gameplayRevisionId: challenge.gameplayRevisionId,
        });
        if (!directRevision) throw new Error("CHALLENGE_NOT_FOUND");
        gameplayRevisionId = directRevision.revision.id;
      }
      if (challenge.family === "map" && !gameplayRevisionId) throw new Error("CHALLENGE_NOT_FOUND");

      const timestamp = now();
      const response: AdminSubmissionChallengeResponse = { contractVersion: "1", submissionId: row.id, status: "ready_for_review", challengeId: input.challengeId };
      const requestHash = await hashRequest(input);
      const idempotencyKeyId = `${auth.subject}:submission.challenge.select:${idempotencyKey}`;
      await database.batch([
        database.prepare("UPDATE submissions SET status = 'ready_for_review', challenge_type = ?, challenge_id = ?, target_map_id = ?, gameplay_revision_id = ?, map_name = ?, difficulty = ?, rule_snapshot_json = ?, review_reason = NULL, updated_at = ? WHERE id = ? AND status NOT IN ('approved', 'rejected')").bind(challengeType, input.challengeId, targetMapId, gameplayRevisionId, mapName, difficulty, snapshot ? JSON.stringify(snapshot) : null, timestamp, row.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.challenge.select', ?, ?, ?)").bind(idempotencyKeyId, auth.subject, requestHash, JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'submission.challenge.select', 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, row.id, JSON.stringify({ challengeId: input.challengeId, mapId: targetMapId, gameplayRevisionId, challengeType }), timestamp),
      ]);
      const keyRow = await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyKeyId)).get();
      if (!keyRow) throw new Error("SUBMISSION_NOT_SELECTABLE");
      return response;
    },

    async getAdminEvidence(input) {
      if (!evidenceBucket) throw new Error("EVIDENCE_BUCKET_UNAVAILABLE");
      const attachment = await db.select().from(attachments).where(eq(attachments.submissionId, input.submissionId)).orderBy(desc(attachments.createdAt)).limit(1).get();
      if (!attachment?.objectKey) throw new Error("EVIDENCE_NOT_FOUND");
      const object = await evidenceBucket.get(attachment.objectKey);
      if (!object) throw new Error("EVIDENCE_NOT_FOUND");
      return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? attachment.contentType };
    },

    async requestAdminOcr(input, auth, idempotencyKey, requestId): Promise<AdminSubmissionOcrRetryResponse> {
      const replay = await replayOrConflict<AdminSubmissionOcrRetryResponse>(db, auth.subject, "submission.ocr.retry", idempotencyKey, input);
      if (replay) return replay;
      if (!ocrQueue) throw new Error("OCR_NOT_CONFIGURED");
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const attachment = await db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, row.id)).orderBy(desc(attachments.createdAt)).limit(1).get();
      if (!attachment?.objectKey) throw new Error("EVIDENCE_NOT_FOUND");

      const timestamp = now();
      const pendingResultId = crypto.randomUUID();
      const response: AdminSubmissionOcrRetryResponse = { contractVersion: "1", submissionId: row.id, status: "ocr_pending" };
      const requestHash = await hashRequest(input);
      const idempotencyKeyId = `${auth.subject}:submission.ocr.retry:${idempotencyKey}`;
      await database.batch([
        database.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, created_at) VALUES (?, ?, 0, 'pending', ?)").bind(pendingResultId, row.id, timestamp),
        database.prepare("UPDATE submissions SET status = 'ocr_pending', review_reason = NULL, updated_at = ? WHERE id = ?").bind(timestamp, row.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.ocr.retry', ?, ?, ?)").bind(idempotencyKeyId, auth.subject, requestHash, JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'submission.ocr.retry', 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, row.id, JSON.stringify({ manual: true }), timestamp),
      ]);
      try {
        await ocrQueue.send({ version: 1, submissionId: row.id, objectKey: attachment.objectKey, manual: true, ...(requestId ? { requestId } : {}) });
        logOcrEvent("job_enqueued", { attempt: 0, manual: true, requestId: requestId ?? null });
      } catch (error) {
        logOcrEvent("job_enqueue_failed", { attempt: 0, manual: true, requestId: requestId ?? null, ...errorDetails(error) });
        await db.update(ocrResults).set({ status: "error", errorCode: "OCR_QUEUE_SEND_FAILED", createdAt: now() }).where(eq(ocrResults.id, pendingResultId));
        throw error;
      }
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
      const grant = input.decision === "revoked" && row.grantId
        ? await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.id, row.grantId), eq(playerTitleGrants.status, "active"))).get()
        : null;
      const masteryOutcome = await loadMasterySubmissionOutcome(row.id);
      const masteryRun = input.decision === "revoked" && masteryOutcome?.status === "created" && masteryOutcome.masteryRunId
        ? await db.select().from(masteryRuns).where(and(eq(masteryRuns.id, masteryOutcome.masteryRunId), eq(masteryRuns.sourceSubmissionId, row.id), eq(masteryRuns.status, "active"))).get()
        : null;
      if (input.decision === "revoked" && !grant && !masteryOutcome) throw new Error("SUBMISSION_OUTCOME_NOT_FOUND");
      const response: AdminSubmissionSpotCheckResponse = { contractVersion: "1", submissionId: row.id, status: input.decision, grantId: row.grantId ?? null, masteryRunId: masteryOutcome?.masteryRunId ?? null };
      const idempotencyKeyId = `${auth.subject}:submission.spot_check.resolve:${idempotencyKey}`;
      const requestHash = await hashRequest(input);
      const statements: D1PreparedStatement[] = [
        ...(input.decision === "revoked" && grant ? [database.prepare("UPDATE player_title_grants SET status = 'revoked', revoked_by = ?, revoked_at = ?, revoke_reason = ? WHERE id = ? AND status = 'active'").bind(auth.subject, timestamp, input.reason ?? "抽检撤销自动授予的称号", grant.id)] : []),
        ...(input.decision === "revoked" && masteryRun ? [
          database.prepare("UPDATE mastery_runs SET status = 'invalidated', invalidated_at = ?, invalidated_by = ?, invalidation_reason = ? WHERE id = ? AND status = 'active'").bind(timestamp, auth.subject, input.reason ?? "抽检判定证据无效", masteryRun.id),
          database.prepare("INSERT INTO mastery_run_lifecycle_events (id, mastery_run_id, transition, actor_type, actor_id, reason, created_at) VALUES (?, ?, 'invalidated', ?, ?, ?, ?)").bind(crypto.randomUUID(), masteryRun.id, auth.actorType, auth.subject, input.reason ?? "抽检判定证据无效", timestamp),
          database.prepare("UPDATE submission_outcomes SET status = 'invalidated', updated_at = ? WHERE submission_id = ? AND outcome_key = 'mastery_run' AND status = 'created'").bind(timestamp, row.id),
        ] : []),
        database.prepare("UPDATE submission_spot_checks SET status = ?, resolved_at = ?, reviewer = ?, reason = ? WHERE submission_id = ? AND status = 'pending'").bind(input.decision, timestamp, auth.subject, input.reason ?? null, row.id),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.spot_check.resolve', ?, ?, ?)").bind(idempotencyKeyId, auth.subject, requestHash, JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, ?, 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, input.decision === "revoked" ? "submission.spot_check.revoked" : "submission.spot_check.confirmed", row.id, JSON.stringify({ decision: input.decision, reason: input.reason ?? null, grantId: grant?.id ?? null, masteryRunId: masteryOutcome?.masteryRunId ?? null, masteryInvalidated: Boolean(masteryRun) }), timestamp),
        ...(input.decision === "revoked" && grant ? [database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'title_grant.revoke', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grant.id, JSON.stringify({ submissionId: row.id, reason: input.reason ?? "抽检撤销自动授予的称号", sourceType: "automatic" }), timestamp)] : []),
        ...(input.decision === "revoked" && masteryRun ? [database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'mastery_run.invalidate', 'mastery_run', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, masteryRun.id, JSON.stringify({ submissionId: row.id, reason: input.reason ?? "抽检判定证据无效" }), timestamp)] : []),
      ];
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      return response;
    },

    async getPlayerSubmission(input, sessionToken) {
      const submission = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      const [result, attachment, grantRow, masteryOutcome] = await Promise.all([
        db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get(),
        db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, submission.id)).orderBy(desc(attachments.createdAt)).limit(1).get(),
        submission.grantId
          ? db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name }).from(playerTitleGrants).innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(playerTitleGrants.mapId, maps.id)).where(eq(playerTitleGrants.id, submission.grantId)).get()
          : Promise.resolve(null),
        loadMasterySubmissionOutcome(submission.id),
      ]);
      const raw = result?.responseJson ? JSON.parse(result.responseJson) as OcrResponse : null;
      return {
        contractVersion: "1" as const,
        submissionId: submission.id,
        status: submission.status as never,
        mapName: submission.mapName,
        challengeId: submission.challengeId ?? undefined,
        difficulty: submission.difficulty ?? undefined,
        reason: submission.status === "ocr_review_required" ? "已提交处理申请，请稍后查看结果。" : submission.reviewReason ?? undefined,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        evidenceUrl: publicEvidenceUrl(attachment?.objectKey),
        ocrFailCount: submission.ocrFailCount,
        manualReviewEligible: submission.status === "resubmission_required" && submission.ocrFailCount >= ocrManualReviewThreshold,
        ...(raw ? { ocr: { mapName: raw.data?.map_name ?? null, difficulty: raw.data?.difficulty ?? null, playerName: raw.data?.viewer_player ?? null, challengeCompleted: raw.data?.challenge_completed ?? null, achievementTitles: raw.data?.achievement_titles ?? [] } } : {}),
        ...(grantRow?.grant.status === "active" ? { titleGrant: { grantId: grantRow.grant.id, titleKey: grantRow.title.key, titleName: grantRow.title.label, ...(grantRow.mapName ? { mapName: grantRow.mapName } : {}) } } : {}),
        ...playerMasterySubmissionOutcomeFields(masteryOutcome),
      };
    },

    async requestManualReview(input, sessionToken) {
      const submission = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      if (submission.status === "ocr_review_required") return;
      if (submission.status !== "resubmission_required" || submission.ocrFailCount < ocrManualReviewThreshold) throw new Error("MANUAL_REVIEW_NOT_ELIGIBLE");
      const timestamp = now();
      await db.update(submissions).set({ status: "ocr_review_required", updatedAt: timestamp, reviewReason: "玩家申请人工处理" }).where(and(eq(submissions.id, submission.id), eq(submissions.status, "resubmission_required")));
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: "user", actorId: submission.id, operation: "submission.manual_review_requested", entityType: "submission", entityId: submission.id, payloadJson: JSON.stringify({ ocrFailCount: submission.ocrFailCount }), createdAt: timestamp });
    },

    async getPlayerEvidence(input, sessionToken) {
      if (!evidenceBucket) throw new Error("EVIDENCE_NOT_FOUND");
      await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      const attachment = await db.select().from(attachments).where(eq(attachments.submissionId, input.submissionId)).orderBy(desc(attachments.createdAt)).limit(1).get();
      if (!attachment?.objectKey) throw new Error("EVIDENCE_NOT_FOUND");
      const object = await evidenceBucket.get(attachment.objectKey);
      if (!object) throw new Error("EVIDENCE_NOT_FOUND");
      return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? attachment.contentType };
    },

    async reviewSubmission(input, auth, idempotencyKey): Promise<AdminSubmissionReviewResponse> {
      const replay = await replayOrConflict<AdminSubmissionReviewResponse>(db, auth.subject, "submission.review", idempotencyKey, input);
      if (replay) return replay;
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const masteryOutcome = await loadMasterySubmissionOutcome(row.id);

      let reward: { titleKey: string; titleName: string; mapId: string | null; gameplayRevisionId: string | null; slot: string | null } | null = null;
      if (input.decision === "approved" && row.challengeId) {

        // Fast path: submission was created with an immutable rule snapshot.
        if (row.ruleSnapshotJson) {
          const snap = JSON.parse(row.ruleSnapshotJson) as { titleKey: string; mapId: string | null; gameplayRevisionId?: string | null; slot: string | null };
          reward = { titleKey: snap.titleKey, titleName: "", mapId: snap.mapId, gameplayRevisionId: snap.gameplayRevisionId ?? row.gameplayRevisionId ?? null, slot: snap.slot };
          // Resolve the display name from the catalog (read-only; snapshot has the authoritative facts).
          const catalogRow = await db.select({ label: titleCatalog.label }).from(titleCatalog).where(eq(titleCatalog.key, snap.titleKey)).get();
          reward.titleName = catalogRow?.label ?? snap.titleKey;
        } else if (row.challengeType === "title_achievement") {
          const challenge = await db.select({ titleKey: titleChallenges.titleKey, titleName: titleCatalog.label, scope: titleChallenges.scope }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, row.challengeId)).get();
          if (!challenge) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
          if (challenge.scope === "map" && !row.targetMapId) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
          reward = { titleKey: challenge.titleKey, titleName: challenge.titleName, mapId: challenge.scope === "map" ? row.targetMapId : null, gameplayRevisionId: challenge.scope === "map" ? row.gameplayRevisionId : null, slot: null };
        } else {
          // Legacy map challenge path: check compat table first, then fall back to direct join.
          const snap = row.targetMapId ? await resolveCompatProjection(row.challengeId, row.targetMapId, snapshotGameplayRevisionId(row)) : null;
          if (snap) {
            const catalogRow = await db.select({ label: titleCatalog.label }).from(titleCatalog).where(eq(titleCatalog.key, snap.titleKey)).get();
            reward = { titleKey: snap.titleKey, titleName: catalogRow?.label ?? snap.titleKey, mapId: snap.mapId, gameplayRevisionId: snap.gameplayRevisionId, slot: snap.slot };
          } else {
            const challenge = await db.select({ titleKey: achievementChallenges.rewardTitleKey, titleName: titleCatalog.label, mapId: achievementChallenges.mapId, slot: mapTitleRewards.slot }).from(achievementChallenges).leftJoin(titleCatalog, eq(achievementChallenges.rewardTitleKey, titleCatalog.key)).leftJoin(mapTitleRewards, and(eq(mapTitleRewards.mapId, achievementChallenges.mapId), eq(mapTitleRewards.titleKey, achievementChallenges.rewardTitleKey))).where(eq(achievementChallenges.id, row.challengeId)).get();
            if (!challenge?.titleKey || !challenge.titleName) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
            reward = { titleKey: challenge.titleKey, titleName: challenge.titleName, mapId: challenge.mapId, gameplayRevisionId: row.gameplayRevisionId, slot: challenge.slot };
          }
        }
      }
      if (reward?.mapId && !reward.gameplayRevisionId) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
      if (reward?.gameplayRevisionId && row.gameplayRevisionId && reward.gameplayRevisionId !== row.gameplayRevisionId) throw new Error("SUBMISSION_REVISION_MISMATCH");
      if (input.decision === "approved" && !reward && !(masteryOutcome && ["created", "reused"].includes(masteryOutcome.status))) throw new Error("SUBMISSION_OUTCOME_NOT_CONFIGURED");

      const timestamp = now();
      const reviewId = crypto.randomUUID();
      let alreadyOwned = false;
      let grantId = crypto.randomUUID();
      if (reward) {
        const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).innerJoin(bindings, eq(bindings.playerAccountId, playerTitleGrants.playerAccountId)).where(and(eq(bindings.id, row.bindingId), eq(playerTitleGrants.titleKey, reward.titleKey), eq(playerTitleGrants.status, "active"), reward.mapId ? eq(playerTitleGrants.mapId, reward.mapId) : isNull(playerTitleGrants.mapId), reward.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, reward.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
        if (existing) { alreadyOwned = true; grantId = existing.id as typeof grantId; }
      }
      const requestHash = await hashRequest(input);
      const submissionSnapshot = row.ruleSnapshotJson ? JSON.parse(row.ruleSnapshotJson) as MapTitleRuleSnapshot : null;
      const playerMasteryOutcome = masteryOutcome ? playerMasterySubmissionOutcome(masteryOutcome) : null;
      const reviewAudit = { decision: input.decision, reason: input.reason ?? null, grantId: reward ? grantId : null, ...(reward ? { titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, mapVariant: submissionSnapshot?.mapVariant ?? null, ruleId: submissionSnapshot?.ruleId ?? null, ruleRevision: submissionSnapshot?.ruleRevision ?? null } : {}), ...(playerMasteryOutcome ? { masteryOutcome: playerMasteryOutcome } : {}) };
      const response: AdminSubmissionReviewResponse = reward
        ? { contractVersion: "1", submissionId: row.id, decision: "approved", grantId, titleKey: reward.titleKey, titleName: reward.titleName, alreadyOwned, ...(playerMasteryOutcome ? { masteryOutcome: playerMasteryOutcome } : {}) }
        : input.decision === "approved"
          ? { contractVersion: "1", submissionId: row.id, decision: "approved", grant: null, masteryOutcome: playerMasteryOutcome! }
          : { contractVersion: "1", submissionId: row.id, decision: input.decision as "rejected" | "resubmission_required", grant: null };
      const idempotencyKeyId = `${auth.subject}:submission.review:${idempotencyKey}`;
      const statements: D1PreparedStatement[] = [];
      statements.push(
        database.prepare(
          "INSERT INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, id, ?, ?, ?, ? FROM submissions WHERE id = ?"
        ).bind(reviewId, input.decision, input.reason ?? null, auth.subject, timestamp, row.id)
      );
      if (reward) {
        const mapMatch = reward.mapId ? "g.map_id = ?" : "g.map_id IS NULL";
        const revisionMatch = reward.gameplayRevisionId ? "g.gameplay_revision_id = ?" : "g.gameplay_revision_id IS NULL";
        const grantInsert = database.prepare(
          "INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at) SELECT ?, b.player_account_id, ?, ?, ?, ?, 'active', 'submission', s.id, ?, ? FROM submissions s INNER JOIN bindings b ON b.id = s.binding_id WHERE s.id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
        ).bind(grantId, reward.titleKey, reward.mapId, reward.gameplayRevisionId, reward.slot, auth.subject, timestamp, row.id, reviewId);
        statements.push(grantInsert);
        statements.push(
          database.prepare(
            `UPDATE submissions SET status = 'approved', review_reason = ?, gameplay_revision_id = COALESCE(gameplay_revision_id, ?), grant_id = (SELECT g.id FROM player_title_grants g INNER JOIN bindings b ON b.player_account_id = g.player_account_id WHERE b.id = submissions.binding_id AND g.title_key = ? AND ${mapMatch} AND ${revisionMatch} AND g.status = 'active'), updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)`
          ).bind(input.reason ?? null, reward.gameplayRevisionId, reward.titleKey, ...(reward.mapId ? [reward.mapId] : []), ...(reward.gameplayRevisionId ? [reward.gameplayRevisionId] : []), timestamp, row.id, reviewId)
        );
        statements.push(
          approvedSubmissionOutcomeStatement({
            submissionId: row.id,
            outcomeKey: `title_grant:${reward.titleKey}:${reward.mapId ?? ""}:${reward.gameplayRevisionId ?? ""}`,
            outcomeType: "title_grant",
            status: alreadyOwned ? "reused" : "created",
            entityId: grantId,
            details: { titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, slot: reward.slot },
          }),
        );
        if (row.challengeId) {
          statements.push(
            approvedSubmissionOutcomeStatement({
              submissionId: row.id,
              outcomeKey: `challenge:${row.challengeId}:${reward.mapId ?? ""}:${reward.gameplayRevisionId ?? ""}`,
              outcomeType: "challenge",
              status: "created",
              entityId: row.challengeId,
              details: { mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId },
            }),
          );
        }
      } else {
        statements.push(
          database.prepare(
            "UPDATE submissions SET status = ?, review_reason = ?, grant_id = NULL, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
          ).bind(input.decision, input.reason ?? null, timestamp, row.id, reviewId)
        );
      }
      statements.push(
        database.prepare(
          "INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) SELECT ?, ?, 'submission.review', ?, ?, ? FROM submission_reviews WHERE id = ?"
        ).bind(idempotencyKeyId, auth.subject, requestHash, JSON.stringify(response), timestamp, reviewId)
      );
      statements.push(
        database.prepare(
          "INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.review', 'submission', submission_id, ?, ? FROM submission_reviews WHERE id = ?"
        ).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, JSON.stringify(reviewAudit), timestamp, reviewId)
      );
      if (reward) {
        statements.push(
          database.prepare(
            "INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.grant', 'player_title_grant', grant_id, ?, ? FROM submissions WHERE id = ? AND grant_id IS NOT NULL AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
          ).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, JSON.stringify({ submissionId: row.id, titleKey: reward.titleKey, mapId: reward.mapId, gameplayRevisionId: reward.gameplayRevisionId, mapVariant: submissionSnapshot?.mapVariant ?? null, ruleId: submissionSnapshot?.ruleId ?? null, ruleRevision: submissionSnapshot?.ruleRevision ?? null, alreadyOwned }), timestamp, row.id, reviewId)
        );
      }
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      const keyRow = await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyKeyId)).get();
      if (!keyRow) throw new Error("SUBMISSION_NOT_REVIEWABLE");
      if (reward && response.decision === "approved" && "grantId" in response) {
        const completed = await db.select({ grantId: submissions.grantId }).from(submissions).where(eq(submissions.id, row.id)).get();
        if (!completed?.grantId) throw new Error("SUBMISSION_NOT_REVIEWABLE");
        response.grantId = completed.grantId! as typeof response.grantId;
      }
      return response;
    },

    async processOcrJob(input) {
      const ocrRequestId = input.requestId ?? crypto.randomUUID();
      const context = { attempt: input.attempt, manual: Boolean(input.manual), requestId: ocrRequestId };
      const startedAt = Date.now();
      logOcrEvent("job_started", context);
      if (!evidenceBucket || !ocrkitBaseUrl || !ocrkitApiToken || !ocrkitEvidenceBucket) {
        logOcrEvent("job_processing_failed", { ...context, stage: "configuration", durationMs: Date.now() - startedAt, errorName: "Error", errorMessage: "OCR_NOT_CONFIGURED" });
        throw new Error("OCR_NOT_CONFIGURED");
      }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "ocr_pending") return;
      let response: Response;
      try {
        response = await fetch(`${ocrkitBaseUrl.replace(/\/$/, "")}/api/v1/ocr/challenge/by-object`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ocrkitApiToken}`, "user-agent": "OWBastion-PlatformAPI/1.0", "x-request-id": ocrRequestId }, body: JSON.stringify({ object_key: input.objectKey, bucket: ocrkitEvidenceBucket }) });
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
        const data = result.data ?? {};
        const masteryOutcome = await resolveMasterySubmissionOutcome(row, result, input.manual ? "submission_review" : "submission_automatic");
        const masteryAccepted = masteryOutcome.status === "created" || masteryOutcome.status === "reused";
        if (masteryOutcome.status === "conflict") {
          stage = "persist_mastery_conflict";
          await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ masteryOutcome: { status: masteryOutcome.status, conflictFields: masteryOutcome.conflictFields } }), nextStatus: "ocr_review_required", reviewReason: "通关码与已验证记录存在冲突，请人工核对", incrementFailCount: false, allowExistingStatus: Boolean(input.manual), masteryOutcome });
          logOcrEvent("job_completed", { ...context, outcome: "mastery_conflict", conflictFields: masteryOutcome.conflictFields, durationMs: Date.now() - startedAt });
          return;
        }
        if (row.challengeType === "unknown") {
          stage = "resolve_auto_candidates";
          const decision = matchOcrAgainstChallenges(await fetchAllAutoMatchChallenges(), result, row.playerName ?? "");
          const candidates = decision.candidates.map(({ challenge, challengeType, targetMapName, targetDifficulty, titleName, requiredMapVariant, match, quality, grantable }) => ({ challengeId: challenge.challengeId, family: challenge.family, ...(challenge.family === "map" ? { mapId: challenge.mapId, gameplayRevisionId: challenge.gameplayRevisionId } : {}), challengeType, targetMapName, targetDifficulty, titleName, requiredMapVariant, match, quality, grantable }));
          const matchJson = JSON.stringify({ mode: "automatic", outcome: decision.outcome, candidates, masteryOutcome: { status: masteryOutcome.status } });
          if (decision.outcome === "automatic") {
            const candidate = decision.automaticCandidates[0];
            if (!candidate) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
            const grantCandidates = [...decision.automaticCandidates, ...decision.exact.filter((item) => item.challenge.family === "map" && item.targetDifficulty && item.grantable && item.quality.accepted)];
            const uniqueGrantCandidates = [...new Map(grantCandidates.map((item) => [`${item.challenge.titleKey ?? ""}:${item.challenge.family === "map" ? item.challenge.mapId : ""}`, item])).values()];
            const grants: Array<{ snapshot: MapTitleRuleSnapshot; titleKey: string; mapId: string | null; slot: string | null; alreadyOwned: boolean; existingGrantId: string | null }> = [];
            for (const grantCandidate of uniqueGrantCandidates) {
              const snapshot = await automaticSnapshot(grantCandidate);
              if (!snapshot) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              const mapId = snapshot.mapId;
              const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).innerJoin(bindings, eq(bindings.playerAccountId, playerTitleGrants.playerAccountId)).where(and(eq(bindings.id, row.bindingId), eq(playerTitleGrants.titleKey, snapshot.titleKey), eq(playerTitleGrants.status, "active"), mapId ? eq(playerTitleGrants.mapId, mapId) : isNull(playerTitleGrants.mapId), snapshot.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, snapshot.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
              grants.push({ snapshot, titleKey: snapshot.titleKey, mapId, slot: snapshot.slot, alreadyOwned: Boolean(existing), existingGrantId: existing?.id ?? null });
            }
            const sample = await shouldSampleAutomaticDecision(row.id);
            stage = "persist_automatic_decision";
            await persistAutomaticDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson, grants, sample, masteryOutcome });
            logOcrEvent("job_completed", { ...context, outcome: "automatic", titleKey: grants[0]?.titleKey ?? null, grantCount: grants.length, spotCheck: sample, durationMs: Date.now() - startedAt });
            return;
          }
          stage = "persist_auto_routing";
          if (masteryAccepted && decision.outcome === "resubmit") {
            await persistMasteryOnlyDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson, masteryOutcome, sample: await shouldSampleAutomaticDecision(row.id) });
          } else {
            await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: decision.outcome === "review" ? "review_required" : "mismatch", responseJson: JSON.stringify(result), matchJson, nextStatus: decision.outcome === "review" ? "ocr_review_required" : "resubmission_required", reviewReason: decision.outcome === "review" ? "无法唯一判断挑战，请人工核对" : "截图与当前挑战目录不匹配，请重新提交", incrementFailCount: decision.outcome === "resubmit", allowExistingStatus: Boolean(input.manual), masteryOutcome });
          }
          logOcrEvent("job_completed", { ...context, outcome: decision.outcome, candidateCount: decision.exact.length, durationMs: Date.now() - startedAt });
          return;
        }
        stage = "resolve_challenge";
        const storedSnapshot = row.ruleSnapshotJson ? JSON.parse(row.ruleSnapshotJson) as MapTitleRuleSnapshot : null;
        const legacyProjection = row.challengeId && row.targetMapId
          ? await resolveLegacyProjection(row.challengeId, row.targetMapId, snapshotGameplayRevisionId(row))
          : null;
        const titleChallenge = row.challengeId
          ? await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, row.challengeId)).get()
          : null;
        const directProjection = titleChallenge
          ? await snapshotTitleChallenge(titleChallenge.challenge, titleChallenge.title, titleChallenge.challenge.scope === "map" ? row.targetMapId : null, snapshotGameplayRevisionId(row))
          : null;
        const directChallenge = row.challengeId && row.challengeType !== "title_achievement"
          ? await db.select({ challenge: achievementChallenges, title: titleCatalog }).from(achievementChallenges).leftJoin(titleCatalog, eq(achievementChallenges.rewardTitleKey, titleCatalog.key)).where(eq(achievementChallenges.id, row.challengeId)).get()
          : null;
        const directMapSnapshot = directChallenge?.challenge.rewardTitleKey && directChallenge.title
          ? await snapshotMapChallenge(directChallenge.challenge, directChallenge.title, snapshotGameplayRevisionId(row))
          : null;
        const hasStoredVariant = storedSnapshot && Object.prototype.hasOwnProperty.call(storedSnapshot, "mapVariant");
        const snapshot = storedSnapshot
          ? hasStoredVariant
            ? storedSnapshot
            : { ...storedSnapshot, mapVariant: legacyProjection?.mapVariant ?? directProjection?.mapVariant ?? null }
          : legacyProjection ?? directProjection ?? directMapSnapshot;
        const title = snapshot
          ? { ...(await db.select({ key: titleCatalog.key, label: titleCatalog.label, scope: titleCatalog.scope }).from(titleCatalog).where(eq(titleCatalog.key, snapshot.titleKey)).get()), mapVariant: snapshot.mapVariant }
          : titleChallenge
          ? { key: titleChallenge.title.key, label: titleChallenge.title.label, scope: titleChallenge.challenge.scope, mapVariant: titleChallenge.challenge.mapVariant }
          : null;
        const isMapTitleSnapshot = Boolean(snapshot && (snapshot.challengeType === "map_title_achievement" || snapshot.ruleId.startsWith("title-challenge:") || (!snapshot.ruleId.startsWith("challenge:") && title?.scope === "map")));
        const matchChallengeType = isMapTitleSnapshot ? "map_title_achievement" : row.challengeType;
        const requiredMapVariant = snapshot?.mapVariant ?? title?.mapVariant ?? null;
        const titleNameForMatch = row.challengeType === "title_achievement" ? title?.label : undefined;
        const qualityChallengeType = matchChallengeType === "map_title_achievement" && row.difficulty ? "difficulty_completion" : matchChallengeType;
        const quality = assessOcrQuality(qualityChallengeType, result, requiredMapVariant, row.challengeType === "title_achievement");
        if (!quality.accepted) {
          stage = "persist_quality_result";
          await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ qualityGate: quality, decision: "review", masteryOutcome: { status: masteryOutcome.status } }), nextStatus: "ready_for_review", reviewReason: "关键识别字段不足，请人工核对", incrementFailCount: false, allowExistingStatus: Boolean(input.manual), ruleSnapshotJson: snapshot ? JSON.stringify(snapshot) : null, masteryOutcome });
          logOcrEvent("job_completed", { ...context, outcome: "review_required", qualityAccepted: false, durationMs: Date.now() - startedAt });
          return;
        }
        stage = "match_result";
        const { skipped, ...match } = matchOcrResult({ challengeType: matchChallengeType, targetMapName: row.mapName, targetDifficulty: row.difficulty, targetPlayerName: row.playerName, mapName: data.map_name, difficulty: data.difficulty, challengeCompleted: data.challenge_completed, player: data.viewer_player, mapVariant: data.map_variant, requiredMapVariant, titleName: titleNameForMatch, achievementTitles: data.achievement_titles, achievementPanelText: data.achievement_panel_text });
        const matched = Object.values(match).every(Boolean);
        stage = matched ? "persist_automatic_decision" : "persist_result";
        if (matched && snapshot?.titleKey) {
          const mapId = snapshot.mapId;
          const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).innerJoin(bindings, eq(bindings.playerAccountId, playerTitleGrants.playerAccountId)).where(and(eq(bindings.id, row.bindingId), eq(playerTitleGrants.titleKey, snapshot.titleKey), eq(playerTitleGrants.status, "active"), mapId ? eq(playerTitleGrants.mapId, mapId) : isNull(playerTitleGrants.mapId), snapshot.gameplayRevisionId ? eq(playerTitleGrants.gameplayRevisionId, snapshot.gameplayRevisionId) : isNull(playerTitleGrants.gameplayRevisionId))).get();
          const sample = await shouldSampleAutomaticDecision(row.id);
          await persistAutomaticDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality, decision: "automatic", masteryOutcome: { status: masteryOutcome.status } }), grants: [{ snapshot, titleKey: snapshot.titleKey, mapId, slot: snapshot.slot, alreadyOwned: Boolean(existing), existingGrantId: existing?.id ?? null }], sample, masteryOutcome });
        } else if (matched) {
          await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: "matched", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality, decision: "review", masteryOutcome: { status: masteryOutcome.status } }), nextStatus: "ready_for_review", reviewReason: "挑战已匹配，等待管理员核对", incrementFailCount: false, allowExistingStatus: Boolean(input.manual), masteryOutcome });
        } else {
          if (masteryAccepted) {
            await persistMasteryOnlyDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality, decision: "mastery_only", masteryOutcome: { status: masteryOutcome.status } }), masteryOutcome, sample: await shouldSampleAutomaticDecision(row.id) });
          } else {
            await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: "mismatch", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality, decision: "resubmit", masteryOutcome: { status: masteryOutcome.status } }), nextStatus: "resubmission_required", reviewReason: "OCR 结果与目标挑战不匹配，请重新提交", incrementFailCount: true, allowExistingStatus: Boolean(input.manual), ruleSnapshotJson: snapshot ? JSON.stringify(snapshot) : null, masteryOutcome });
          }
        }
        logOcrEvent("job_completed", { ...context, outcome: matched ? "automatic" : "resubmit", qualityAccepted: quality.accepted, durationMs: Date.now() - startedAt });
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
        database.prepare("UPDATE submissions SET status = 'resubmission_required', review_reason = ?, ocr_fail_count = ocr_fail_count + 1, updated_at = ? WHERE id = ? AND status = 'ocr_pending'").bind("OCR 识别失败，请重新提交截图", now(), row.id),
      ]);
      logOcrEvent("job_failure_recorded", { attempt: input.attempt, manual: Boolean(input.manual), requestId, errorCode: input.errorCode });
    },

    async listQqGroupAccess() {
      const groups = await db.select().from(qqGroupAccess).orderBy(desc(qqGroupAccess.updatedAt));
      return groups.map((group) => ({ contractVersion: "1" as const, groupOpenId: group.groupOpenId, displayName: group.displayName, environment: group.environment as "production" | "test", status: group.status as "pending" | "active" | "legacy" | "disconnected", bindEnabled: group.bindEnabled === 1, verifyEnabled: group.verifyEnabled === 1, updatedAt: group.updatedAt }));
    },

    async listAdminPlayers(input) {
      const conditions = [];
      if (input.status) conditions.push(eq(playerAccounts.status, input.status));
      if (input.query) {
        const query = `%${input.query}%`;
        const matchingBindings = await db.select({ playerAccountId: bindings.playerAccountId }).from(bindings).where(and(eq(bindings.status, "active"), or(like(bindings.groupOpenId, query), like(bindings.memberOpenId, query))));
        conditions.push(or(like(playerAccounts.playerId, query), like(playerAccounts.playerName, query), like(playerAccounts.normalizedPlayerName, query), ...(matchingBindings.length ? [inArray(playerAccounts.id, matchingBindings.map((binding) => binding.playerAccountId))] : []))!);
      }
      const condition = conditions.length ? and(...conditions) : undefined;
      const [accounts, [{ total }]] = await Promise.all([
        db.select().from(playerAccounts).where(condition).orderBy(desc(playerAccounts.updatedAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize),
        db.select({ total: count() }).from(playerAccounts).where(condition),
      ]);
      const hasMore = accounts.length > input.pageSize;
      const items = accounts.slice(0, input.pageSize);
      return {
        contractVersion: "1" as const,
        items: await Promise.all(items.map(async (account) => ({
          playerAccountId: account.id,
          playerId: account.playerId,
          playerName: account.playerName,
          status: account.status as "active" | "banned",
          bindingCount: (await db.select().from(bindings).where(and(eq(bindings.playerAccountId, account.id), eq(bindings.status, "active")))).length,
          updatedAt: account.updatedAt,
        }))),
        page: input.page,
        pageSize: input.pageSize,
        total,
        hasMore,
      };
    },

    async getAdminPlayer(input) {
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      const playerBindings = await db.select().from(bindings).where(and(eq(bindings.playerAccountId, account.id), eq(bindings.status, "active"))).orderBy(desc(bindings.createdAt));
      const recentSubmissions = playerBindings.length
        ? await db.select().from(submissions).where(or(...playerBindings.map((binding) => eq(submissions.bindingId, binding.id)))).orderBy(desc(submissions.createdAt)).limit(10)
        : [];
      const recentSubmissionDetails = recentSubmissions.length ? await resolveAdminSubmissionDetails(recentSubmissions) : null;
      const titleGrants = await db.select({ grant: playerTitleGrants, title: titleCatalog, mapName: maps.name })
        .from(playerTitleGrants).innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(playerTitleGrants.mapId, maps.id))
        .where(and(eq(playerTitleGrants.playerAccountId, account.id), eq(playerTitleGrants.status, "active"))).orderBy(desc(playerTitleGrants.grantedAt));
      return {
        contractVersion: "1" as const,
        playerAccountId: account.id,
        playerId: account.playerId,
        playerName: account.playerName,
        status: account.status as "active" | "banned",
        bindingCount: playerBindings.length,
        updatedAt: account.updatedAt,
        bindings: playerBindings.map((binding) => ({ bindingId: binding.id, provider: "qq" as const, groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, createdAt: binding.createdAt })),
        recentSubmissions: recentSubmissions.map((submission) => ({
          submissionId: submission.id,
          status: submission.status as never,
          mapName: submission.mapName,
          challengeId: submission.challengeId ?? undefined,
          difficulty: submission.difficulty ?? undefined,
          reason: submission.reviewReason ?? undefined,
          challenge: submission.challengeId ? recentSubmissionDetails?.challenges.get(submission.challengeId) ?? null : null,
          ...playerMasterySubmissionOutcomeFields(recentSubmissionDetails?.masteryOutcomes.get(submission.id)),
          createdAt: submission.createdAt,
          updatedAt: submission.updatedAt,
        })),
        titleGrants: titleGrants.map(({ grant, title, mapName }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon as never, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: grant.mapId ? "map" as const : "global" as const, mapName: mapName ?? undefined, slot: grant.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt, sourceType: grant.sourceType as "historical" | "submission" | "manual" | "automatic", grantedBy: grant.grantedBy })),
      };
    },

    async listAdminReviews(input: AdminReviewQuery, _auth: AuthContext) {
      const clauses: string[] = [];
      const values: unknown[] = [];
      const add = (clause: string, value: unknown) => { clauses.push(` AND ${clause}`); values.push(value); };
      if (input.targetType) add("r.target_type = ?", input.targetType);
      if (input.targetId) add("r.target_id = ?", input.targetId);
      if (input.status) add("r.status = ?", input.status);
      if (input.commentStatus) add("r.comment_status = ?", input.commentStatus);
      if (input.rating) add("r.rating = ?", input.rating);
      if (input.from !== undefined) add("r.created_at >= ?", input.from);
      if (input.to !== undefined) add("r.created_at <= ?", input.to);
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize)));
      const where = clauses.join("");
      const [totalRow, result] = await Promise.all([
        database.prepare(`SELECT COUNT(*) AS total ${adminReviewQuery}${where}`).bind(...values).first<{ total: number }>(),
        database.prepare(`${adminReviewSelect}${where} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`).bind(...values, pageSize + 1, (page - 1) * pageSize).all<AdminReviewRow>(),
      ]);
      const hasMore = result.results.length > pageSize;
      return {
        contractVersion: "1" as const,
        items: result.results.slice(0, pageSize).map(asAdminReview),
        page,
        pageSize,
        total: Number(totalRow?.total ?? 0),
        hasMore,
      };
    },

    async getAdminReview(input: { reviewId: string }, _auth: AuthContext): Promise<AdminReviewDetail> {
      const row = await database.prepare(`${adminReviewSelect} AND r.id = ?`).bind(input.reviewId).first<AdminReviewRow>();
      if (!row) throw new Error("REVIEW_NOT_FOUND");
      const auditRows = await database.prepare(`SELECT operation, actor_type, actor_id, payload_json, created_at FROM audit_events WHERE entity_type = 'review' AND entity_id = ? ORDER BY created_at DESC LIMIT 50`).bind(input.reviewId).all<{
        operation: string;
        actor_type: string;
        actor_id: string;
        payload_json: string;
        created_at: number;
      }>();
      return {
        contractVersion: "1",
        review: asAdminReview(row),
        audit: auditRows.results.map((audit) => {
          let reason: string | null = null;
          try {
            const payload = JSON.parse(audit.payload_json) as { reason?: unknown };
            if (typeof payload.reason === "string") reason = payload.reason;
          } catch { /* Ignore malformed historical audit payloads. */ }
          return { operation: audit.operation, actorType: audit.actor_type, actorId: audit.actor_id, reason, createdAt: audit.created_at };
        }),
      };
    },

    async setAdminPlayerStatus(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.player.status", idempotencyKey, input);
      if (replay) return;
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      const timestamp = now();
      await db.update(playerAccounts).set({ status: input.status, bannedAt: input.status === "banned" ? timestamp : null, bannedBy: input.status === "banned" ? auth.subject : null, banReason: input.status === "banned" ? input.reason ?? null : null, updatedAt: timestamp }).where(eq(playerAccounts.id, input.playerAccountId));
      if (input.status === "banned") {
        const accountBindings = await db.select({ memberOpenId: bindings.memberOpenId }).from(bindings).where(eq(bindings.playerAccountId, input.playerAccountId));
        if (accountBindings.length) await db.delete(qqSessions).where(or(...accountBindings.map((binding) => eq(qqSessions.memberOpenId, binding.memberOpenId))));
      }
      await recordIdempotency(db, auth.subject, "admin.player.status", idempotencyKey, input, {});
      await recordAudit(db, auth, `admin.player.${input.status}`, "player_account", input.playerAccountId, { status: input.status, reason: input.reason ?? null });
    },

    async updateAdminPlayerIdentity(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.player.identity", idempotencyKey, input);
      if (replay) return;
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      const playerName = input.playerName.trim();
      const normalizedPlayerName = normalizePlayerName(playerName);
      const conflict = await db.select({ id: playerAccounts.id }).from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, normalizedPlayerName), eq(playerAccounts.playerId, account.playerId), ne(playerAccounts.id, account.id))).get();
      if (conflict) throw new Error("PLAYER_BATTLETAG_CONFLICT");
      const timestamp = now();
      await db.update(playerAccounts).set({ playerName, normalizedPlayerName, updatedAt: timestamp }).where(eq(playerAccounts.id, input.playerAccountId));
      await recordIdempotency(db, auth.subject, "admin.player.identity", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.player.identity.update", "player_account", input.playerAccountId, { previousPlayerName: account.playerName, playerName, playerId: account.playerId });
    },

    async removeAdminBinding(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.binding.remove", idempotencyKey, input);
      if (replay) return;
      const binding = await db.select().from(bindings).where(eq(bindings.id, input.bindingId)).get();
      if (!binding) throw new Error("BINDING_NOT_FOUND");
      await db.delete(qqSessions).where(eq(qqSessions.memberOpenId, binding.memberOpenId));
      await db.update(bindings).set({ status: "revoked", revokedAt: now(), revokedBy: auth.subject }).where(eq(bindings.id, input.bindingId));
      await recordIdempotency(db, auth.subject, "admin.binding.remove", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.binding.remove", "binding", input.bindingId, { playerAccountId: binding.playerAccountId });
    },

    async upsertQqGroupAccess(input: QqGroupAccessRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<void>(db, auth.subject, "qq.group_access.update", idempotencyKey, input);
      if (replay !== null) return;
      const timestamp = now();
      const outboxEventId = crypto.randomUUID();
      const requestHash = await hashRequest(input);
      const idempotency = db.insert(idempotencyKeys).values({ id: `${auth.subject}:qq.group_access.update:${idempotencyKey}`, actorId: auth.subject, operation: "qq.group_access.update", requestHash, responseJson: JSON.stringify({}), createdAt: timestamp });
      const audit = db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.group_access.update", entityType: "qq_group_access", entityId: input.groupOpenId, payloadJson: JSON.stringify({ displayName: input.displayName, environment: input.environment, status: input.status, bindEnabled: input.bindEnabled, verifyEnabled: input.verifyEnabled }), createdAt: timestamp });
      const outbox = db.insert(qqGroupPolicyOutbox).values({ id: outboxEventId, createdAt: timestamp });
      if (input.status === "active") {
        await db.batch([
          db.update(qqGroupAccess).set({ status: "legacy", bindEnabled: 0, verifyEnabled: 0, lifecycleOccurredAt: timestamp, updatedAt: timestamp }).where(and(eq(qqGroupAccess.status, "active"), ne(qqGroupAccess.groupOpenId, input.groupOpenId))),
          db.insert(qqGroupAccess).values({ groupOpenId: input.groupOpenId, displayName: input.displayName, environment: input.environment, status: "active", bindEnabled: input.bindEnabled ? 1 : 0, verifyEnabled: input.verifyEnabled ? 1 : 0, lifecycleOccurredAt: timestamp, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: qqGroupAccess.groupOpenId, set: { displayName: input.displayName, environment: input.environment, status: "active", bindEnabled: input.bindEnabled ? 1 : 0, verifyEnabled: input.verifyEnabled ? 1 : 0, lifecycleOccurredAt: timestamp, updatedAt: timestamp } }),
          idempotency,
          audit,
          outbox,
        ]);
      } else {
        await db.batch([
          db.insert(qqGroupAccess).values({ groupOpenId: input.groupOpenId, displayName: input.displayName, environment: input.environment, status: input.status, bindEnabled: input.bindEnabled ? 1 : 0, verifyEnabled: input.verifyEnabled ? 1 : 0, lifecycleOccurredAt: timestamp, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: qqGroupAccess.groupOpenId, set: { displayName: input.displayName, environment: input.environment, status: input.status, bindEnabled: input.bindEnabled ? 1 : 0, verifyEnabled: input.verifyEnabled ? 1 : 0, lifecycleOccurredAt: timestamp, updatedAt: timestamp } }),
          idempotency,
          audit,
          outbox,
        ]);
      }
      await dispatchPendingQqGroupPolicyEvents();
    },

    async registerQqGroup(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<void>(db, auth.subject, "qq.group.register", idempotencyKey, input);
      if (replay !== null) return;
      const timestamp = now();
      const existing = await db.select().from(qqGroupAccess).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)).get();
      const requestHash = await hashRequest(input);
      const idempotency = db.insert(idempotencyKeys).values({ id: `${auth.subject}:qq.group.register:${idempotencyKey}`, actorId: auth.subject, operation: "qq.group.register", requestHash, responseJson: JSON.stringify({}), createdAt: timestamp });
      const audit = db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.group.register", entityType: "qq_group_access", entityId: input.groupOpenId, payloadJson: JSON.stringify({ status: input.status }), createdAt: timestamp });
      const shouldNotify = input.status === "disconnected" && existing?.status === "active" && input.occurredAt > existing.lifecycleOccurredAt;
      const statements: [any, ...any[]] = [idempotency, audit];
      if (!existing) {
        statements.unshift(db.insert(qqGroupAccess).values({ groupOpenId: input.groupOpenId, displayName: "", environment: "production", status: input.status, bindEnabled: 0, verifyEnabled: 0, lifecycleOccurredAt: input.occurredAt, createdAt: timestamp, updatedAt: timestamp }));
      } else if (input.occurredAt > existing.lifecycleOccurredAt) {
        if (input.status === "disconnected") {
          statements.unshift(db.update(qqGroupAccess).set({ status: "disconnected", bindEnabled: 0, verifyEnabled: 0, lifecycleOccurredAt: input.occurredAt, updatedAt: timestamp }).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)));
        } else if (existing.status === "disconnected") {
          statements.unshift(db.update(qqGroupAccess).set({ status: "pending", lifecycleOccurredAt: input.occurredAt, updatedAt: timestamp }).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)));
        }
      }
      if (shouldNotify) statements.push(db.insert(qqGroupPolicyOutbox).values({ id: crypto.randomUUID(), createdAt: timestamp }));
      await db.batch(statements);
      if (shouldNotify) await dispatchPendingQqGroupPolicyEvents();
    },

    async markQqGroupPolicyEventDelivered(input) {
      await db.update(qqGroupPolicyOutbox).set({ deliveredAt: now() }).where(eq(qqGroupPolicyOutbox.id, input.eventId));
    },

    async createQqLoginAttempt(input: QqLoginAttemptRequest) {
      const timestamp = now();
      const attemptId = crypto.randomUUID();
      const attemptToken = randomToken();
      const code = randomCode();
      await db.insert(qqLoginAttempts).values({ id: attemptId, tokenHash: await hashRequest(attemptToken), codeHash: await hashRequest(code), status: "pending", expiresAt: timestamp + loginTtlMs, createdAt: timestamp });
      return { contractVersion: "1" as const, attemptId, attemptToken, code, expiresAt: timestamp + loginTtlMs };
    },

    async getQqLoginStatus(input) {
      const attempt = await db.select().from(qqLoginAttempts).where(eq(qqLoginAttempts.id, input.attemptId)).get();
      if (!attempt) throw new Error("LOGIN_ATTEMPT_NOT_FOUND");
      if (attempt.tokenHash !== await hashRequest(input.attemptToken)) throw new Error("LOGIN_ATTEMPT_FORBIDDEN");
      if (attempt.status === "pending" && attempt.expiresAt <= now()) {
        await db.update(qqLoginAttempts).set({ status: "expired" }).where(eq(qqLoginAttempts.id, attempt.id));
        return { contractVersion: "1" as const, status: "expired" as const };
      }
      if (attempt.status !== "verified") return { contractVersion: "1" as const, status: attempt.status as "pending" | "expired" };
      if (!attempt.groupOpenId || !attempt.memberOpenId || !attempt.environment) return { contractVersion: "1" as const, status: "expired" as const };
      if (attempt.sessionIssuedAt) return { contractVersion: "1" as const, status: "verified" as const, environment: attempt.environment as "production" | "test" };
      const sessionToken = randomToken();
      const timestamp = now();
      await db.insert(qqSessions).values({ id: crypto.randomUUID(), attemptId: attempt.id, groupOpenId: attempt.groupOpenId, memberOpenId: attempt.memberOpenId, environment: attempt.environment, tokenHash: await hashRequest(sessionToken), expiresAt: timestamp + sessionTtlMs, createdAt: timestamp });
      await db.update(qqLoginAttempts).set({ sessionTokenHash: await hashRequest(sessionToken), sessionIssuedAt: timestamp }).where(eq(qqLoginAttempts.id, attempt.id));
      return { contractVersion: "1" as const, status: "verified" as const, environment: attempt.environment as "production" | "test", sessionToken };
    },

    async verifyQqLogin(input: QqLoginVerifyRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["verifyQqLogin"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.login.verify", idempotencyKey, input);
      if (replay) return replay;
      const attempt = await db.select().from(qqLoginAttempts).where(and(eq(qqLoginAttempts.codeHash, await hashRequest(input.code)), eq(qqLoginAttempts.status, "pending"))).get();
      if (!attempt) throw new Error("LOGIN_CODE_INVALID");
      if (attempt.expiresAt <= now()) {
        await db.update(qqLoginAttempts).set({ status: "expired" }).where(eq(qqLoginAttempts.id, attempt.id));
        throw new Error("LOGIN_CODE_EXPIRED");
      }
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"), eq(qqGroupAccess.verifyEnabled, 1))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, input.provider), eq(bindings.memberOpenId, input.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("LOGIN_BINDING_REQUIRED");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      await db.update(qqLoginAttempts).set({ status: "verified", groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, environment: group.environment, messageId: input.messageId, verifiedAt: now() }).where(eq(qqLoginAttempts.id, attempt.id));
      const response = { contractVersion: "1" as const, status: "verified" as const, environment: group.environment as "production" | "test" };
      await recordIdempotency(db, auth.subject, "qq.login.verify", idempotencyKey, input, response);
      await recordAudit(db, auth, "qq.login.verify", "qq_login_attempt", attempt.id, { environment: group.environment });
      return response;
    },

    async getCurrentPlayerMastery(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      const mapId = input.mapId?.trim() || undefined;
      const gameplayRevisionId = input.gameplayRevisionId?.trim() || undefined;
      const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
      const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0 ? Math.min(50, input.pageSize) : 20;
      const [activeRunRows, history] = await Promise.all([
        loadActiveMasteryRuns({ playerAccountId: access.player.id, mapId, gameplayRevisionId, currentOnly: !gameplayRevisionId }),
        loadPlayerMasteryHistory({ playerAccountId: access.player.id, mapId, gameplayRevisionId, page, pageSize }),
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
        runs: history.runs.map(({ run }) => playerMasteryRunView(run, lifecycleFor(run.gameplayRevisionId))),
        page,
        pageSize,
        total: history.total,
        hasMore: page * pageSize < history.total,
      };
    },

    async getCurrentPlayer(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      const { binding, player } = access;
      const recentSubmissions = await db.select({ submissionId: submissions.id, status: submissions.status, mapName: submissions.mapName, challengeId: submissions.challengeId, difficulty: submissions.difficulty, reason: submissions.reviewReason, createdAt: submissions.createdAt, updatedAt: submissions.updatedAt })
        .from(submissions)
        .where(eq(submissions.bindingId, binding.id))
        .orderBy(desc(submissions.createdAt))
        .limit(5);
      const masteryOutcomes = await loadMasterySubmissionOutcomes(recentSubmissions.map((submission) => submission.submissionId));
      return {
        contractVersion: "1" as const,
        player: { playerId: player.playerId, playerName: player.playerName, bindingStatus: "bound" as const, isAdmin: player.isAdmin === 1 },
        recentSubmissions: recentSubmissions.map((submission) => {
          const masteryOutcome = masteryOutcomes.get(submission.submissionId);
          return { submissionId: submission.submissionId, status: submission.status as never, mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: masteryOutcome?.status === "conflict" ? undefined : submission.reason ?? undefined, ...playerMasterySubmissionOutcomeFields(masteryOutcome), createdAt: submission.createdAt, updatedAt: submission.updatedAt };
        }),
      };
    },

    async logoutPortalSession(input) {
      await db.delete(qqSessions).where(eq(qqSessions.tokenHash, await hashRequest(input.sessionToken)));
    },

    async listLocalDevAccounts() {
      const accounts = await db.select().from(playerAccounts).where(or(eq(playerAccounts.playerId, "local-player"), eq(playerAccounts.playerId, "local-admin"))).orderBy(playerAccounts.playerId);
      return accounts.map((account) => ({ accountId: account.id, playerId: account.playerId, playerName: account.playerName, isAdmin: account.isAdmin === 1 }));
    },

    async createLocalDevSession(input) {
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.accountId)).get();
      if (!account || !["local-player", "local-admin"].includes(account.playerId)) throw new Error("LOCAL_ACCOUNT_NOT_FOUND");
      const binding = await db.select().from(bindings).where(eq(bindings.playerAccountId, account.id)).get();
      if (!binding) throw new Error("LOCAL_ACCOUNT_NOT_FOUND");
      const timestamp = now();
      const attemptId = `local-${account.playerId}`;
      const sessionToken = randomToken();
      const attemptTokenHash = await hashRequest(`local-attempt-${account.playerId}`);
      const codeHash = await hashRequest(`LOCAL-${account.playerId}`);
      const sessionTokenHash = await hashRequest(sessionToken);
      await db.insert(qqLoginAttempts).values({ id: attemptId, tokenHash: attemptTokenHash, codeHash, status: "verified", groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, environment: "test", sessionTokenHash, sessionIssuedAt: timestamp, expiresAt: timestamp + sessionTtlMs, createdAt: timestamp, verifiedAt: timestamp }).onConflictDoUpdate({ target: qqLoginAttempts.id, set: { groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, environment: "test", sessionTokenHash, sessionIssuedAt: timestamp, expiresAt: timestamp + sessionTtlMs, status: "verified", verifiedAt: timestamp } });
      await db.delete(qqSessions).where(eq(qqSessions.attemptId, attemptId));
      await db.insert(qqSessions).values({ id: crypto.randomUUID(), attemptId, groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, environment: "test", tokenHash: sessionTokenHash, expiresAt: timestamp + sessionTtlMs, createdAt: timestamp });
      return { sessionToken };
    },

    async createAdminBindingInvite(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["createAdminBindingInvite"]> extends Promise<infer T> ? T : never>(db, auth.subject, "admin.binding_invite.create", idempotencyKey, input);
      if (replay) return replay;
      const historicalIds = input.historicalTitleGrantIds ?? [];
      const historicalRows = historicalIds.length ? await db.select({ id: historicalTitleGrants.id, grantId: playerTitleGrants.id }).from(historicalTitleGrants).leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id))).where(inArray(historicalTitleGrants.id, historicalIds)) : [];
      if (historicalRows.length !== historicalIds.length || historicalRows.some((row) => row.grantId)) throw new Error("HISTORICAL_TITLE_GRANT_NOT_AVAILABLE");
      const timestamp = now(); const code = randomInviteCode(); const inviteId = crypto.randomUUID();
      const response = { contractVersion: "1" as const, inviteId, code, playerName: input.playerName, playerId: input.playerId, expiresAt: timestamp + inviteTtlMs, historicalMigration: { status: historicalIds.length ? "authorized" as const : "not_requested" as const, requestedCount: historicalIds.length, completedCount: 0, conflictCount: 0, retryCount: 0 } };
      await db.batch([
        db.insert(bindingInvites).values({ id: inviteId, codeHash: await hashRequest(code), codeCiphertext: await encryptBindingInviteCode(code, bindingInviteCodeEncryptionKey), playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), playerId: input.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: response.expiresAt }),
        ...historicalIds.map((historicalTitleGrantId) => db.insert(bindingInviteHistoricalTitleGrants).values({ id: crypto.randomUUID(), inviteId, historicalTitleGrantId, authorizedBy: auth.subject, status: "authorized", createdAt: timestamp })),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:admin.binding_invite.create:${idempotencyKey}`, actorId: auth.subject, operation: "admin.binding_invite.create", requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
        db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.binding_invite.create", entityType: "binding_invite", entityId: inviteId, payloadJson: JSON.stringify({ playerId: input.playerId, historicalTitleGrantIds: historicalIds, historicalTitleGrantCount: historicalIds.length }), createdAt: timestamp }),
      ] as [any, ...any[]]);
      return response;
    },

    async createAdminBindingInviteBatch(input, auth, idempotencyKey) {
      const operation = "admin.binding_invite.batch_create";
      const replay = await replayOrConflict<ReturnType<PlatformServices["createAdminBindingInviteBatch"]> extends Promise<infer T> ? T : never>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const timestamp = now();
      const codes = new Set<string>();
      while (codes.size < input.invitations.length) codes.add(randomInviteCode());
      const prepared = await Promise.all(input.invitations.map(async (invitation, index) => {
        const code = [...codes][index]!;
        const inviteId = crypto.randomUUID();
        const historicalIds = invitation.historicalTitleGrantIds ?? [];
        const historicalRows = historicalIds.length ? await db.select({ id: historicalTitleGrants.id, grantId: playerTitleGrants.id }).from(historicalTitleGrants).leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id))).where(inArray(historicalTitleGrants.id, historicalIds)) : [];
        if (historicalRows.length !== historicalIds.length || historicalRows.some((row) => row.grantId)) throw new Error("HISTORICAL_TITLE_GRANT_NOT_AVAILABLE");
        return {
          invite: { id: inviteId, codeHash: await hashRequest(code), codeCiphertext: await encryptBindingInviteCode(code, bindingInviteCodeEncryptionKey), playerName: invitation.playerName, normalizedPlayerName: normalizePlayerName(invitation.playerName), playerId: invitation.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: timestamp + inviteTtlMs },
          historicalIds,
          response: { contractVersion: "1" as const, inviteId, code, playerName: invitation.playerName, playerId: invitation.playerId, expiresAt: timestamp + inviteTtlMs, historicalMigration: { status: historicalIds.length ? "authorized" as const : "not_requested" as const, requestedCount: historicalIds.length, completedCount: 0, conflictCount: 0, retryCount: 0 } },
        };
      }));
      const response = { contractVersion: "1" as const, items: prepared.map(({ response }) => response) };
      await db.batch([
        ...prepared.map(({ invite }) => db.insert(bindingInvites).values(invite)),
        ...prepared.flatMap(({ invite, historicalIds }) => historicalIds.map((historicalTitleGrantId) => db.insert(bindingInviteHistoricalTitleGrants).values({ id: crypto.randomUUID(), inviteId: invite.id, historicalTitleGrantId, authorizedBy: auth.subject, status: "authorized", createdAt: timestamp }))),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:${operation}:${idempotencyKey}`, actorId: auth.subject, operation, requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
        ...prepared.map(({ response: invite, historicalIds }) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation, entityType: "binding_invite", entityId: invite.inviteId, payloadJson: JSON.stringify({ playerId: invite.playerId, historicalTitleGrantIds: historicalIds, historicalTitleGrantCount: historicalIds.length }), createdAt: timestamp })),
      ] as [any, ...any[]]);
      return response;
    },

    async listAdminBindingInvites() {
      const timestamp = now();
      const rows = await db.select().from(bindingInvites).orderBy(desc(bindingInvites.createdAt)).limit(100);
      const migrationRows = await db.select().from(bindingInviteHistoricalTitleGrants);
      const claims = await db.select({ inviteId: bindingClaims.inviteId, status: bindingClaims.status }).from(bindingClaims);
      return {
        contractVersion: "1" as const,
        items: rows.map((invite) => ({
          inviteId: invite.id,
          playerName: invite.playerName,
          playerId: invite.playerId,
          status: (invite.revokedAt ? "revoked" : invite.redeemedAt ? "redeemed" : invite.expiresAt <= timestamp ? "expired" : "active") as "active" | "redeemed" | "expired" | "revoked",
          codeAvailable: Boolean(invite.codeCiphertext),
          createdAt: invite.createdAt,
          expiresAt: invite.expiresAt,
          ...(invite.redeemedAt ? { redeemedAt: invite.redeemedAt } : {}),
          historicalMigration: summarizeHistoricalMigration(migrationRows.filter((row) => row.inviteId === invite.id), invite, claims.find((claim) => claim.inviteId === invite.id)?.status, timestamp),
        })),
      };
    },

    async retryHistoricalTitleMigration(input, auth, idempotencyKey) {
      const operation = "admin.binding_invite.historical_migration.retry";
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      const claim = await db.select().from(bindingClaims).where(and(eq(bindingClaims.inviteId, input.inviteId), eq(bindingClaims.status, "approved"))).orderBy(desc(bindingClaims.decidedAt)).get();
      if (!invite || !claim?.memberOpenId || invite.revokedAt) throw new Error("HISTORICAL_MIGRATION_NOT_READY");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, claim.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("HISTORICAL_MIGRATION_NOT_READY");
      await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: binding.playerAccountId, claimId: claim.id, auth, mode: "retry" });
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, {});
      await recordAudit(db, auth, operation, "binding_invite", invite.id, { claimId: claim.id, playerAccountId: binding.playerAccountId });
    },

    async getAdminBindingInviteCode(input, auth) {
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      if (!invite || !invite.codeCiphertext || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= now()) throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
      const code = await decryptBindingInviteCode(invite.codeCiphertext, bindingInviteCodeEncryptionKey);
      await recordAudit(db, auth, "admin.binding_invite.reveal", "binding_invite", invite.id, {});
      return { contractVersion: "1" as const, inviteId: invite.id, code };
    },

    async listAdminBindings() {
      const rows = await db.select({ binding: bindings, account: playerAccounts })
        .from(bindings)
        .innerJoin(playerAccounts, eq(bindings.playerAccountId, playerAccounts.id))
        .where(eq(bindings.status, "active"))
        .orderBy(desc(bindings.createdAt));
      return {
        contractVersion: "1" as const,
        items: rows.map(({ binding, account }) => ({ bindingId: binding.id, playerName: account.playerName, playerId: account.playerId, groupOpenId: binding.groupOpenId, memberOpenId: binding.memberOpenId, createdAt: binding.createdAt })),
      };
    },

    async revokeAdminBindingInvite(input, auth, idempotencyKey) {
      const operation = "admin.binding_invite.revoke";
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return;
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      if (!invite || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= now()) throw new Error("BINDING_INVITE_NOT_REVOCABLE");
      const timestamp = now();
      await db.update(bindingInvites).set({ revokedAt: timestamp, revokedBy: auth.subject }).where(eq(bindingInvites.id, invite.id));
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, {});
      await recordAudit(db, auth, operation, "binding_invite", invite.id, { reason: input.reason ?? null });
    },

    async redeemBindingInvite(input) {
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.codeHash, await hashRequest(input.code))).get();
      if (!invite || invite.expiresAt <= now() || invite.redeemedAt || invite.revokedAt) throw new Error("INVITE_INVALID");
      const pending = await db.select().from(bindingClaims).where(and(eq(bindingClaims.inviteId, invite.id), eq(bindingClaims.status, "pending_confirmation"))).get();
      if (pending) {
        if (pending.expiresAt > now()) throw new Error("INVITE_INVALID");
      }
      const timestamp = now(); const claimId = crypto.randomUUID(); const claimToken = randomToken(); const code = randomCode();
      const insertStmt = db.insert(bindingClaims).values({ id: claimId, inviteId: invite.id, tokenHash: await hashRequest(claimToken), codeHash: await hashRequest(code), playerName: invite.playerName, normalizedPlayerName: invite.normalizedPlayerName, playerId: invite.playerId, status: "pending_confirmation", expiresAt: timestamp + bindingClaimTtlMs, createdAt: timestamp });
      try {
        if (pending) {
          await db.batch([
            db.update(bindingClaims).set({ status: "expired" }).where(and(eq(bindingClaims.id, pending.id), eq(bindingClaims.status, "pending_confirmation"))),
            insertStmt,
          ]);
        } else {
          await db.batch([insertStmt]);
        }
      } catch {
        throw new Error("INVITE_INVALID");
      }
      return { contractVersion: "1" as const, claimId, claimToken, code, playerName: invite.playerName, playerId: invite.playerId, expiresAt: timestamp + bindingClaimTtlMs };
    },

    async getBindingClaimStatus(input) {
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim) throw new Error("BINDING_CLAIM_NOT_FOUND");
      if (claim.tokenHash !== await hashRequest(input.claimToken)) throw new Error("BINDING_CLAIM_FORBIDDEN");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      const migration = invite ? toPublicHistoricalMigration(summarizeHistoricalMigration(await db.select().from(bindingInviteHistoricalTitleGrants).where(eq(bindingInviteHistoricalTitleGrants.inviteId, invite.id)), invite, claim.status, now())) : { status: "not_requested" as const, requestedCount: 0, restoredCount: 0 };
      if (claim.status === "pending_confirmation" && claim.expiresAt <= now()) {
        await db.update(bindingClaims).set({ status: "expired" }).where(eq(bindingClaims.id, claim.id));
        return { contractVersion: "1" as const, status: "expired" as const, expiresAt: claim.expiresAt, historicalMigration: { ...migration, status: "cancelled" as const } };
      }
      return { contractVersion: "1" as const, status: claim.status as "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired", expiresAt: claim.expiresAt, historicalMigration: claim.status === "rejected" || claim.status === "expired" ? { ...migration, status: "cancelled" as const } : migration };
    },

    async exchangeBindingClaimSession(input) {
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim) throw new Error("BINDING_CLAIM_NOT_FOUND");
      if (claim.tokenHash !== await hashRequest(input.claimToken)) throw new Error("BINDING_CLAIM_FORBIDDEN");
      if (claim.status !== "approved" || !claim.memberOpenId || !claim.groupOpenId) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, claim.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      const account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.id, binding.playerAccountId), eq(playerAccounts.status, "active"))).get();
      if (!account) throw new Error("BINDING_CLAIM_NOT_COMPLETE");
      const group = await db.select().from(qqGroupAccess).where(eq(qqGroupAccess.groupOpenId, claim.groupOpenId)).get();
      const sessionToken = await bindingClaimSessionToken(input.claimToken);
      const timestamp = now();
      const sessionId = `binding-claim:${claim.id}`;
      const existing = await db.select().from(qqSessions).where(eq(qqSessions.id, sessionId)).get();
      if (existing?.expiresAt && existing.expiresAt <= timestamp) {
        await db.update(qqSessions).set({ expiresAt: timestamp + sessionTtlMs }).where(eq(qqSessions.id, sessionId));
      } else if (!existing) {
        try {
          await db.insert(qqSessions).values({ id: sessionId, attemptId: claim.id, groupOpenId: claim.groupOpenId, memberOpenId: claim.memberOpenId, environment: group?.environment ?? "production", tokenHash: await hashRequest(sessionToken), expiresAt: timestamp + sessionTtlMs, createdAt: timestamp });
        } catch {
          const raced = await db.select().from(qqSessions).where(eq(qqSessions.id, sessionId)).get();
          if (!raced) throw new Error("BINDING_CLAIM_SESSION_FAILED");
        }
      }
      return { contractVersion: "1" as const, status: "authenticated" as const, sessionToken };
    },

    async verifyBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["verifyBindingClaim"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.binding_claim.verify", idempotencyKey, input); if (replay) return replay;
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.codeHash, await hashRequest(input.code))).get();
      if (!claim) throw new Error("BINDING_CLAIM_CODE_INVALID");
      const response = { contractVersion: "1" as const, status: "verified" as const, environment: "test" as const };
      if (claim.status !== "pending_confirmation") {
        if (["pending_review", "approved"].includes(claim.status) && claim.memberOpenId === input.memberOpenId && claim.groupOpenId === input.groupOpenId) return response;
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      if (claim.expiresAt <= now()) {
        await db.update(bindingClaims).set({ status: "expired" }).where(eq(bindingClaims.id, claim.id));
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"), eq(qqGroupAccess.verifyEnabled, 1))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      if (!invite || invite.redeemedAt || invite.revokedAt || invite.expiresAt <= now()) throw new Error("INVITE_INVALID");
      const timestamp = now();
      const verifiedResponse = { ...response, environment: group.environment as "production" | "test" };

      const idempotencyStatement = db.insert(idempotencyKeys).values({
        id: `${auth.subject}:qq.binding_claim.verify:${idempotencyKey}`,
        actorId: auth.subject,
        operation: "qq.binding_claim.verify",
        requestHash: await hashRequest(input),
        responseJson: JSON.stringify(verifiedResponse),
        createdAt: timestamp,
      });

      const auditStatement = db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        actorType: auth.actorType,
        actorId: auth.subject,
        operation: "qq.binding_claim.verify",
        entityType: "binding_claim",
        entityId: claim.id,
        payloadJson: JSON.stringify({ inviteId: invite.id, groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId }),
        createdAt: timestamp,
      });

      const account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, claim.normalizedPlayerName), eq(playerAccounts.playerId, claim.playerId))).get();
      const targetBinding = account ? await db.select().from(bindings).where(and(eq(bindings.playerAccountId, account.id), eq(bindings.status, "active"))).get() : undefined;
      const memberBindings = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, input.memberOpenId), eq(bindings.status, "active")));
      const cleanFirstBinding = (!account || account.status === "active") && !targetBinding && memberBindings.length === 0;

      if (cleanFirstBinding) {
        const playerAccount = account ?? { id: crypto.randomUUID(), playerId: claim.playerId, playerName: claim.playerName, normalizedPlayerName: claim.normalizedPlayerName, isAdmin: 0, status: "active" as const, bannedAt: null, bannedBy: null, banReason: null, createdAt: timestamp, updatedAt: timestamp };
        const identityId = crypto.randomUUID();
        const bindingId = crypto.randomUUID();
        await db.batch([
          db.update(bindingClaims).set({ status: "approved", memberOpenId: input.memberOpenId, groupOpenId: input.groupOpenId, messageId: input.messageId, verifiedAt: timestamp, decidedAt: timestamp, decidedBy: auth.subject }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_confirmation"))),
          db.update(bindingInvites).set({ redeemedAt: timestamp }).where(and(eq(bindingInvites.id, invite.id), isNull(bindingInvites.redeemedAt))),
          ...(!account ? [db.insert(playerAccounts).values(playerAccount)] : []),
          db.insert(identities).values({ id: identityId, createdAt: timestamp, updatedAt: timestamp }),
          db.insert(bindings).values({ id: bindingId, identityId, playerAccountId: playerAccount.id, provider: "qq", groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, status: "active", createdAt: timestamp }),
          idempotencyStatement,
          db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "qq.binding_claim.auto_activate", entityType: "binding_claim", entityId: claim.id, payloadJson: JSON.stringify({ inviteId: invite.id, groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, operationType: "initial_binding", bindingId }), createdAt: timestamp }),
        ] as [any, ...any[]]);
        await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: playerAccount.id, claimId: claim.id, auth, mode: "automatic" });
        return verifiedResponse;
      }

      await db.batch([
        db.update(bindingClaims).set({ status: "pending_review", memberOpenId: input.memberOpenId, groupOpenId: input.groupOpenId, messageId: input.messageId, verifiedAt: timestamp }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_confirmation"))),
        db.update(bindingInvites).set({ redeemedAt: timestamp }).where(and(eq(bindingInvites.id, invite.id), isNull(bindingInvites.redeemedAt))),
        idempotencyStatement,
        auditStatement,
      ]);

      return verifiedResponse;
    },

    async listAdminBindingClaims() {
      const timestamp = now();
      const rows = await db.select({ claim: bindingClaims, invite: bindingInvites, account: playerAccounts }).from(bindingClaims).innerJoin(bindingInvites, eq(bindingClaims.inviteId, bindingInvites.id)).leftJoin(playerAccounts, and(eq(playerAccounts.normalizedPlayerName, bindingClaims.normalizedPlayerName), eq(playerAccounts.playerId, bindingClaims.playerId))).orderBy(desc(bindingClaims.createdAt));
      const expiredIds = rows.filter(({ claim }) => claim.status === "pending_confirmation" && claim.expiresAt <= timestamp).map(({ claim }) => claim.id);
      if (expiredIds.length > 0) {
        await db.update(bindingClaims).set({ status: "expired" }).where(and(eq(bindingClaims.status, "pending_confirmation"), lte(bindingClaims.expiresAt, timestamp)));
      }

      const activeBindings = await db
        .select({ binding: bindings, account: playerAccounts })
        .from(bindings)
        .leftJoin(playerAccounts, eq(bindings.playerAccountId, playerAccounts.id))
        .where(eq(bindings.status, "active"));

      const activeSessions = await db.select({ memberOpenId: qqSessions.memberOpenId }).from(qqSessions);
      const sessionCountByMember = new Map<string, number>();
      for (const s of activeSessions) {
        sessionCountByMember.set(s.memberOpenId, (sessionCountByMember.get(s.memberOpenId) ?? 0) + 1);
      }

      const items = rows.map(({ claim, invite, account }) => {
        const status = (claim.status === "pending_confirmation" && claim.expiresAt <= timestamp ? "expired" : claim.status) as "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired";

        const targetBindingRow = account ? activeBindings.find((b) => b.binding.playerAccountId === account.id) : undefined;
        const targetAccountBinding = targetBindingRow
          ? { bindingId: targetBindingRow.binding.id, memberOpenId: targetBindingRow.binding.memberOpenId, ...(targetBindingRow.binding.groupOpenId ? { groupOpenId: targetBindingRow.binding.groupOpenId } : {}) }
          : undefined;

        const qqBindingRows = claim.memberOpenId ? activeBindings.filter((b) => b.binding.memberOpenId === claim.memberOpenId) : [];
        const qqBoundAccounts = qqBindingRows
          .filter((b): b is typeof b & { account: NonNullable<typeof b.account> } => b.account !== null)
          .map((b) => ({ playerAccountId: b.account.id, playerName: b.account.playerName, playerId: b.account.playerId }));

        const revokingBindingMap = new Map<string, typeof activeBindings[number]>();
        if (targetBindingRow) {
          revokingBindingMap.set(targetBindingRow.binding.id, targetBindingRow);
        }
        for (const b of qqBindingRows) {
          revokingBindingMap.set(b.binding.id, b);
        }
        const revokingBindings = Array.from(revokingBindingMap.values());
        const revokingBindingCount = revokingBindings.length;

        const revokingMemberOpenIds = new Set(revokingBindings.map((b) => b.binding.memberOpenId));
        let invalidatingSessionCount = 0;
        for (const mId of revokingMemberOpenIds) {
          invalidatingSessionCount += sessionCountByMember.get(mId) ?? 0;
        }

        const hasTargetBinding = Boolean(targetAccountBinding && targetAccountBinding.memberOpenId !== claim.memberOpenId);
        const hasQqBinding = Boolean(claim.memberOpenId && qqBoundAccounts.some((acc) => acc.playerAccountId !== account?.id));

        let operationType: "initial_binding" | "rebind_account" | "qq_transfer" | "conflict" = "initial_binding";
        if (hasTargetBinding && hasQqBinding) {
          operationType = "conflict";
        } else if (hasTargetBinding) {
          operationType = "rebind_account";
        } else if (hasQqBinding) {
          operationType = "qq_transfer";
        }

        return {
          claimId: claim.id,
          playerName: claim.playerName,
          playerId: claim.playerId,
          status,
          createdAt: claim.createdAt,
          ...(claim.memberOpenId ? { memberOpenId: claim.memberOpenId } : {}),
          ...(claim.groupOpenId ? { groupOpenId: claim.groupOpenId } : {}),
          invitedBy: invite.createdBy,
          ...(account ? { affectedPlayerAccountId: account.id } : {}),
          ...(targetAccountBinding ? { targetAccountBinding } : {}),
          ...(qqBoundAccounts.length > 0 ? { qqBoundAccounts } : {}),
          revokingBindingCount,
          invalidatingSessionCount,
          operationType,
        };
      });

      return { contractVersion: "1" as const, items };
    },

    async decideAdminBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.binding_claim.decide", idempotencyKey, input); if (replay) return;
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim || claim.status !== "pending_review" || !claim.memberOpenId || !claim.groupOpenId) throw new Error("BINDING_CLAIM_NOT_REVIEWABLE");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      if (!invite || invite.revokedAt || invite.expiresAt <= now()) throw new Error("BINDING_CLAIM_NOT_REVIEWABLE");
      const timestamp = now();
      const requestHash = await hashRequest(input);
      const idempotencyStatement = db.insert(idempotencyKeys).values({
        id: `${auth.subject}:admin.binding_claim.decide:${idempotencyKey}`,
        actorId: auth.subject,
        operation: "admin.binding_claim.decide",
        requestHash,
        responseJson: JSON.stringify({}),
        createdAt: timestamp,
      });
      const auditStatement = db.insert(auditEvents).values({
        id: crypto.randomUUID(),
        correlationId: crypto.randomUUID(),
        actorType: auth.actorType,
        actorId: auth.subject,
        operation: `admin.binding_claim.${input.decision}`,
        entityType: "binding_claim",
        entityId: claim.id,
        payloadJson: JSON.stringify({ reason: input.reason ?? null }),
        createdAt: timestamp,
      });

      if (input.decision === "rejected") {
        await db.batch([
          db.update(bindingClaims).set({ status: "rejected", decidedAt: timestamp, decidedBy: auth.subject, decisionReason: input.reason ?? null }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_review"))),
          idempotencyStatement,
          auditStatement,
        ]);
      } else {
        let account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, claim.normalizedPlayerName), eq(playerAccounts.playerId, claim.playerId))).get();
        const accountNeedsInsert = !account;
        if (!account) {
          account = { id: crypto.randomUUID(), playerId: claim.playerId, playerName: claim.playerName, normalizedPlayerName: claim.normalizedPlayerName, isAdmin: 0, status: "active", bannedAt: null, bannedBy: null, banReason: null, createdAt: timestamp, updatedAt: timestamp };
        }
        const old = await db.select().from(bindings).where(and(eq(bindings.status, "active"), or(eq(bindings.playerAccountId, account.id), eq(bindings.memberOpenId, claim.memberOpenId))));
        const identityId = crypto.randomUUID();
        const bindingId = crypto.randomUUID();

        const statements: any[] = [
          db.update(bindingClaims).set({ status: "approved", decidedAt: timestamp, decidedBy: auth.subject, decisionReason: input.reason ?? null }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_review"))),
        ];

        if (old.length > 0) {
          statements.push(
            db.update(bindings).set({ status: "revoked", revokedAt: timestamp, revokedBy: auth.subject }).where(or(...old.map((binding) => eq(bindings.id, binding.id)))),
            db.delete(qqSessions).where(or(...old.map((binding) => eq(qqSessions.memberOpenId, binding.memberOpenId)))),
          );
        }

        if (accountNeedsInsert) {
          statements.push(db.insert(playerAccounts).values(account));
        }

        statements.push(
          db.insert(identities).values({ id: identityId, createdAt: timestamp, updatedAt: timestamp }),
          db.insert(bindings).values({ id: bindingId, identityId, playerAccountId: account.id, provider: "qq", groupOpenId: claim.groupOpenId, memberOpenId: claim.memberOpenId, status: "active", createdAt: timestamp }),
          idempotencyStatement,
          auditStatement,
        );

        await db.batch(statements as [typeof statements[number], ...typeof statements]);
        await migrateAuthorizedHistoricalTitles({ inviteId: invite.id, playerAccountId: account.id, claimId: claim.id, auth, mode: "reviewed" });
      }
    },

    async createBinding(input: QqBindingRequest, auth, idempotencyKey) {
      // QQBot must use the invitation-claim verification contract. This legacy endpoint
      // remains only to return a deterministic migration-safe error to older adapters.
      void input; void auth; void idempotencyKey;
      throw new Error("INVITE_REQUIRED");
      /*
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"), eq(qqGroupAccess.bindEnabled, 1))).get();
      if (!group) throw new Error("BINDING_GROUP_NOT_ALLOWED");

      const existing = await db.select().from(bindings).where(and(eq(bindings.provider, input.provider), eq(bindings.memberOpenId, input.memberOpenId))).get();
      const normalizedPlayerName = normalizePlayerName(input.playerName);
      let account = existing
        ? await db.select().from(playerAccounts).where(eq(playerAccounts.id, existing.playerAccountId)).get()
        : await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, normalizedPlayerName), eq(playerAccounts.playerId, input.playerId))).get();
      if (existing && (account?.playerId !== input.playerId || account.normalizedPlayerName !== normalizedPlayerName)) throw new Error("BINDING_CONFLICT");
      if (account?.status === "banned") throw new Error("PLAYER_BANNED");
      if (!account) {
        const timestamp = now();
        account = { id: crypto.randomUUID(), playerId: input.playerId, playerName: input.playerName, normalizedPlayerName, isAdmin: 0, status: "active", bannedAt: null, bannedBy: null, banReason: null, createdAt: timestamp, updatedAt: timestamp };
        await db.insert(playerAccounts).values(account);
      } else if (account.playerName !== input.playerName) {
        await db.update(playerAccounts).set({ playerName: input.playerName, normalizedPlayerName, updatedAt: now() }).where(eq(playerAccounts.id, account.id));
        account = { ...account, playerName: input.playerName, normalizedPlayerName, updatedAt: now() };
      }
      if (!account) throw new Error("PLAYER_NOT_FOUND");

      if (existing) {
        if (existing.playerAccountId !== account.id) throw new Error("BINDING_CONFLICT");
        const response = { contractVersion: "1" as const, bindingId: existing.id, identityId: existing.identityId, provider: "qq" as const, groupOpenId: existing.groupOpenId, memberOpenId: existing.memberOpenId, playerName: account.playerName, playerId: account.playerId };
        await recordIdempotency(db, auth.subject, "qq.binding.create", idempotencyKey, input, response);
        return response;
      }

      const identityId = crypto.randomUUID();
      const bindingId = crypto.randomUUID();
      const timestamp = now();
      await db.insert(identities).values({ id: identityId, createdAt: timestamp, updatedAt: timestamp });
      await db.insert(bindings).values({ id: bindingId, identityId, playerAccountId: account.id, provider: input.provider, groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, createdAt: timestamp });
      const response = { contractVersion: "1" as const, bindingId, identityId, provider: "qq" as const, groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, playerName: account.playerName, playerId: account.playerId };
      await recordIdempotency(db, auth.subject, "qq.binding.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "qq.binding.create", "binding", bindingId, { provider: input.provider });
      return response;
      */
    },

    async getReviewSummary(input: ReviewTarget): Promise<ReviewSummary> {
      const summaries = await getReviewSummaries({ targetType: input.targetType, targetIds: [input.targetId] });
      return summaries[0]!;
    },

    getReviewSummaries,

    async listPublicReviewComments(input: PublicReviewCommentQuery): Promise<PublicReviewCommentPage> {
      const target = await findReviewTarget(input);
      if (!target) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const page = Math.max(1, Math.floor(input.page));
      const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize)));
      const result = await database.prepare(`
        SELECT
          r.rating,
          r.comment,
          r.anonymous,
          r.created_at,
          p.player_name,
          COUNT(*) OVER () AS total_count
        FROM reviews r
        INNER JOIN player_accounts p ON p.id = r.player_account_id
        WHERE r.target_type = ?
          AND r.target_id = ?
          AND r.status = 'active'
          AND r.comment_status = 'visible'
          AND r.comment IS NOT NULL
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT ? OFFSET ?
      `).bind(input.targetType, input.targetId, pageSize, (page - 1) * pageSize).all<{
        rating: number;
        comment: string;
        anonymous: number;
        created_at: number;
        player_name: string;
        total_count: number;
      }>();
      const total = Number(result.results[0]?.total_count ?? 0);
      return {
        targetType: input.targetType,
        targetId: input.targetId,
        items: result.results.map((row) => ({
          rating: asReviewRating(row.rating),
          comment: row.comment,
          author: row.anonymous === 1 ? null : { displayName: row.player_name },
          createdAt: row.created_at,
        })),
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      };
    },

    async getPlayerReview(input: ReviewTarget, auth: AuthContext): Promise<ReviewRecord | null> {
      const account = await findReviewAccount(auth.subject);
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      if (!await findReviewTarget(input)) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const row = await db.select().from(reviews).where(and(eq(reviews.playerAccountId, account.id), eq(reviews.targetType, input.targetType), eq(reviews.targetId, input.targetId))).get();
      return row ? asReviewRecord(row) : null;
    },

    async upsertReview(input: ReviewUpsertInput, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord> {
      const operation = "review.upsert";
      const replay = await replayOrConflict<ReviewRecord>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const account = await findReviewAccount(auth.subject);
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      if (account.status === "banned") throw new Error("PLAYER_BANNED");
      const target = await findReviewTarget(input);
      if (!target) throw new Error("REVIEW_TARGET_NOT_FOUND");
      const canAccept = input.targetType === "event"
        ? (target as typeof randomEvents.$inferSelect).releaseStatus === "implemented" && (target as typeof randomEvents.$inferSelect).archivedAt === null
        : (target as typeof maps.$inferSelect).status === "active";
      if (!canAccept) throw new Error("REVIEW_TARGET_NOT_RATEABLE");
      const rating = asReviewRating(input.rating);
      const comment = normalizeReviewComment(input.comment);
      const existing = await db.select().from(reviews).where(and(eq(reviews.playerAccountId, account.id), eq(reviews.targetType, input.targetType), eq(reviews.targetId, input.targetId))).get();
      if (existing?.status === "invalidated") throw new Error("REVIEW_INVALIDATED");
      const timestamp = now();
      const reviewId = existing?.id ?? crypto.randomUUID();
      await db.insert(reviews).values({
        id: reviewId,
        playerAccountId: account.id,
        targetType: input.targetType,
        targetId: input.targetId,
        rating,
        comment,
        commentStatus: existing?.commentStatus ?? "visible",
        anonymous: input.anonymous ? 1 : 0,
        status: "active",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        withdrawnAt: null,
        invalidatedAt: null,
        invalidatedBy: null,
        invalidationReason: null,
      }).onConflictDoUpdate({
        target: [reviews.playerAccountId, reviews.targetType, reviews.targetId],
        set: { rating, comment, anonymous: input.anonymous ? 1 : 0, status: "active", updatedAt: timestamp, withdrawnAt: null },
      });
      const row = await db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
      if (!row || row.status === "invalidated") throw new Error("REVIEW_INVALIDATED");
      const response = asReviewRecord(row);
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
      await recordAudit(db, auth, existing ? "review.update" : "review.create", "review", response.reviewId, { targetType: response.targetType, targetId: response.targetId, rating: response.rating, commentProvided: Boolean(response.comment), anonymous: response.anonymous, previousStatus: existing?.status ?? null });
      return response;
    },

    async withdrawReview(input, auth, idempotencyKey): Promise<ReviewRecord> {
      const operation = "review.withdraw";
      const replay = await replayOrConflict<ReviewRecord>(db, auth.subject, operation, idempotencyKey, input);
      if (replay) return replay;
      const account = await findReviewAccount(auth.subject);
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      const row = await db.select().from(reviews).where(eq(reviews.id, input.reviewId)).get();
      if (!row) throw new Error("REVIEW_NOT_FOUND");
      if (row.playerAccountId !== account.id) throw new Error("REVIEW_NOT_OWNED");
      if (row.status === "invalidated") throw new Error("REVIEW_INVALIDATED");
      const timestamp = now();
      if (row.status === "active") await db.update(reviews).set({ status: "withdrawn", withdrawnAt: timestamp, updatedAt: timestamp }).where(and(eq(reviews.id, row.id), eq(reviews.status, "active")));
      const response = asReviewRecord((await db.select().from(reviews).where(eq(reviews.id, row.id)).get())!);
      await recordIdempotency(db, auth.subject, operation, idempotencyKey, input, response);
      await recordAudit(db, auth, operation, "review", row.id, { previousStatus: row.status, status: response.status });
      return response;
    },

    async hideReviewComment(input, auth, idempotencyKey): Promise<ReviewRecord> {
      return mutateReviewComment(input, auth, idempotencyKey, "hidden");
    },

    async restoreReviewComment(input, auth, idempotencyKey): Promise<ReviewRecord> {
      return mutateReviewComment(input, auth, idempotencyKey, "visible");
    },

    async invalidateReview(input, auth, idempotencyKey): Promise<ReviewRecord> {
      return mutateReviewState(input, auth, idempotencyKey, "invalidated");
    },

    async restoreReview(input, auth, idempotencyKey): Promise<ReviewRecord> {
      return mutateReviewState(input, auth, idempotencyKey, "active");
    },

    async createSubmission(input: SubmissionRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["createSubmission"]> extends Promise<infer T> ? T : never>(db, auth.subject, "submission.create", idempotencyKey, input);
      if (replay) return replay;
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, input.actor.provider), eq(bindings.memberOpenId, input.actor.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("BINDING_NOT_FOUND");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");

      const submissionId = crypto.randomUUID();
      const timestamp = now();
      await db.insert(submissions).values({ id: submissionId, bindingId: binding.id, status: evidenceBucket ? "evidence_pending" : "received", challengeType: input.challenge.type, mapName: input.challenge.mapName, sourceProvider: input.source.provider, sourceConversationId: input.source.conversationId, sourceMessageId: input.source.messageId, createdAt: timestamp, updatedAt: timestamp });
      const attachmentIds: string[] = [];
      for (const attachment of input.attachments) {
        const id = crypto.randomUUID();
        attachmentIds.push(id);
        await db.insert(attachments).values({ id, submissionId, provider: input.source.provider, externalAttachmentId: attachment.externalAttachmentId, contentType: attachment.contentType, byteSize: attachment.byteSize, sha256: attachment.sha256, uploadStatus: evidenceBucket ? "pending" : "not_configured", createdAt: timestamp });
      }
      let status: "evidence_pending" | "evidence_stored" | "ocr_pending" | "resubmission_required" = evidenceBucket ? "evidence_pending" : "evidence_pending";
      if (evidenceBucket) {
        try {
          for (const [index, attachment] of input.attachments.entries()) await persistEvidence(db, evidenceBucket, submissionId, attachmentIds[index], attachment.sourceUrl, attachment.contentType);
          status = "ocr_pending";
          await db.update(submissions).set({ status, updatedAt: now() }).where(eq(submissions.id, submissionId));
        } catch (error) {
          status = error instanceof Error && ["SOURCE_ATTACHMENT_UNAVAILABLE", "UNSUPPORTED_ATTACHMENT_TYPE", "ATTACHMENT_SIZE_INVALID"].includes(error.message) ? "resubmission_required" : "evidence_pending";
          await db.update(submissions).set({ status, updatedAt: now() }).where(eq(submissions.id, submissionId));
        }
      }
      const response = { contractVersion: "1" as const, submissionId, status, mapName: input.challenge.mapName, attachmentIds };
      await recordIdempotency(db, auth.subject, "submission.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "submission.create", "submission", submissionId, { bindingId: binding.id, attachmentCount: attachmentIds.length, mapName: input.challenge.mapName, status });
      return response;
    },

    async getSubmission(input, _auth) {
      const submission = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
      const masteryOutcome = await loadMasterySubmissionOutcome(submission.id);
      return { contractVersion: "1" as const, submissionId: submission.id, status: submission.status as never, mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: masteryOutcome?.status === "conflict" ? undefined : submission.reviewReason ?? undefined, ...playerMasterySubmissionOutcomeFields(masteryOutcome), createdAt: submission.createdAt, updatedAt: submission.updatedAt };
    },
  };
};

export * from "./schema";
