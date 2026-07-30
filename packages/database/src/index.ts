import { count, desc, eq, and, gt, like, or, inArray, isNull, ne, lt, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AgentAchievementQuery, AgentEventQuery, AgentMapQuery, AgentSearchQuery, AgentTitleQuery, AgentPlayerTitleGrantQuery, AgentMapTitleHolderQuery, AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminAchievementCreateRequest, AdminChallenge, AdminChallengeUpdateRequest, AdminCatalogTitleUpdateRequest, AdminMapMetadataUpdateRequest, AdminRandomEventCreateRequest, AdminRandomEventImportRequest, AdminRandomEventUpdateRequest, AdminSubmissionOcrRetryResponse, AdminSubmissionReviewResponse, AdminManualTitleGrantResponse, AgentSearchResult, Challenge, Map, QqBindingRequest, QqGroupAccessRequest, QqLoginAttemptRequest, QqLoginVerifyRequest, RandomEvent, SubmissionRequest, Title } from "@owbastion/contracts";
import { achievementChallengeMaps, achievementChallenges, attachments, auditEvents, bindingClaims, bindingInvites, bindings, effectGlossaryTerms, historicalTitleGrants, identities, idempotencyKeys, mapMetadata, mapTitleRewards, mapTitleRuleCompat, mapTitleRuleExceptions, mapTitleRules, maps, ocrResults, playerAccounts, playerTitleGrants, qqGroupAccess, qqGroupPolicyOutbox, qqLoginAttempts, qqSessions, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, submissionReviews, submissions, titleCatalog, titleChallenges, uploadSessions } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { matchOcrResult } from "./ocr-match";
import { assessOcrQuality, type OcrResponse } from "./ocr-response";

const now = () => Date.now();
const paginate = <T>(items: T[], page: number, pageSize: number) => ({ items: items.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: items.length, hasMore: page * pageSize < items.length });
export const paginateHistoricalHolderNames = (holderNames: string[], page: number, pageSize: number) => {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(50, Math.max(1, pageSize));
  return { holderNames: holderNames.slice((safePage - 1) * safePageSize, safePage * safePageSize), page: safePage, pageSize: safePageSize, total: holderNames.length, hasMore: safePage * safePageSize < holderNames.length };
};
export const summarizeHistoricalTitleGrantStatuses = (rows: Array<{ holderName: string; grantId: string | null }>) => {
  const pendingHolders = new Set(rows.filter(({ grantId }) => !grantId).map(({ holderName }) => holderName));
  return { pendingHolderCount: pendingHolders.size, unclaimedGrantCount: rows.filter(({ grantId }) => !grantId).length, migratedGrantCount: rows.filter(({ grantId }) => Boolean(grantId)).length };
};
const loginTtlMs = 2 * 60 * 1000;
const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const uploadTtlMs = 10 * 60 * 1000;
const maxUploadBytes = 10 * 1024 * 1024;
const maxTitleIconBytes = 512 * 1024;
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

export const createPlatformServices = (database: D1Database, evidenceBucket?: R2Bucket, uploadOrigin = "https://api.owbastion.com", ocrkitBaseUrl?: string, ocrkitApiToken?: string, ocrQueue?: Queue, ocrkitEvidenceBucket?: string, qqPolicyQueue?: Queue, bindingInviteCodeEncryptionKey?: string, evidencePublicOrigin?: string, ocrManualReviewThreshold = 2): PlatformServices => {
  const db = drizzle(database);
  const publicEvidenceBase = evidencePublicOrigin?.replace(/\/$/, "");
  const publicEvidenceUrl = (objectKey: string | null | undefined) => publicEvidenceBase && objectKey ? `${publicEvidenceBase}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : null;

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
    ruleId: string;
    ruleRevision: number; // updatedAt timestamp of the rule row at resolution time
    mapId: string;
    titleKey: string;
    slot: string | null;
    displayKind: string;
    condition: string;
    evidenceRule: string;
    submissionMode: string;
    defaultScope: string;
    exceptionId: string | null;
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
  ): Promise<MapTitleRuleSnapshot | null> => {
    // Step 1: check map status.
    const map = await db.select({ id: maps.id, status: maps.status }).from(maps).where(eq(maps.id, mapId)).get();
    if (!map || map.status !== "active") return null;

    // Load the rule.
    const rule = await db.select().from(mapTitleRules).where(eq(mapTitleRules.id, ruleId)).get();
    if (!rule || rule.status === "inactive") return null;

    // Step 2-3: look for an explicit exception.
    const exception = await db.select().from(mapTitleRuleExceptions)
      .where(and(eq(mapTitleRuleExceptions.ruleId, ruleId), eq(mapTitleRuleExceptions.mapId, mapId)))
      .get();

    if (exception) {
      // Step 2: disabled exception removes the projection.
      if (exception.enabled === 0) return null;
      // Step 3: enabled exception — override fields win.
      return {
        ruleId: rule.id,
        ruleRevision: rule.updatedAt,
        mapId,
        titleKey: rule.titleKey,
        slot: exception.slot ?? rule.slot ?? null,
        displayKind: rule.displayKind,
        condition: exception.condition ?? rule.condition,
        evidenceRule: exception.evidenceRule ?? rule.evidenceRule,
        submissionMode: exception.submissionMode ?? rule.submissionMode,
        defaultScope: rule.defaultScope,
        exceptionId: exception.id,
      };
    }

    // Step 4: no exception — apply rule default only when map is in scope.
    if (rule.defaultScope === "explicit") return null;
    return {
      ruleId: rule.id,
      ruleRevision: rule.updatedAt,
      mapId,
      titleKey: rule.titleKey,
      slot: rule.slot ?? null,
      displayKind: rule.displayKind,
      condition: rule.condition,
      evidenceRule: rule.evidenceRule,
      submissionMode: rule.submissionMode,
      defaultScope: rule.defaultScope,
      exceptionId: null,
    };
  };

  // Resolve a compat-mapped legacy challenge ID through the rule model.
  // Returns the snapshot if the compat entry exists and the map is still active,
  // or null if the map is retired / the compat entry is missing.
  const resolveCompatProjection = async (
    legacyChallengeId: string,
    mapId: string,
  ): Promise<MapTitleRuleSnapshot | null> => {
    const compat = await db.select({ ruleId: mapTitleRuleCompat.ruleId })
      .from(mapTitleRuleCompat)
      .where(and(eq(mapTitleRuleCompat.legacyChallengeId, legacyChallengeId), eq(mapTitleRuleCompat.mapId, mapId)))
      .get();
    if (!compat) return null;
    return resolveMapTitleProjection(compat.ruleId, mapId);
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
    };
  };

  // Fetch all currently public challenges in a bounded number of queries.
  // Used by the batch event list path and other composed catalog reads.
  const fetchAllPublicChallenges = async (): Promise<Challenge[]> => {
    const [mapRows, titleRows, mapIdsByChallenge] = await Promise.all([
      db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(and(inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active"))),
      db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active"))),
      loadChallengeMapIds(),
    ]);
    const timestamp = now();
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map }) => ({ challengeId: challenge.id, family: "map" as const, type: "map_completion" as const, kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name: challenge.name, mapId: map.id, mapName: map.name, difficulty: challenge.difficulty ?? undefined, gameVersion: challenge.gameVersion, status: challenge.status as "active" | "sunsetting", retiredVersion: challenge.retiredVersion ?? undefined })));
    for (const { challenge, title } of titleRows) {
      const item = toPublicTitleChallenge(challenge, title, timestamp, mapIdsByChallenge);
      // Public event composition only surfaces currently open title challenges.
      if (item && (item.status === "active" || item.status === "sunsetting")) items.push(item);
    }
    return items;
  };

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
        ? db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(and(inArray(achievementChallenges.id, mapChallengeIds), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active")))
        : Promise.resolve([] as Array<{ challenge: typeof achievementChallenges.$inferSelect; map: typeof maps.$inferSelect }>),
      titleChallengeIds.length
        ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.id, titleChallengeIds), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active")))
        : Promise.resolve([] as Array<{ challenge: typeof titleChallenges.$inferSelect; title: typeof titleCatalog.$inferSelect }>),
      loadChallengeMapIds(titleChallengeIds),
    ]);
    const timestamp = now();
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map }) => ({ challengeId: challenge.id, family: "map" as const, type: "map_completion" as const, kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name: challenge.name, mapId: map.id, mapName: map.name, difficulty: challenge.difficulty ?? undefined, gameVersion: challenge.gameVersion, status: challenge.status as "active" | "sunsetting", retiredVersion: challenge.retiredVersion ?? undefined })));
    for (const { challenge, title } of titleRows) {
      const item = toPublicTitleChallenge(challenge, title, timestamp, mapIdsByChallenge);
      if (item && (item.status === "active" || item.status === "sunsetting")) items.push(item);
    }
    return items;
  };
  const loadMapTitleRuleChallenges = async (includeInactive = false): Promise<Challenge[]> => {
    const [rows, activeMaps, exceptions, compat] = await Promise.all([
      db.select({ rule: mapTitleRules, title: titleCatalog }).from(mapTitleRules).innerJoin(titleCatalog, eq(mapTitleRules.titleKey, titleCatalog.key))
        .where(and(includeInactive ? undefined : inArray(mapTitleRules.status, ["active", "sunsetting"]), eq(titleCatalog.availability, "active"))),
      db.select({ id: maps.id, name: maps.name }).from(maps).where(eq(maps.status, "active")),
      db.select().from(mapTitleRuleExceptions),
      db.select().from(mapTitleRuleCompat),
    ]);
    const exceptionByRuleMap = new globalThis.Map(exceptions.map((item) => [`${item.ruleId}:${item.mapId}`, item]));
    const compatByRuleMap = new globalThis.Map(compat.map((item) => [`${item.ruleId}:${item.mapId}`, item.legacyChallengeId]));
    const items: Challenge[] = [];
    for (const { rule, title } of rows) {
      for (const map of activeMaps) {
        const exception = exceptionByRuleMap.get(`${rule.id}:${map.id}`);
        if (exception?.enabled === 0 || (!exception && rule.defaultScope === "explicit")) continue;
        const slot = exception?.slot ?? rule.slot ?? null;
        items.push({
          challengeId: compatByRuleMap.get(`${rule.id}:${map.id}`) ?? `${map.id}.${rule.kind}`,
          family: "map", type: "map_completion", kind: "map_title_achievement",
          name: title.label, mapId: map.id, mapName: map.name, titleKey: title.key,
          condition: exception?.condition ?? rule.condition,
          evidenceRule: exception?.evidenceRule ?? rule.evidenceRule,
          submissionMode: (exception?.submissionMode ?? rule.submissionMode) as "manual" | "automatic",
          mapTitleRule: { ruleId: rule.id, kind: rule.kind, displayKind: rule.displayKind as "fixed" | "map_pioneer" | "map_name_suffix", slot: slot as "pioneer" | "conqueror" | "dominator" | null, dynamic: true },
          gameVersion: rule.introducedVersion,
          status: rule.status as "active" | "sunsetting",
          retiredVersion: rule.retiredVersion ?? undefined,
        });
      }
    }
    return items;
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

  type AdminSubmissionChallenge =
    | { family: "map"; name: string; mapName: string; difficulty: string | null }
    | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string };

  const resolveAdminSubmissionDetails = async (submissionRows: Array<typeof submissions.$inferSelect>) => {
    const mapChallengeIds = submissionRows.filter((row) => row.challengeType !== "title_achievement" && row.challengeId).map((row) => row.challengeId!);
    const titleChallengeIds = submissionRows.filter((row) => row.challengeType === "title_achievement" && row.challengeId).map((row) => row.challengeId!);
    const submissionIds = submissionRows.map((row) => row.id);
    const [mapRows, titleRows, ocrRows] = await Promise.all([
      mapChallengeIds.length ? db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(inArray(achievementChallenges.id, mapChallengeIds)) : [],
      titleChallengeIds.length ? db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(inArray(titleChallenges.id, titleChallengeIds)) : [],
      submissionIds.length ? db.select().from(ocrResults).where(inArray(ocrResults.submissionId, submissionIds)).orderBy(desc(ocrResults.createdAt)) : [],
    ]);
    const challenges = new Map<string, AdminSubmissionChallenge>();
    const latestOcr = new Map<string, typeof ocrResults.$inferSelect>();
    for (const { challenge, map } of mapRows) challenges.set(challenge.id, { family: "map", name: challenge.name, mapName: map.name, difficulty: challenge.difficulty ?? "" });
    for (const { challenge, title } of titleRows) challenges.set(challenge.id, { family: "achievement", titleName: title.label, category: challenge.categoryOverride ?? title.category, condition: challenge.condition, evidenceRule: challenge.evidenceRule });
    for (const result of ocrRows) if (!latestOcr.has(result.submissionId)) latestOcr.set(result.submissionId, result);
    return { challenges, latestOcr };
  };

  const asAdminSubmission = (row: typeof submissions.$inferSelect, details: Awaited<ReturnType<typeof resolveAdminSubmissionDetails>>) => {
    const ocr = details.latestOcr.get(row.id);
    return {
      submissionId: row.id,
      status: row.status as never,
      challengeId: row.challengeId ?? "",
      challenge: row.challengeId ? details.challenges.get(row.challengeId) ?? null : null,
      mapName: row.mapName,
      difficulty: row.difficulty ?? "",
      playerName: row.playerName ?? "",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      ocrStatus: (ocr?.status ?? (row.status === "ocr_pending" ? "pending" : "not_started")) as never,
      ocrAttempt: ocr?.attempt ?? null,
      ocrErrorCode: ocr?.errorCode ?? null,
      ocr: ocr?.responseJson ? JSON.parse(ocr.responseJson) : null,
      evidenceUrl: `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence`,
    };
  };

  return {
    dispatchPendingQqGroupPolicyEvents,
    async listAgentEvents(input: AgentEventQuery) {
      const events = await this.listRandomEvents({ category: input.category, rarity: input.rarity });
      const query = input.query?.toLocaleLowerCase();
      const filtered = query ? events.filter((event) => [event.name, event.description, ...event.effectTags].some((value) => value.toLocaleLowerCase().includes(query))) : events;
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async getAgentEvent(input) { return this.getRandomEvent({ eventId: input.eventId }); },
    async listAgentMaps(input: AgentMapQuery) {
      const maps = await this.listMaps();
      const query = input.query?.toLocaleLowerCase();
      const mechanic = input.mechanic?.toLocaleLowerCase();
      const filtered = maps.filter((map) => (!query || map.mapName.toLocaleLowerCase().includes(query)) && (!mechanic || map.mechanics.some((value) => value.toLocaleLowerCase() === mechanic)));
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async getAgentMap(input) {
      const row = await db.select({ map: maps, metadata: mapMetadata }).from(maps).leftJoin(mapMetadata, eq(mapMetadata.mapId, maps.id)).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get();
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
    },
    async listAgentAchievements(input: AgentAchievementQuery) {
      const challenges = (await this.listChallenges()).filter((challenge) => challenge.family === "achievement" || challenge.kind === "map_title_achievement");
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
      if (!row) {
        return (await loadMapTitleRuleChallenges()).find((item) => item.challengeId === input.challengeId) ?? null;
      }
      const mapIdsByChallenge = (row.challenge.scope ?? "global") === "map"
        ? await loadChallengeMapIds([row.challenge.id])
        : new globalThis.Map<string, string[]>();
      return toPublicTitleChallenge(row.challenge, row.title, now(), mapIdsByChallenge);
    },
    async listAgentTitles(input: AgentTitleQuery) {
      const titles = await this.listTitles({ mapId: input.mapId });
      const query = input.query?.toLocaleLowerCase();
      const filtered = titles.filter((title) => (!query || [title.label, title.category, title.condition].some((value) => value.toLocaleLowerCase().includes(query))) && (!input.category || title.category === input.category) && (!input.scope || title.scope === input.scope) && (!input.mapId || title.scope === "global" || title.mapId === input.mapId));
      return { contractVersion: "1" as const, ...paginate(filtered, input.page, input.pageSize) };
    },
    async listAgentPlayerTitleGrants(input: AgentPlayerTitleGrantQuery) {
      const rows = await db.select({ playerId: playerAccounts.playerId, playerName: playerAccounts.playerName, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId })
        .from(playerTitleGrants).innerJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .where(eq(playerTitleGrants.status, "active")).orderBy(playerAccounts.playerId, playerTitleGrants.titleKey);
      const grouped = new Map<string, { playerId: string; playerName: string; titleKeys: string[]; allTitleKeys: Set<string> }>();
      for (const row of rows) {
        const current = grouped.get(row.playerId) ?? { playerId: row.playerId, playerName: row.playerName, titleKeys: [], allTitleKeys: new Set<string>() };
        current.allTitleKeys.add(row.titleKey);
        if (row.mapId === null && !current.titleKeys.includes(row.titleKey)) current.titleKeys.push(row.titleKey);
        grouped.set(row.playerId, current);
      }
      const titleCount = (await db.select({ key: titleCatalog.key }).from(titleCatalog)).length;
      const items = [...grouped.values()].map(({ allTitleKeys, ...player }) => ({ ...player, allTitles: allTitleKeys.size === titleCount }));
      return { contractVersion: "1" as const, ...paginate(items, input.page, input.pageSize) };
    },
    async listAgentMapTitleHolders(input: AgentMapTitleHolderQuery) {
      const rows = await db.select({ mapId: playerTitleGrants.mapId, titleKey: playerTitleGrants.titleKey, slot: playerTitleGrants.slot, playerId: playerAccounts.playerId, playerName: playerAccounts.playerName })
        .from(playerTitleGrants).innerJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .where(and(eq(playerTitleGrants.status, "active"), eq(playerTitleGrants.mapId, input.mapId)))
        .orderBy(playerTitleGrants.slot, playerAccounts.playerId);
      return { contractVersion: "1" as const, ...paginate(rows.map((row) => ({ mapId: row.mapId!, titleKey: row.titleKey, slot: row.slot as "pioneer" | "conqueror" | "dominator" | null, slotSemantics: row.slot ? "named" as const : "none" as const, playerId: row.playerId, playerName: row.playerName })), input.page, input.pageSize) };
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

    async listChallenges(input) {
      const items: Challenge[] = [];
      if (!input?.family || input.family === "map") {
        const rows = await db.select({ challenge: achievementChallenges, map: maps })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .where(and(inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active")))
          .orderBy(maps.name, achievementChallenges.name);
        items.push(...rows.map(({ challenge, map }): Challenge => ({
          challengeId: challenge.id,
          family: "map",
          type: "map_completion",
          kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion",
          name: challenge.name,
          mapId: map.id,
          mapName: map.name,
          difficulty: challenge.difficulty ?? undefined,
          gameVersion: challenge.gameVersion,
          status: challenge.status as "active" | "sunsetting",
          retiredVersion: challenge.retiredVersion ?? undefined,
        })));
        items.push(...await loadMapTitleRuleChallenges());
      }
      if (!input?.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active")))
          .orderBy(titleCatalog.category, titleCatalog.label);
        const timestamp = now();
        items.push(...rows.flatMap(({ challenge, title }): Challenge[] => {
          const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp);
          if (!status) return [];
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
        const rows = await db.select({ challenge: achievementChallenges, map: maps })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .where(input.status ? eq(achievementChallenges.status, input.status === "retired" ? "inactive" : input.status) : undefined)
          .orderBy(maps.name, achievementChallenges.name);
        items.push(...rows.map(({ challenge, map }): AdminChallenge => ({
          challengeId: challenge.id,
          family: "map",
          type: "map_completion",
          kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion",
          name: challenge.name,
          mapId: map.id,
          mapName: map.name,
          difficulty: challenge.difficulty ?? undefined,
          condition: challenge.condition,
          evidenceRule: challenge.evidenceRule,
          submissionMode: challenge.submissionMode as "manual" | "automatic",
          gameVersion: challenge.gameVersion,
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
      }
      if (!input.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(input.status ? eq(titleChallenges.status, input.status) : undefined)
          .orderBy(titleCatalog.category, titleCatalog.label);
        const mapScopedIds = rows.filter(({ challenge }) => (challenge.scope ?? "global") === "map").map(({ challenge }) => challenge.id);
        const mapIdsByChallenge = await loadChallengeMapIds(mapScopedIds);
        items.push(...rows.map(({ challenge, title }): AdminChallenge => ({
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
          status: title.availability as "active" | "retired",
          gameVersion: title.gameVersion,
          hasChallenge: false,
        })));
      }
      return { contractVersion: "1" as const, items };
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
      };
      const statements: D1PreparedStatement[] = [
        database.prepare("INSERT INTO title_catalog (key,label,icon,icon_url,category,condition,availability,scope,display_kind,color_json,game_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(input.titleKey, input.titleName, input.icon, input.iconUrl, input.category, input.condition, input.status === "retired" ? "retired" : "active", input.scope, "fixed", "null", input.gameVersion),
        database.prepare("INSERT INTO title_challenges (id,title_key,category_override,condition,evidence_rule,submission_mode,game_version,status,introduced_version,retired_version,starts_at,ends_at,scope,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(challengeId, input.titleKey, input.categoryOverride, input.condition, input.evidenceRule, input.submissionMode, input.gameVersion, input.status, input.gameVersion, input.status === "sunsetting" ? input.retiredVersion ?? null : null, input.status === "scheduled" ? input.startsAt ?? null : null, input.status === "scheduled" ? input.endsAt ?? null : null, input.scope, timestamp, timestamp),
        ...targetMapIds.map((mapId) => database.prepare("INSERT INTO achievement_challenge_maps (challenge_id,map_id) VALUES (?,?)").bind(challengeId, mapId)),
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
        const name = input.name ?? row.challenge.name;
        const difficulty = input.difficulty !== undefined ? input.difficulty : row.challenge.difficulty;
        const condition = input.condition ?? row.challenge.condition;
        const evidenceRule = input.evidenceRule ?? row.challenge.evidenceRule;
        const submissionMode = input.submissionMode ?? row.challenge.submissionMode;
        await db.update(achievementChallenges).set({ name, difficulty, condition, evidenceRule, submissionMode, status: input.status === "retired" ? "inactive" : input.status, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, updatedAt: timestamp }).where(eq(achievementChallenges.id, row.challenge.id));
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "map", type: "map_completion", kind: row.challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name, mapId: row.map.id, mapName: row.map.name, difficulty: difficulty ?? undefined, condition, evidenceRule, submissionMode: submissionMode as "manual" | "automatic", gameVersion: row.challenge.gameVersion, status: input.status, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null };
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
          updatedAt: timestamp,
        }).where(eq(titleChallenges.id, row.challenge.id));
        if (input.scope !== undefined || input.mapIds !== undefined) {
          await db.delete(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, row.challenge.id));
          if (scope === "map" && mapIds.length) await db.insert(achievementChallengeMaps).values(mapIds.map((mapId) => ({ challengeId: row.challenge.id, mapId })));
        }
        if (input.iconUrl !== undefined) {
          await db.update(titleCatalog).set({ iconUrl: input.iconUrl, iconObjectKey: input.iconUrl === row.title.iconUrl ? row.title.iconObjectKey : null }).where(eq(titleCatalog.key, row.title.key));
          if (input.iconUrl !== row.title.iconUrl && row.title.iconObjectKey && evidenceBucket) await evidenceBucket.delete(row.title.iconObjectKey);
        }
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: row.title.key, titleName: row.title.label, icon: row.title.icon, iconUrl: input.iconUrl !== undefined ? input.iconUrl : row.title.iconUrl, category: input.categoryOverride ?? row.title.category, categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: row.challenge.gameVersion, status: input.status, submissionMode: input.submissionMode, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, startsAt: input.status === "scheduled" ? input.startsAt! : null, endsAt: input.status === "scheduled" ? input.endsAt! : null, scope, mapIds };
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
      await db.update(titleCatalog).set({ availability: input.status === "retired" ? "retired" : "active" }).where(eq(titleCatalog.key, input.titleKey));
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
        .innerJoin(titleCatalog, eq(playerTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(playerTitleGrants.mapId, maps.id))
        .where(and(eq(playerTitleGrants.playerAccountId, binding.playerAccountId), eq(playerTitleGrants.status, "active"))).orderBy(desc(playerTitleGrants.grantedAt));
      return rows.map(({ grant, title, mapName }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: grant.mapId ? "map" as const : "global" as const, mapName: mapName ?? undefined, slot: grant.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt }));
    },

    async listHistoricalTitleGrants(input) {
      const query = input.query ? `%${input.query}%` : undefined;
      const match = query ? or(like(historicalTitleGrants.holderName, query), like(titleCatalog.label, query)) : undefined;
      const matchedHolders = await db.select({ holderName: historicalTitleGrants.holderName }).from(historicalTitleGrants)
        .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key)).where(match).groupBy(historicalTitleGrants.holderName).orderBy(historicalTitleGrants.holderName);
      const pagination = paginateHistoricalHolderNames(matchedHolders.map(({ holderName }) => holderName), input.page, input.pageSize);
      const { holderNames, page, pageSize } = pagination;
      const rows = holderNames.length ? await db.select({ historical: historicalTitleGrants, grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, player: playerAccounts }).from(historicalTitleGrants)
        .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id)).leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id))).leftJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .where(inArray(historicalTitleGrants.holderName, holderNames)).orderBy(historicalTitleGrants.holderName, titleCatalog.category, titleCatalog.label) : [];
      const allStatuses = await db.select({ holderName: historicalTitleGrants.holderName, grantId: playerTitleGrants.id }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)));
      const stats = summarizeHistoricalTitleGrantStatuses(allStatuses);
      return { contractVersion: "1" as const, items: rows.map(({ historical, grant, title, mapName, player }) => ({ grantId: grant?.id ?? historical.id, titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: historical.scope as "global" | "map", mapName: mapName ?? undefined, slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant?.grantedAt ?? 0, holderName: historical.holderName, playerAccountId: grant?.playerAccountId, playerName: player?.playerName, playerId: player?.playerId, status: grant ? grant.status as "active" | "revoked" : "unclaimed", revokeReason: grant?.revokeReason ?? undefined })), page, pageSize, total: pagination.total, hasMore: pagination.hasMore, stats };
    },

    async createAdminTitleGrant(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.grant", idempotencyKey, input); if (replay) return;
      const historical = await db.select().from(historicalTitleGrants).where(eq(historicalTitleGrants.id, input.historicalTitleGrantId)).get();
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!historical) throw new Error("HISTORICAL_TITLE_GRANT_NOT_FOUND"); if (!player) throw new Error("PLAYER_NOT_FOUND");
      const existing = await db.select().from(playerTitleGrants).where(and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historical.id))).get(); if (existing?.status === "active") throw new Error("HISTORICAL_TITLE_GRANT_CLAIMED");
      const timestamp = now(); const id = crypto.randomUUID();
      if (existing) await db.update(playerTitleGrants).set({ playerAccountId: player.id, status: "active", grantedBy: auth.subject, grantedAt: timestamp, revokedBy: null, revokedAt: null, revokeReason: null }).where(eq(playerTitleGrants.id, existing.id));
      else await db.insert(playerTitleGrants).values({ id, playerAccountId: player.id, titleKey: historical.titleKey, mapId: historical.mapId, slot: historical.slot, status: "active", sourceType: "historical", sourceId: historical.id, grantedBy: auth.subject, grantedAt: timestamp });
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
      if (input.mapId) {
        const map = await db.select({ id: maps.id }).from(maps).where(eq(maps.id, input.mapId)).get();
        if (!map) throw new Error("MAP_NOT_FOUND");
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
      const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).where(and(eq(playerTitleGrants.playerAccountId, player.id), eq(playerTitleGrants.titleKey, title.key), eq(playerTitleGrants.status, "active"), input.mapId ? eq(playerTitleGrants.mapId, input.mapId) : isNull(playerTitleGrants.mapId))).get();
      const grantId = existing?.id ?? crypto.randomUUID();
      const response: AdminManualTitleGrantResponse = { contractVersion: "1", grantId, titleKey: title.key, titleName: title.label, mapId: input.mapId ?? null, slot: slot as "pioneer" | "conqueror" | "dominator" | null, alreadyOwned: Boolean(existing) };
      const timestamp = now();
      const sourceId = `manual:${auth.subject}:${idempotencyKey}`;
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) VALUES (?, ?, ?, ?, ?, 'active', 'manual', ?, ?, ?)").bind(grantId, player.id, title.key, input.mapId ?? null, slot, sourceId, auth.subject, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'admin.title.grant.manual', ?, ?, ?)").bind(`${auth.subject}:admin.title.grant.manual:${idempotencyKey}`, auth.subject, await hashRequest(input), JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'admin.title.grant.manual', 'player_title_grant', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, grantId, JSON.stringify({ playerAccountId: player.id, titleKey: title.key, mapId: input.mapId ?? null, slot, alreadyOwned: Boolean(existing), reason: input.reason ?? null }), timestamp),
      ]);
      return response;
    },

    async createAdminTitleGrantBulk(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<{ contractVersion: "1"; grantedCount: number }>(db, auth.subject, "admin.title.grant.bulk", idempotencyKey, input);
      if (replay) return replay;
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!player) throw new Error("PLAYER_NOT_FOUND");
      const historical = await db.select({ id: historicalTitleGrants.id, titleKey: historicalTitleGrants.titleKey, mapId: historicalTitleGrants.mapId, slot: historicalTitleGrants.slot }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, and(eq(playerTitleGrants.sourceType, "historical"), eq(playerTitleGrants.sourceId, historicalTitleGrants.id)))
        .where(and(eq(historicalTitleGrants.holderName, input.holderName), isNull(playerTitleGrants.id)));
      const timestamp = now();
      const grants = historical.map((item) => ({ id: crypto.randomUUID(), historical: item }));
      const response = { contractVersion: "1" as const, grantedCount: grants.length };
      const statements = [
        ...grants.map((grant) => db.insert(playerTitleGrants).values({ id: grant.id, playerAccountId: player.id, titleKey: grant.historical.titleKey, mapId: grant.historical.mapId, slot: grant.historical.slot, status: "active", sourceType: "historical", sourceId: grant.historical.id, grantedBy: auth.subject, grantedAt: timestamp })),
        ...grants.map((grant) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.title.grant.bulk", entityType: "player_title_grant", entityId: grant.id, payloadJson: JSON.stringify({ playerAccountId: player.id, historicalTitleGrantId: grant.historical.id, holderName: input.holderName }), createdAt: timestamp })),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:admin.title.grant.bulk:${idempotencyKey}`, actorId: auth.subject, operation: "admin.title.grant.bulk", requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
      ];
      await db.batch(statements as [typeof statements[number], ...typeof statements]);
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
        ? await (async () => {
          const compat = await db.select({ ruleId: mapTitleRuleCompat.ruleId, mapId: mapTitleRuleCompat.mapId }).from(mapTitleRuleCompat).where(eq(mapTitleRuleCompat.legacyChallengeId, input.challengeId!)).get();
          return compat ? resolveMapTitleProjection(compat.ruleId, compat.mapId) : null;
        })()
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
      let targetMap = mapChallenge?.map ?? (ruleProjection ? await db.select().from(maps).where(eq(maps.id, ruleProjection.mapId)).get() ?? null : null);
      if (titleChallenge?.challenge.scope === "map") {
        if (!input.mapId) throw new Error("MAP_REQUIRED");
        targetMap = await db.select().from(maps).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get() ?? null;
        if (!targetMap) throw new Error("MAP_NOT_ACTIVE");
        const target = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(and(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id), eq(achievementChallengeMaps.mapId, input.mapId))).get();
        const hasExplicitTargets = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id)).limit(1).get();
        if (hasExplicitTargets && !target) throw new Error("MAP_NOT_IN_CHALLENGE");
      }
      if (ruleProjection?.submissionMode === "automatic") throw new Error("CHALLENGE_AUTOMATIC");
      const challengeType = ruleProjection ? "map_title_achievement" : mapChallenge?.challenge.type ?? (titleChallenge ? "title_achievement" : "unknown");
      const mapName = targetMap?.name ?? "成就挑战";
      const difficulty = mapChallenge?.challenge.difficulty ?? null;
      const submissionId = crypto.randomUUID();
      const uploadId = crypto.randomUUID();
      const timestamp = now();
      const objectKey = userEvidenceObjectKey(submissionId, input.sha256, "upload");
      await db.insert(submissions).values({ id: submissionId, bindingId: binding.id, status: "upload_pending", challengeType, challengeId: input.challengeId ?? null, targetMapId: targetMap?.id ?? null, mapName, difficulty, playerName: account.playerName, ruleSnapshotJson: ruleProjection ? JSON.stringify(ruleProjection) : null, sourceProvider: "portal", sourceConversationId: "portal", sourceMessageId: uploadId, createdAt: timestamp, updatedAt: timestamp });
      await db.insert(uploadSessions).values({ id: uploadId, submissionId, playerAccountId: account.id, contentType: input.contentType, byteSize: input.byteSize, sha256: input.sha256, objectKey, status: "pending", expiresAt: timestamp + uploadTtlMs, createdAt: timestamp });
      return { contractVersion: "1" as const, submissionId, uploadId, uploadUrl: `${uploadOrigin}/v1/uploads/${uploadId}`, expiresAt: timestamp + uploadTtlMs, maxBytes: maxUploadBytes };
    },

    async confirmPlayerSubmissionChallenge(input, sessionToken) {
      const submission = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      if (submission.status !== "awaiting_player_confirmation" || submission.challengeId) throw new Error("SUBMISSION_NOT_CONFIRMABLE");
      const mapChallenge = await db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(and(eq(achievementChallenges.id, input.challengeId), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active"))).get();
      const titleChallenge = mapChallenge ? null : await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(eq(titleChallenges.id, input.challengeId), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.availability, "active"))).get();
      if (!mapChallenge && !titleChallenge) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge && (!titleChallengeIsSubmittable(titleChallenge.challenge.status, titleChallenge.challenge.startsAt, titleChallenge.challenge.endsAt, now()) || titleChallenge.challenge.submissionMode === "automatic")) throw new Error("CHALLENGE_NOT_FOUND");
      let targetMap = mapChallenge?.map ?? null;
      if (titleChallenge?.challenge.scope === "global" && input.mapId) throw new Error("GLOBAL_CHALLENGE_CANNOT_HAVE_MAP");
      if (titleChallenge?.challenge.scope === "map") {
        if (!input.mapId) throw new Error("MAP_REQUIRED");
        targetMap = await db.select().from(maps).where(and(eq(maps.id, input.mapId), eq(maps.status, "active"))).get() ?? null;
        if (!targetMap) throw new Error("MAP_NOT_ACTIVE");
        const target = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(and(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id), eq(achievementChallengeMaps.mapId, input.mapId))).get();
        const hasExplicitTargets = await db.select({ mapId: achievementChallengeMaps.mapId }).from(achievementChallengeMaps).where(eq(achievementChallengeMaps.challengeId, titleChallenge.challenge.id)).limit(1).get();
        if (hasExplicitTargets && !target) throw new Error("MAP_NOT_IN_CHALLENGE");
      }
      const result = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get();
      const raw = result?.responseJson ? JSON.parse(result.responseJson) as OcrResponse : null;
      const data = raw?.data ?? {};
      const challengeType = mapChallenge ? "map_completion" : "title_achievement";
      const matchChallengeType = titleChallenge?.challenge.scope === "map" ? "map_title_achievement" : challengeType;
      const quality = raw ? assessOcrQuality(matchChallengeType, raw) : { accepted: false, requiredFields: [], reasons: ["missing_ocr_result"] };
      const { skipped, ...match } = matchOcrResult({ challengeType: matchChallengeType, targetMapName: targetMap?.name ?? "成就挑战", targetDifficulty: mapChallenge?.challenge.difficulty ?? null, targetPlayerName: submission.playerName, mapName: data.map_name, difficulty: data.difficulty, challengeCompleted: data.challenge_completed, player: data.viewer_player });
      const titleMatched = !titleChallenge || (data.achievement_titles ?? []).some((title) => title.trim().toLocaleLowerCase() === titleChallenge!.title.label.trim().toLocaleLowerCase());
      const matched = quality.accepted && Object.values(match).every(Boolean) && titleMatched;
      await db.update(submissions).set({ status: matched ? "ready_for_review" : "resubmission_required", challengeType, challengeId: input.challengeId, targetMapId: targetMap?.id ?? null, mapName: targetMap?.name ?? "成就挑战", difficulty: mapChallenge?.challenge.difficulty ?? null, updatedAt: now(), reviewReason: matched ? null : quality.accepted ? "OCR 结果与目标挑战不匹配" : "截图未满足识别要求，请重新提交" }).where(eq(submissions.id, submission.id));
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

    async completePlayerUpload(input, sessionToken) {
      const session = await db.select().from(uploadSessions).where(eq(uploadSessions.id, input.uploadId)).get();
      if (!session || session.expiresAt <= now() || session.status !== "uploaded") throw new Error("UPLOAD_SESSION_INVALID");
      const authSession = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!authSession) throw new Error("UNAUTHENTICATED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, authSession.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding || binding.playerAccountId !== session.playerAccountId) throw new Error("UPLOAD_SESSION_INVALID");
      await db.update(uploadSessions).set({ status: "completed" }).where(eq(uploadSessions.id, session.id));
      await db.update(submissions).set({ status: "ocr_pending", updatedAt: now() }).where(eq(submissions.id, session.submissionId));
      if (ocrQueue) await ocrQueue.send({ version: 1, submissionId: session.submissionId, objectKey: session.objectKey });
      return { submissionId: session.submissionId, status: "ocr_pending" };
    },

    async listAdminSubmissions(input) {
      const condition = input.statuses?.length ? inArray(submissions.status, input.statuses) : undefined;
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
      const [details, attachment] = await Promise.all([
        resolveAdminSubmissionDetails([row]),
        db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, row.id)).orderBy(desc(attachments.createdAt)).limit(1).get(),
      ]);
      return { ...asAdminSubmission(row, details), evidenceUrl: publicEvidenceUrl(attachment?.objectKey) ?? `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence` };
    },

    async getAdminEvidence(input) {
      if (!evidenceBucket) throw new Error("EVIDENCE_BUCKET_UNAVAILABLE");
      const attachment = await db.select().from(attachments).where(eq(attachments.submissionId, input.submissionId)).orderBy(desc(attachments.createdAt)).limit(1).get();
      if (!attachment?.objectKey) throw new Error("EVIDENCE_NOT_FOUND");
      const object = await evidenceBucket.get(attachment.objectKey);
      if (!object) throw new Error("EVIDENCE_NOT_FOUND");
      return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? attachment.contentType };
    },

    async requestAdminOcr(input, auth, idempotencyKey): Promise<AdminSubmissionOcrRetryResponse> {
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
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, 'submission.ocr.retry', ?, ?, ?)").bind(idempotencyKeyId, auth.subject, requestHash, JSON.stringify(response), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'submission.ocr.retry', 'submission', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, row.id, JSON.stringify({ manual: true }), timestamp),
      ]);
      try {
        await ocrQueue.send({ version: 1, submissionId: row.id, objectKey: attachment.objectKey, manual: true });
      } catch (error) {
        await db.update(ocrResults).set({ status: "error", errorCode: "OCR_QUEUE_SEND_FAILED", createdAt: now() }).where(eq(ocrResults.id, pendingResultId));
        throw error;
      }
      return response;
    },

    async getPlayerSubmission(input, sessionToken) {
      const submission = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      const [result, attachment] = await Promise.all([
        db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get(),
        db.select({ objectKey: attachments.objectKey }).from(attachments).where(eq(attachments.submissionId, submission.id)).orderBy(desc(attachments.createdAt)).limit(1).get(),
      ]);
      const raw = result?.responseJson ? JSON.parse(result.responseJson) as OcrResponse : null;
      return {
        contractVersion: "1" as const,
        submissionId: submission.id,
        status: submission.status as never,
        mapName: submission.mapName,
        challengeId: submission.challengeId ?? undefined,
        difficulty: submission.difficulty ?? undefined,
        reason: submission.reviewReason ?? undefined,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        evidenceUrl: publicEvidenceUrl(attachment?.objectKey),
        ocrFailCount: submission.ocrFailCount,
        ...(raw ? { ocr: { mapName: raw.data?.map_name ?? null, difficulty: raw.data?.difficulty ?? null, playerName: raw.data?.viewer_player ?? null, challengeCompleted: raw.data?.challenge_completed ?? null, achievementTitles: raw.data?.achievement_titles ?? [] } } : {}),
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

      let reward: { titleKey: string; titleName: string; mapId: string | null; slot: string | null } | null = null;
      if (input.decision === "approved") {
        if (!row.challengeId) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");

        // Fast path: submission was created with an immutable rule snapshot.
        if (row.ruleSnapshotJson) {
          const snap = JSON.parse(row.ruleSnapshotJson) as { titleKey: string; mapId: string; slot: string | null };
          reward = { titleKey: snap.titleKey, titleName: "", mapId: snap.mapId, slot: snap.slot };
          // Resolve the display name from the catalog (read-only; snapshot has the authoritative facts).
          const catalogRow = await db.select({ label: titleCatalog.label }).from(titleCatalog).where(eq(titleCatalog.key, snap.titleKey)).get();
          reward.titleName = catalogRow?.label ?? snap.titleKey;
        } else if (row.challengeType === "title_achievement") {
          const challenge = await db.select({ titleKey: titleChallenges.titleKey, titleName: titleCatalog.label, scope: titleChallenges.scope }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, row.challengeId)).get();
          if (!challenge) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
          if (challenge.scope === "map" && !row.targetMapId) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
          reward = { titleKey: challenge.titleKey, titleName: challenge.titleName, mapId: challenge.scope === "map" ? row.targetMapId : null, slot: null };
        } else {
          // Legacy map challenge path: check compat table first, then fall back to direct join.
          const snap = row.targetMapId ? await resolveCompatProjection(row.challengeId, row.targetMapId) : null;
          if (snap) {
            const catalogRow = await db.select({ label: titleCatalog.label }).from(titleCatalog).where(eq(titleCatalog.key, snap.titleKey)).get();
            reward = { titleKey: snap.titleKey, titleName: catalogRow?.label ?? snap.titleKey, mapId: snap.mapId, slot: snap.slot };
          } else {
            const challenge = await db.select({ titleKey: achievementChallenges.rewardTitleKey, titleName: titleCatalog.label, mapId: achievementChallenges.mapId, slot: mapTitleRewards.slot }).from(achievementChallenges).leftJoin(titleCatalog, eq(achievementChallenges.rewardTitleKey, titleCatalog.key)).leftJoin(mapTitleRewards, and(eq(mapTitleRewards.mapId, achievementChallenges.mapId), eq(mapTitleRewards.titleKey, achievementChallenges.rewardTitleKey))).where(eq(achievementChallenges.id, row.challengeId)).get();
            if (!challenge?.titleKey || !challenge.titleName) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
            reward = { titleKey: challenge.titleKey, titleName: challenge.titleName, mapId: challenge.mapId, slot: challenge.slot };
          }
        }
      }

      const timestamp = now();
      const reviewId = crypto.randomUUID();
      let alreadyOwned = false;
      let grantId = crypto.randomUUID();
      if (reward) {
        const existing = await db.select({ id: playerTitleGrants.id }).from(playerTitleGrants).innerJoin(bindings, eq(bindings.playerAccountId, playerTitleGrants.playerAccountId)).where(and(eq(bindings.id, row.bindingId), eq(playerTitleGrants.titleKey, reward.titleKey), eq(playerTitleGrants.status, "active"), reward.mapId ? eq(playerTitleGrants.mapId, reward.mapId) : isNull(playerTitleGrants.mapId))).get();
        if (existing) { alreadyOwned = true; grantId = existing.id as typeof grantId; }
      }
      const requestHash = await hashRequest(input);
      const response: AdminSubmissionReviewResponse = reward
        ? { contractVersion: "1", submissionId: row.id, decision: "approved", grantId, titleKey: reward.titleKey, titleName: reward.titleName, alreadyOwned }
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
        const grantInsert = database.prepare(
          "INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, slot, status, source_type, source_id, granted_by, granted_at) SELECT ?, b.player_account_id, ?, ?, ?, 'active', 'submission', s.id, ?, ? FROM submissions s INNER JOIN bindings b ON b.id = s.binding_id WHERE s.id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
        ).bind(grantId, reward.titleKey, reward.mapId, reward.slot, auth.subject, timestamp, row.id, reviewId);
        statements.push(grantInsert);
        statements.push(
          database.prepare(
            `UPDATE submissions SET status = 'approved', review_reason = ?, grant_id = (SELECT g.id FROM player_title_grants g INNER JOIN bindings b ON b.player_account_id = g.player_account_id WHERE b.id = submissions.binding_id AND g.title_key = ? AND ${mapMatch} AND g.status = 'active'), updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)`
          ).bind(input.reason ?? null, reward.titleKey, ...(reward.mapId ? [reward.mapId] : []), timestamp, row.id, reviewId)
        );
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
        ).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, JSON.stringify({ decision: input.decision, reason: input.reason ?? null, grantId: reward ? grantId : null }), timestamp, reviewId)
      );
      if (reward) {
        statements.push(
          database.prepare(
            "INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, ?, ?, 'submission.grant', 'player_title_grant', grant_id, ?, ? FROM submissions WHERE id = ? AND grant_id IS NOT NULL AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)"
          ).bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, JSON.stringify({ submissionId: row.id, titleKey: reward.titleKey, alreadyOwned }), timestamp, row.id, reviewId)
        );
      }
      await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
      const keyRow = await db.select({ id: idempotencyKeys.id }).from(idempotencyKeys).where(eq(idempotencyKeys.id, idempotencyKeyId)).get();
      if (!keyRow) throw new Error("SUBMISSION_NOT_REVIEWABLE");
      if (reward && response.decision === "approved") {
        const completed = await db.select({ grantId: submissions.grantId }).from(submissions).where(eq(submissions.id, row.id)).get();
        if (!completed?.grantId) throw new Error("SUBMISSION_NOT_REVIEWABLE");
        response.grantId = completed.grantId! as typeof response.grantId;
      }
      return response;
    },

    async processOcrJob(input) {
      if (!evidenceBucket || !ocrkitBaseUrl || !ocrkitApiToken || !ocrkitEvidenceBucket) throw new Error("OCR_NOT_CONFIGURED");
      let response: Response;
      try {
        response = await fetch(`${ocrkitBaseUrl.replace(/\/$/, "")}/api/v1/ocr/challenge/by-object`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ocrkitApiToken}`, "user-agent": "OWBastion-PlatformAPI/1.0", "x-request-id": crypto.randomUUID() }, body: JSON.stringify({ object_key: input.objectKey, bucket: ocrkitEvidenceBucket }) });
      } catch { throw new Error("OCR_NETWORK"); }
      if (!response.ok) throw new Error(`OCR_HTTP_${response.status}`);
      let result: OcrResponse;
      try { result = await response.json() as typeof result; }
      catch { throw new Error("OCR_INVALID_RESPONSE"); }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "ocr_pending" && !input.manual) return;
      const data = result.data ?? {};
      if (row.challengeType === "unknown") {
        const quality = assessOcrQuality("unknown", result);
        await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: quality.accepted ? "matched" : "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ qualityGate: quality }), createdAt: now() });
        if (quality.accepted) {
          await db.update(submissions).set({ status: "awaiting_player_confirmation", updatedAt: now(), reviewReason: null }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
        } else {
          await db.update(submissions).set({ status: "resubmission_required", updatedAt: now(), reviewReason: "截图未满足识别要求，请重新提交", ocrFailCount: row.ocrFailCount + 1 }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
        }
        return;
      }
      const snapshot = row.ruleSnapshotJson ? JSON.parse(row.ruleSnapshotJson) as MapTitleRuleSnapshot : null;
      const title = snapshot
        ? await db.select({ label: titleCatalog.label, scope: titleCatalog.scope }).from(titleCatalog).where(eq(titleCatalog.key, snapshot.titleKey)).get()
        : row.challengeType === "title_achievement" && row.challengeId
        ? await db.select({ label: titleCatalog.label, scope: titleChallenges.scope }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, row.challengeId)).get()
        : null;
      const matchChallengeType = snapshot || title?.scope === "map" ? "map_title_achievement" : row.challengeType;
      const quality = assessOcrQuality(matchChallengeType, result);
      if (!quality.accepted) {
        await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ qualityGate: quality }), createdAt: now() });
        await db.update(submissions).set({ status: "resubmission_required", updatedAt: now(), reviewReason: "截图未满足识别要求，请重新提交", ocrFailCount: row.ocrFailCount + 1 }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
        return;
      }
      const { skipped, ...match } = matchOcrResult({ challengeType: matchChallengeType, targetMapName: row.mapName, targetDifficulty: row.difficulty, targetPlayerName: row.playerName, mapName: data.map_name, difficulty: data.difficulty, challengeCompleted: data.challenge_completed, player: data.viewer_player, titleName: title?.label, achievementTitles: data.achievement_titles });
      const matched = Object.values(match).every(Boolean);
      await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: matched ? "matched" : "mismatch", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality }), createdAt: now() });
      if (matched) {
        await db.update(submissions).set({ status: "ready_for_review", updatedAt: now(), reviewReason: null }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
      } else {
        await db.update(submissions).set({ status: "resubmission_required", updatedAt: now(), reviewReason: "OCR 结果与目标挑战不匹配", ocrFailCount: row.ocrFailCount + 1 }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
      }
    },

    async markOcrJobFailed(input) {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row || (!input.manual && row.status !== "ocr_pending")) return;
      await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: "error", errorCode: input.errorCode, createdAt: now() });
      if (row.status === "ocr_pending") await db.update(submissions).set({ status: "resubmission_required", updatedAt: now(), reviewReason: "OCR 识别失败，请重新提交截图", ocrFailCount: row.ocrFailCount + 1 }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
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
        ? await db.select({ submissionId: submissions.id, status: submissions.status, mapName: submissions.mapName, createdAt: submissions.createdAt, updatedAt: submissions.updatedAt })
          .from(submissions).where(or(...playerBindings.map((binding) => eq(submissions.bindingId, binding.id)))).orderBy(desc(submissions.createdAt)).limit(10)
        : [];
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
        recentSubmissions: recentSubmissions.map((submission) => ({ ...submission, status: submission.status as never })),
        titleGrants: titleGrants.map(({ grant, title, mapName }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon as never, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: grant.mapId ? "map" as const : "global" as const, mapName: mapName ?? undefined, slot: grant.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt, sourceType: grant.sourceType as "historical" | "submission" | "manual" | "automatic", grantedBy: grant.grantedBy })),
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

    async getCurrentPlayer(input) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(input.sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) return null;
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) return null;
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      if (!player || player.status === "banned") return null;
      const recentSubmissions = await db.select({ submissionId: submissions.id, status: submissions.status, mapName: submissions.mapName, challengeId: submissions.challengeId, difficulty: submissions.difficulty, reason: submissions.reviewReason, createdAt: submissions.createdAt, updatedAt: submissions.updatedAt })
        .from(submissions)
        .where(eq(submissions.bindingId, binding.id))
        .orderBy(desc(submissions.createdAt))
        .limit(5);
      return {
        contractVersion: "1" as const,
        player: { playerId: player.playerId, playerName: player.playerName, bindingStatus: "bound" as const, isAdmin: player.isAdmin === 1 },
        recentSubmissions: recentSubmissions.map((submission) => ({ submissionId: submission.submissionId, status: submission.status as never, mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: submission.reason ?? undefined, createdAt: submission.createdAt, updatedAt: submission.updatedAt })),
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
      const timestamp = now(); const code = randomInviteCode(); const inviteId = crypto.randomUUID();
      const response = { contractVersion: "1" as const, inviteId, code, playerName: input.playerName, playerId: input.playerId, expiresAt: timestamp + inviteTtlMs };
      await db.insert(bindingInvites).values({ id: inviteId, codeHash: await hashRequest(code), codeCiphertext: await encryptBindingInviteCode(code, bindingInviteCodeEncryptionKey), playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), playerId: input.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: response.expiresAt });
      await recordIdempotency(db, auth.subject, "admin.binding_invite.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.binding_invite.create", "binding_invite", inviteId, { playerId: input.playerId });
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
        return {
          invite: { id: inviteId, codeHash: await hashRequest(code), codeCiphertext: await encryptBindingInviteCode(code, bindingInviteCodeEncryptionKey), playerName: invitation.playerName, normalizedPlayerName: normalizePlayerName(invitation.playerName), playerId: invitation.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: timestamp + inviteTtlMs },
          response: { contractVersion: "1" as const, inviteId, code, playerName: invitation.playerName, playerId: invitation.playerId, expiresAt: timestamp + inviteTtlMs },
        };
      }));
      const response = { contractVersion: "1" as const, items: prepared.map(({ response }) => response) };
      await db.batch([
        ...prepared.map(({ invite }) => db.insert(bindingInvites).values(invite)),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:${operation}:${idempotencyKey}`, actorId: auth.subject, operation, requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
        ...prepared.map(({ response: invite }) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation, entityType: "binding_invite", entityId: invite.inviteId, payloadJson: JSON.stringify({ playerId: invite.playerId }), createdAt: timestamp })),
      ] as [any, ...any[]]);
      return response;
    },

    async listAdminBindingInvites() {
      const timestamp = now();
      const rows = await db.select().from(bindingInvites).orderBy(desc(bindingInvites.createdAt)).limit(100);
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
        })),
      };
    },

    async getAdminBindingInviteCode(input, auth) {
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, input.inviteId)).get();
      if (!invite || !invite.codeCiphertext || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= now()) throw new Error("BINDING_INVITE_CODE_UNAVAILABLE");
      const code = await decryptBindingInviteCode(invite.codeCiphertext, bindingInviteCodeEncryptionKey);
      await recordAudit(db, auth, "admin.binding_invite.reveal", "binding_invite", invite.id, {});
      return { contractVersion: "1" as const, inviteId: invite.id, code };
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
      const normalized = normalizePlayerName(input.playerName);
      if (!invite || invite.expiresAt <= now() || invite.redeemedAt || invite.revokedAt || invite.playerId !== input.playerId || invite.normalizedPlayerName !== normalized) throw new Error("INVITE_INVALID");
      const pending = await db.select().from(bindingClaims).where(and(eq(bindingClaims.inviteId, invite.id), eq(bindingClaims.status, "pending_confirmation"))).get();
      if (pending) {
        if (pending.expiresAt > now()) throw new Error("INVITE_INVALID");
      }
      const timestamp = now(); const claimId = crypto.randomUUID(); const claimToken = randomToken(); const code = randomCode();
      const insertStmt = db.insert(bindingClaims).values({ id: claimId, inviteId: invite.id, tokenHash: await hashRequest(claimToken), codeHash: await hashRequest(code), playerName: input.playerName, normalizedPlayerName: normalized, playerId: input.playerId, status: "pending_confirmation", expiresAt: timestamp + loginTtlMs, createdAt: timestamp });
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
      return { contractVersion: "1" as const, claimId, claimToken, code, expiresAt: timestamp + loginTtlMs };
    },

    async getBindingClaimStatus(input) {
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim) throw new Error("BINDING_CLAIM_NOT_FOUND");
      if (claim.tokenHash !== await hashRequest(input.claimToken)) throw new Error("BINDING_CLAIM_FORBIDDEN");
      if (claim.status === "pending_confirmation" && claim.expiresAt <= now()) {
        await db.update(bindingClaims).set({ status: "expired" }).where(eq(bindingClaims.id, claim.id));
        return { contractVersion: "1" as const, status: "expired" as const, expiresAt: claim.expiresAt };
      }
      return { contractVersion: "1" as const, status: claim.status as "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired", expiresAt: claim.expiresAt };
    },

    async verifyBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["verifyBindingClaim"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.binding_claim.verify", idempotencyKey, input); if (replay) return replay;
      const claim = await db.select().from(bindingClaims).where(and(eq(bindingClaims.codeHash, await hashRequest(input.code)), eq(bindingClaims.status, "pending_confirmation"))).get();
      if (!claim) throw new Error("BINDING_CLAIM_CODE_INVALID");
      if (claim.expiresAt <= now()) {
        await db.update(bindingClaims).set({ status: "expired" }).where(eq(bindingClaims.id, claim.id));
        throw new Error("BINDING_CLAIM_CODE_INVALID");
      }
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"), eq(qqGroupAccess.verifyEnabled, 1))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      if (!invite || invite.redeemedAt || invite.revokedAt || invite.expiresAt <= now()) throw new Error("INVITE_INVALID");
      const timestamp = now();
      const response = { contractVersion: "1" as const, status: "verified" as const, environment: group.environment as "production" | "test" };

      const idempotencyStatement = db.insert(idempotencyKeys).values({
        id: `${auth.subject}:qq.binding_claim.verify:${idempotencyKey}`,
        actorId: auth.subject,
        operation: "qq.binding_claim.verify",
        requestHash: await hashRequest(input),
        responseJson: JSON.stringify(response),
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
        payloadJson: JSON.stringify({}),
        createdAt: timestamp,
      });

      await db.batch([
        db.update(bindingClaims).set({ status: "pending_review", memberOpenId: input.memberOpenId, groupOpenId: input.groupOpenId, messageId: input.messageId, verifiedAt: timestamp }).where(and(eq(bindingClaims.id, claim.id), eq(bindingClaims.status, "pending_confirmation"))),
        db.update(bindingInvites).set({ redeemedAt: timestamp }).where(and(eq(bindingInvites.id, invite.id), isNull(bindingInvites.redeemedAt))),
        idempotencyStatement,
        auditStatement,
      ]);

      return response;
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
      return { contractVersion: "1" as const, submissionId: submission.id, status: submission.status as never, mapName: submission.mapName, challengeId: submission.challengeId ?? undefined, difficulty: submission.difficulty ?? undefined, reason: submission.reviewReason ?? undefined, createdAt: submission.createdAt, updatedAt: submission.updatedAt };
    },
  };
};

export * from "./schema";
