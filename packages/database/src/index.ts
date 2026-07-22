import { count, desc, eq, and, gt, like, or, inArray, isNull, ne, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminChallenge, AdminChallengeUpdateRequest, AdminCatalogTitleUpdateRequest, AdminMapMetadataUpdateRequest, AdminRandomEventCreateRequest, AdminRandomEventImportRequest, AdminRandomEventUpdateRequest, Challenge, Map, QqBindingRequest, QqGroupAccessRequest, QqLoginAttemptRequest, QqLoginVerifyRequest, RandomEvent, SubmissionRequest, Title } from "@owbastion/contracts";
import { achievementChallenges, attachments, auditEvents, bindingClaims, bindingInvites, bindings, historicalTitleGrants, identities, idempotencyKeys, mapMetadata, mapTitleRewards, maps, ocrResults, playerAccounts, playerTitleGrants, qqGroupAccess, qqGroupPolicyOutbox, qqLoginAttempts, qqSessions, randomEventImports, randomEventMapChallenges, randomEvents, randomEventTitleChallenges, submissionReviews, submissions, titleCatalog, titleChallenges, uploadSessions } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { matchOcrResult } from "./ocr-match";
import { assessOcrQuality, type OcrResponse } from "./ocr-response";
import { catalogCacheKey, clearCatalogCache, withCatalogCache } from "./catalog-cache";

const now = () => Date.now();
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
  rows.slice(1).forEach((values, index) => { const rowNumber = index + 2; if (!values.some(Boolean)) return; const number = (value: string) => value === "" ? null : Number(value); const percentage = (value: string) => value === "" ? null : Number(value.replace("%", "")) / (value.includes("%") ? 100 : 1); const status = values[16] === "已实装" ? "implemented" : values[16] === "已移除" ? "removed" : values[16] === "开发中" ? "development" : ""; const candidate = { name: values[0], description: values[1], category: values[2], rarity: values[3], categoryProbability: number(values[4]), cooldownSeconds: number(values[5]), durationSeconds: number(values[6]), weight: number(values[7]), groupTotalWeight: number(values[8]), groupSize: number(values[9]), failureProbability: percentage(values[10]), guaranteeProbability: percentage(values[11]), appearanceProbability: percentage(values[12]), globalAppearanceProbability: percentage(values[13]), gameVersion: values[14], effectTags: values[15] ? values[15].split(/[、,]/).map((tag) => tag.trim()).filter(Boolean) : [], releaseStatus: status, challengeLinks: [] }; const valuesToCheck = [candidate.categoryProbability, candidate.cooldownSeconds, candidate.durationSeconds, candidate.weight, candidate.groupTotalWeight, candidate.groupSize, candidate.failureProbability, candidate.guaranteeProbability, candidate.appearanceProbability, candidate.globalAppearanceProbability]; const valid = candidate.name && candidate.category && candidate.rarity && candidate.description && candidate.gameVersion && status && valuesToCheck.every((value) => value === null || Number.isFinite(value)) && [candidate.categoryProbability, candidate.cooldownSeconds, candidate.durationSeconds, candidate.weight, candidate.groupTotalWeight, candidate.groupSize, candidate.failureProbability, candidate.guaranteeProbability].every((value) => value === null || value >= 0) && [candidate.categoryProbability, candidate.failureProbability, candidate.guaranteeProbability].every((value) => value === null || value <= 1) && [candidate.appearanceProbability, candidate.globalAppearanceProbability].every((value) => value === null || Math.abs(value) <= 1); if (!valid) errors.push({ row: rowNumber, message: "字段缺失、状态或数值格式无效" }); else parsed.push(candidate as EventImportRow); });
  const duplicates = new Set<string>(); parsed.forEach((item) => { if (duplicates.has(item.name)) errors.push({ row: rows.findIndex((values) => values[0] === item.name) + 1, message: "文件内事件名称重复" }); duplicates.add(item.name); });
  return { sourceHash: await hashRequest(input.csv), rows: parsed, errors };
};

const validateSourceUrl = (value: string) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || /^(localhost|127\.|0\.0\.0\.0$|::1$|169\.254\.)/i.test(url.hostname)) throw new Error("SOURCE_ATTACHMENT_UNAVAILABLE");
};

const persistEvidence = async (db: ReturnType<typeof drizzle>, bucket: R2Bucket, submissionId: string, attachmentId: string, sourceUrl: string, contentType: string) => {
  validateSourceUrl(sourceUrl);
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15_000) });
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

export const createPlatformServices = (database: D1Database, evidenceBucket?: R2Bucket, uploadOrigin = "https://api.owbastion.com", ocrkitBaseUrl?: string, ocrkitApiToken?: string, ocrQueue?: Queue, ocrkitEvidenceBucket?: string, cache?: KVNamespace, qqPolicyQueue?: Queue): PlatformServices => {
  const db = drizzle(database);

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

  // Fetch all currently public challenges in two parallel queries.
  // Used by both publicEventChallenges (single-event path) and the batch list path.
  const fetchAllPublicChallenges = async (): Promise<Challenge[]> => {
    const [mapRows, titleRows] = await Promise.all([
      db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(and(inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active"))),
      db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(and(inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active"))),
    ]);
    const timestamp = now();
    const items: Challenge[] = [];
    items.push(...mapRows.map(({ challenge, map }) => ({ challengeId: challenge.id, family: "map" as const, type: "map_completion" as const, kind: challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name: challenge.name, mapId: map.id, mapName: map.name, difficulty: challenge.difficulty ?? undefined, gameVersion: challenge.gameVersion, status: challenge.status as "active" | "sunsetting", retiredVersion: challenge.retiredVersion ?? undefined })));
    items.push(...titleRows.flatMap(({ challenge, title }) => { const status = publicTitleChallengeStatus(challenge.status, challenge.startsAt, challenge.endsAt, timestamp); return status === "active" || status === "sunsetting" ? [{ challengeId: challenge.id, family: "achievement" as const, type: "title_achievement" as const, kind: "title_achievement" as const, titleKey: title.key, titleName: title.label, icon: title.icon, category: challenge.categoryOverride ?? title.category, condition: challenge.condition, evidenceRule: challenge.evidenceRule, gameVersion: challenge.gameVersion, status: status as "active" | "sunsetting", startsAt: challenge.startsAt ?? undefined, endsAt: challenge.endsAt ?? undefined, retiredVersion: challenge.retiredVersion ?? undefined, submissionMode: challenge.submissionMode as "manual" | "automatic" }] : []; }));
    return items;
  };

  // Single-event path: used by getRandomEvent and admin mutation responses.
  // Keeps its own two link queries because it is not on the N-multiplied list path.
  const publicEventChallenges = async (eventId: string) => {
    const [mapLinks, titleLinks, challenges] = await Promise.all([
      db.select().from(randomEventMapChallenges).where(eq(randomEventMapChallenges.eventId, eventId)),
      db.select().from(randomEventTitleChallenges).where(eq(randomEventTitleChallenges.eventId, eventId)),
      fetchAllPublicChallenges(),
    ]);
    const ids = new Set([...mapLinks.map((link) => link.challengeId), ...titleLinks.map((link) => link.challengeId)]);
    return challenges.filter((challenge) => ids.has(challenge.challengeId));
  };
  const asRandomEvent = async (row: typeof randomEvents.$inferSelect): Promise<RandomEvent> => ({ eventId: row.id, name: row.name, category: row.category, rarity: row.rarity, description: row.description, durationSeconds: row.durationSeconds, cooldownSeconds: row.cooldownSeconds, weight: row.weight, appearanceProbability: row.appearanceProbability, categoryProbability: row.categoryProbability, groupTotalWeight: row.groupTotalWeight, groupSize: row.groupSize, failureProbability: row.failureProbability, guaranteeProbability: row.guaranteeProbability, globalAppearanceProbability: row.globalAppearanceProbability, gameVersion: row.gameVersion, effectTags: JSON.parse(row.effectTagsJson) as string[], releaseStatus: row.releaseStatus as RandomEvent["releaseStatus"], archived: row.archivedAt !== null, challenges: await publicEventChallenges(row.id) });
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

  return {
    async listRandomEvents(input) {
      const cacheKey = catalogCacheKey(`events:${encodeURIComponent(JSON.stringify({
        query: input.query ?? null,
        category: input.category ?? null,
        rarity: input.rarity ?? null,
        status: input.status ?? null,
        includeArchived: input.includeArchived ?? null, gameVersion: input.gameVersion ?? null,
      }))}`);
      return withCatalogCache(cache, cacheKey, async () => {
        const filters = [input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.status ? eq(randomEvents.releaseStatus, input.status) : input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined, input.category ? eq(randomEvents.category, input.category) : undefined, input.rarity ? eq(randomEvents.rarity, input.rarity) : undefined, input.gameVersion ? eq(randomEvents.gameVersion, input.gameVersion) : undefined, input.query ? like(randomEvents.name, `%${input.query}%`) : undefined].filter(Boolean) as any[];
        const rows = await db.select().from(randomEvents).where(and(...filters)).orderBy(randomEvents.name);
        if (!rows.length) return [];
        // Batch path: 3 parallel queries regardless of event count, then in-memory assembly.
        // Cold-cache cost: O(1) queries instead of O(4N).
        const eventIds = rows.map((row) => row.id);
        const [mapLinks, titleLinks, allChallenges] = await Promise.all([
          // D1 limits bound SQL parameters. Read the small catalog link tables once
          // and discard links outside the selected public event IDs below.
          db.select().from(randomEventMapChallenges),
          db.select().from(randomEventTitleChallenges),
          fetchAllPublicChallenges(),
        ]);
        const challengeById = new Map(allChallenges.map((c) => [c.challengeId, c]));
        const challengesByEvent = new Map<string, Challenge[]>(eventIds.map((id) => [id, []]));
        for (const link of mapLinks) { const c = challengeById.get(link.challengeId); if (c) challengesByEvent.get(link.eventId)?.push(c); }
        for (const link of titleLinks) { const c = challengeById.get(link.challengeId); if (c) challengesByEvent.get(link.eventId)?.push(c); }
        return rows.map((row): RandomEvent => ({ eventId: row.id, name: row.name, category: row.category, rarity: row.rarity, description: row.description, durationSeconds: row.durationSeconds, cooldownSeconds: row.cooldownSeconds, weight: row.weight, appearanceProbability: row.appearanceProbability, categoryProbability: row.categoryProbability, groupTotalWeight: row.groupTotalWeight, groupSize: row.groupSize, failureProbability: row.failureProbability, guaranteeProbability: row.guaranteeProbability, globalAppearanceProbability: row.globalAppearanceProbability, gameVersion: row.gameVersion, effectTags: JSON.parse(row.effectTagsJson) as string[], releaseStatus: row.releaseStatus as RandomEvent["releaseStatus"], archived: row.archivedAt !== null, challenges: challengesByEvent.get(row.id) ?? [] }));
      });
    },
    async listRandomEventVersions() {
      const rows = await db.select({ gameVersion: randomEvents.gameVersion, eventCount: count() }).from(randomEvents).where(and(isNull(randomEvents.archivedAt), inArray(randomEvents.releaseStatus, ["implemented", "removed"]))).groupBy(randomEvents.gameVersion);
      return rows.map((row) => ({ gameVersion: row.gameVersion, eventCount: row.eventCount })).sort((left, right) => right.gameVersion.localeCompare(left.gameVersion, undefined, { numeric: true }));
    },
    async getRandomEvent(input) {
      const row = await db.select().from(randomEvents).where(and(eq(randomEvents.id, input.eventId), input.includeArchived ? undefined : isNull(randomEvents.archivedAt), input.includeArchived === undefined ? inArray(randomEvents.releaseStatus, ["implemented", "removed"]) : undefined)).get();
      return row ? asRandomEvent(row) : null;
    },
    async createAdminRandomEvent(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.create", idempotencyKey, input); if (replay) return replay;
      await validateEventLinks(input.challengeLinks); const timestamp = now(); const eventId = `event.${crypto.randomUUID()}`;
      await db.insert(randomEvents).values({ id: eventId, name: input.name, category: input.category, rarity: input.rarity, description: input.description, durationSeconds: input.durationSeconds, cooldownSeconds: input.cooldownSeconds, weight: input.weight, appearanceProbability: input.appearanceProbability, categoryProbability: input.categoryProbability, groupTotalWeight: input.groupTotalWeight, groupSize: input.groupSize, failureProbability: input.failureProbability, guaranteeProbability: input.guaranteeProbability, globalAppearanceProbability: input.globalAppearanceProbability, gameVersion: input.gameVersion, effectTagsJson: JSON.stringify([...new Set(input.effectTags)]), releaseStatus: input.releaseStatus, createdAt: timestamp, updatedAt: timestamp });
      await replaceEventLinks(eventId, input.challengeLinks); const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, eventId)).get())!);
      await recordIdempotency(db, auth.subject, "admin.random-event.create", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.create", "random_event", eventId, input); await clearCatalogCache(cache); return response;
    },
    async updateAdminRandomEvent(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<RandomEvent>(db, auth.subject, "admin.random-event.update", idempotencyKey, input); if (replay) return replay;
      const existing = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!existing) throw new Error("EVENT_NOT_FOUND"); await validateEventLinks(input.challengeLinks);
      await db.update(randomEvents).set({ name: input.name, category: input.category, rarity: input.rarity, description: input.description, durationSeconds: input.durationSeconds, cooldownSeconds: input.cooldownSeconds, weight: input.weight, appearanceProbability: input.appearanceProbability, categoryProbability: input.categoryProbability, groupTotalWeight: input.groupTotalWeight, groupSize: input.groupSize, failureProbability: input.failureProbability, guaranteeProbability: input.guaranteeProbability, globalAppearanceProbability: input.globalAppearanceProbability, gameVersion: input.gameVersion, effectTagsJson: JSON.stringify([...new Set(input.effectTags)]), releaseStatus: input.releaseStatus, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await replaceEventLinks(input.eventId, input.challengeLinks);
      const response = await asRandomEvent((await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get())!); await recordIdempotency(db, auth.subject, "admin.random-event.update", idempotencyKey, input, response); await recordAudit(db, auth, "admin.random-event.update", "random_event", input.eventId, input); await clearCatalogCache(cache); return response;
    },
    async archiveAdminRandomEvent(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.random-event.archive", idempotencyKey, input); if (replay) return;
      const event = await db.select().from(randomEvents).where(eq(randomEvents.id, input.eventId)).get(); if (!event) throw new Error("EVENT_NOT_FOUND"); await db.update(randomEvents).set({ archivedAt: now(), archivedBy: auth.subject, updatedAt: now() }).where(eq(randomEvents.id, input.eventId)); await recordIdempotency(db, auth.subject, "admin.random-event.archive", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.random-event.archive", "random_event", input.eventId, {}); await clearCatalogCache(cache);
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
      for (const item of parsed.rows) { const eventId = `event.${crypto.randomUUID()}`; statements.push(database.prepare("INSERT INTO random_events (id,name,category,rarity,description,duration_seconds,cooldown_seconds,weight,appearance_probability,category_probability,group_total_weight,group_size,failure_probability,guarantee_probability,global_appearance_probability,game_version,effect_tags_json,release_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId, item.name, item.category, item.rarity, item.description, item.durationSeconds, item.cooldownSeconds, item.weight, item.appearanceProbability, item.categoryProbability, item.groupTotalWeight, item.groupSize, item.failureProbability, item.guaranteeProbability, item.globalAppearanceProbability, item.gameVersion, JSON.stringify(item.effectTags), item.releaseStatus, timestamp, timestamp)); for (const link of item.challengeLinks) statements.push(database.prepare(link.family === "map" ? "INSERT INTO random_event_map_challenges (event_id,challenge_id) VALUES (?,?)" : "INSERT INTO random_event_title_challenges (event_id,challenge_id) VALUES (?,?)").bind(eventId, link.challengeId)); }
      statements.push(database.prepare("INSERT INTO random_event_imports (id,source_hash,file_name,row_count,imported_by,imported_at) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(), parsed.sourceHash, input.fileName, parsed.rows.length, auth.subject, timestamp)); statements.push(database.prepare("INSERT INTO idempotency_keys (id,actor_id,operation,request_hash,response_json,created_at) VALUES (?,?,?,?,?,?)").bind(`${auth.subject}:admin.random-event.import:${idempotencyKey}`, auth.subject, "admin.random-event.import", await hashRequest(input), JSON.stringify(response), timestamp)); statements.push(database.prepare("INSERT INTO audit_events (id,correlation_id,actor_type,actor_id,operation,entity_type,entity_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, "admin.random-event.import", "random_event_import", parsed.sourceHash, JSON.stringify({ fileName: input.fileName, importedCount: parsed.rows.length }), timestamp));
      await database.batch(statements); await clearCatalogCache(cache); return response;
    },
    async listMaps() {
      return withCatalogCache(cache, catalogCacheKey("maps"), async () => {
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
      });
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
      await clearCatalogCache(cache);
      return response;
    },

    async listChallenges(input) {
      return withCatalogCache(cache, catalogCacheKey(`challenges:${input?.family ?? "all"}`), async () => {
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
      });
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
          gameVersion: challenge.gameVersion,
          status: challenge.status === "inactive" ? "retired" : challenge.status as "active" | "sunsetting",
          introducedVersion: challenge.introducedVersion,
          retiredVersion: challenge.retiredVersion,
        })));
      }
      if (!input.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(input.status ? eq(titleChallenges.status, input.status) : undefined)
          .orderBy(titleCatalog.category, titleCatalog.label);
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

    async updateAdminChallenge(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<AdminChallenge>(db, auth.subject, "admin.achievement.update", idempotencyKey, input); if (replay) return replay;
      const timestamp = now();
      if (input.family === "map") {
        const row = await db.select({ challenge: achievementChallenges, map: maps }).from(achievementChallenges).innerJoin(maps, eq(achievementChallenges.mapId, maps.id)).where(eq(achievementChallenges.id, input.challengeId)).get();
        if (!row) throw new Error("CHALLENGE_NOT_FOUND");
        await db.update(achievementChallenges).set({ status: input.status === "retired" ? "inactive" : input.status, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, updatedAt: timestamp }).where(eq(achievementChallenges.id, row.challenge.id));
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "map", type: "map_completion", kind: row.challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name: row.challenge.name, mapId: row.map.id, mapName: row.map.name, difficulty: row.challenge.difficulty ?? undefined, gameVersion: row.challenge.gameVersion, status: input.status, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
        await clearCatalogCache(cache);
        return response;
      } else {
        const row = await db.select({ challenge: titleChallenges, title: titleCatalog }).from(titleChallenges).innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key)).where(eq(titleChallenges.id, input.challengeId)).get();
        if (!row) throw new Error("CHALLENGE_NOT_FOUND");
        await db.update(titleChallenges).set({
          condition: input.condition,
          evidenceRule: input.evidenceRule,
          submissionMode: input.submissionMode,
          categoryOverride: input.categoryOverride,
          status: input.status,
          retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null,
          startsAt: input.status === "scheduled" ? input.startsAt! : null,
          endsAt: input.status === "scheduled" ? input.endsAt! : null,
          updatedAt: timestamp,
        }).where(eq(titleChallenges.id, row.challenge.id));
        if (input.iconUrl !== undefined) {
          await db.update(titleCatalog).set({ iconUrl: input.iconUrl, iconObjectKey: input.iconUrl === row.title.iconUrl ? row.title.iconObjectKey : null }).where(eq(titleCatalog.key, row.title.key));
          if (input.iconUrl !== row.title.iconUrl && row.title.iconObjectKey && evidenceBucket) await evidenceBucket.delete(row.title.iconObjectKey);
        }
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: row.title.key, titleName: row.title.label, icon: row.title.icon, iconUrl: input.iconUrl !== undefined ? input.iconUrl : row.title.iconUrl, category: input.categoryOverride ?? row.title.category, categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: row.challenge.gameVersion, status: input.status, submissionMode: input.submissionMode, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "sunsetting" ? input.retiredVersion! : null, startsAt: input.status === "scheduled" ? input.startsAt! : null, endsAt: input.status === "scheduled" ? input.endsAt! : null };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
        await clearCatalogCache(cache);
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
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      await recordIdempotency(db, auth.subject, "admin.title.catalog.update", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.title.catalog.update", "title_catalog", input.titleKey, { status: input.status });
      await clearCatalogCache(cache);
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
      await clearCatalogCache(cache);
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
      return withCatalogCache(cache, catalogCacheKey(`titles:${input.mapId ? encodeURIComponent(input.mapId) : "global"}`), async () => {
      const globalRows = await db.select().from(titleCatalog).where(eq(titleCatalog.scope, "global"));
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
        gameVersion: row.gameVersion,
      }));
      if (!input.mapId) return globalTitles;
      const mapRows = await db.select({ title: titleCatalog, reward: mapTitleRewards })
        .from(mapTitleRewards)
        .innerJoin(titleCatalog, eq(mapTitleRewards.titleKey, titleCatalog.key))
        .where(eq(mapTitleRewards.mapId, input.mapId));
      return globalTitles.concat(mapRows.map(({ title, reward }): Title => ({
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
        gameVersion: title.gameVersion,
      })));
      });
    },

    async listCurrentPlayerTitles(input) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(input.sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) return null;
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) return null;
      const rows = await db.select({ grant: playerTitleGrants, historical: historicalTitleGrants, title: titleCatalog, mapName: maps.name }).from(playerTitleGrants)
        .innerJoin(historicalTitleGrants, eq(playerTitleGrants.historicalTitleGrantId, historicalTitleGrants.id)).innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id))
        .where(and(eq(playerTitleGrants.playerAccountId, binding.playerAccountId), eq(playerTitleGrants.status, "active"))).orderBy(desc(playerTitleGrants.grantedAt));
      return rows.map(({ grant, historical, title, mapName }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: historical.scope as "global" | "map", mapName: mapName ?? undefined, slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt }));
    },

    async listHistoricalTitleGrants(input) {
      const query = input.query ? `%${input.query}%` : undefined;
      const rows = await db.select({ historical: historicalTitleGrants, grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, player: playerAccounts }).from(historicalTitleGrants)
        .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id)).leftJoin(playerTitleGrants, eq(playerTitleGrants.historicalTitleGrantId, historicalTitleGrants.id)).leftJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .where(query ? or(like(historicalTitleGrants.holderName, query), like(titleCatalog.label, query)) : undefined).orderBy(historicalTitleGrants.holderName).limit(100);
      return rows.map(({ historical, grant, title, mapName, player }) => ({ grantId: grant?.id ?? historical.id, titleKey: title.key, label: title.label, icon: title.icon, iconUrl: title.iconUrl, category: title.category, condition: title.condition, scope: historical.scope as "global" | "map", mapName: mapName ?? undefined, slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant?.grantedAt ?? 0, holderName: historical.holderName, playerAccountId: grant?.playerAccountId, playerName: player?.playerName, playerId: player?.playerId, status: grant ? grant.status as "active" | "revoked" : "unclaimed", revokeReason: grant?.revokeReason ?? undefined }));
    },

    async createAdminTitleGrant(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.grant", idempotencyKey, input); if (replay) return;
      const historical = await db.select().from(historicalTitleGrants).where(eq(historicalTitleGrants.id, input.historicalTitleGrantId)).get();
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!historical) throw new Error("HISTORICAL_TITLE_GRANT_NOT_FOUND"); if (!player) throw new Error("PLAYER_NOT_FOUND");
      const existing = await db.select().from(playerTitleGrants).where(eq(playerTitleGrants.historicalTitleGrantId, historical.id)).get(); if (existing?.status === "active") throw new Error("HISTORICAL_TITLE_GRANT_CLAIMED");
      const timestamp = now(); const id = crypto.randomUUID();
      if (existing) await db.update(playerTitleGrants).set({ playerAccountId: player.id, status: "active", grantedBy: auth.subject, grantedAt: timestamp, revokedBy: null, revokedAt: null, revokeReason: null }).where(eq(playerTitleGrants.id, existing.id));
      else await db.insert(playerTitleGrants).values({ id, playerAccountId: player.id, historicalTitleGrantId: historical.id, status: "active", grantedBy: auth.subject, grantedAt: timestamp });
      const grantId = existing?.id ?? id;
      await recordIdempotency(db, auth.subject, "admin.title.grant", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.title.grant", "player_title_grant", grantId, { playerAccountId: player.id, historicalTitleGrantId: historical.id });
    },

    async createAdminTitleGrantBulk(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<{ contractVersion: "1"; grantedCount: number }>(db, auth.subject, "admin.title.grant.bulk", idempotencyKey, input);
      if (replay) return replay;
      const player = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!player) throw new Error("PLAYER_NOT_FOUND");
      const historical = await db.select({ id: historicalTitleGrants.id }).from(historicalTitleGrants)
        .leftJoin(playerTitleGrants, eq(playerTitleGrants.historicalTitleGrantId, historicalTitleGrants.id))
        .where(and(eq(historicalTitleGrants.holderName, input.holderName), isNull(playerTitleGrants.id)));
      const timestamp = now();
      const grants = historical.map(({ id }) => ({ id: crypto.randomUUID(), historicalTitleGrantId: id }));
      const response = { contractVersion: "1" as const, grantedCount: grants.length };
      const statements = [
        ...grants.map((grant) => db.insert(playerTitleGrants).values({ id: grant.id, playerAccountId: player.id, historicalTitleGrantId: grant.historicalTitleGrantId, status: "active", grantedBy: auth.subject, grantedAt: timestamp })),
        ...grants.map((grant) => db.insert(auditEvents).values({ id: crypto.randomUUID(), correlationId: crypto.randomUUID(), actorType: auth.actorType, actorId: auth.subject, operation: "admin.title.grant.bulk", entityType: "player_title_grant", entityId: grant.id, payloadJson: JSON.stringify({ playerAccountId: player.id, historicalTitleGrantId: grant.historicalTitleGrantId, holderName: input.holderName }), createdAt: timestamp })),
        db.insert(idempotencyKeys).values({ id: `${auth.subject}:admin.title.grant.bulk:${idempotencyKey}`, actorId: auth.subject, operation: "admin.title.grant.bulk", requestHash: await hashRequest(input), responseJson: JSON.stringify(response), createdAt: timestamp }),
      ];
      await db.batch(statements as [typeof statements[number], ...typeof statements]);
      return response;
    },

    async revokeAdminTitleGrant(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.title.revoke", idempotencyKey, input); if (replay) return;
      const grant = await db.select().from(playerTitleGrants).where(eq(playerTitleGrants.id, input.grantId)).get(); if (!grant) throw new Error("TITLE_GRANT_NOT_FOUND");
      await db.update(playerTitleGrants).set({ status: "revoked", revokedBy: auth.subject, revokedAt: now(), revokeReason: input.reason }).where(eq(playerTitleGrants.id, grant.id));
      await recordIdempotency(db, auth.subject, "admin.title.revoke", idempotencyKey, input, {}); await recordAudit(db, auth, "admin.title.revoke", "player_title_grant", grant.id, { reason: input.reason });
    },

    async createPlayerUploadSession(input, sessionToken) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) throw new Error("UNAUTHENTICATED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, session.memberOpenId), eq(bindings.status, "active"))).get();
      if (!binding) throw new Error("UNAUTHENTICATED");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      const mapChallenge = await db.select({ challenge: achievementChallenges, map: maps })
        .from(achievementChallenges)
        .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
        .where(and(eq(achievementChallenges.id, input.challengeId), inArray(achievementChallenges.status, ["active", "sunsetting"]), eq(maps.status, "active")))
        .get();
      const titleChallenge = mapChallenge ? null : await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(eq(titleChallenges.id, input.challengeId), inArray(titleChallenges.status, ["scheduled", "active", "sunsetting"]), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active")))
        .get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      if (!mapChallenge && !titleChallenge) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge && !titleChallengeIsSubmittable(titleChallenge.challenge.status, titleChallenge.challenge.startsAt, titleChallenge.challenge.endsAt, now())) throw new Error("CHALLENGE_NOT_FOUND");
      if (titleChallenge?.challenge.submissionMode === "automatic") throw new Error("CHALLENGE_AUTOMATIC");
      const challengeType = mapChallenge?.challenge.type ?? "title_achievement";
      const mapName = mapChallenge?.map.name ?? "成就挑战";
      const difficulty = mapChallenge?.challenge.difficulty ?? null;
      const submissionId = crypto.randomUUID();
      const uploadId = crypto.randomUUID();
      const timestamp = now();
      const objectKey = userEvidenceObjectKey(submissionId, input.sha256, "upload");
      await db.insert(submissions).values({ id: submissionId, bindingId: binding.id, status: "upload_pending", challengeType, challengeId: input.challengeId, mapName, difficulty, playerName: account.playerName, sourceProvider: "portal", sourceConversationId: "portal", sourceMessageId: uploadId, createdAt: timestamp, updatedAt: timestamp });
      await db.insert(uploadSessions).values({ id: uploadId, submissionId, playerAccountId: account.id, contentType: input.contentType, byteSize: input.byteSize, sha256: input.sha256, objectKey, status: "pending", expiresAt: timestamp + uploadTtlMs, createdAt: timestamp });
      return { contractVersion: "1" as const, submissionId, uploadId, uploadUrl: `${uploadOrigin}/v1/uploads/${uploadId}`, expiresAt: timestamp + uploadTtlMs, maxBytes: maxUploadBytes };
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
      return { contractVersion: "1" as const, items: rows.slice(0, input.pageSize).map((row) => ({ submissionId: row.id, status: row.status as never, challengeId: row.challengeId ?? "", mapName: row.mapName, difficulty: row.difficulty ?? "", playerName: row.playerName ?? "", createdAt: row.createdAt, updatedAt: row.updatedAt, ocr: null, evidenceUrl: `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence` })), page: input.page, pageSize: input.pageSize, total, hasMore: rows.length > input.pageSize };
    },

    async getAdminSubmission(input) {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const ocr = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, row.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get();
      return { submissionId: row.id, status: row.status as never, challengeId: row.challengeId ?? "", mapName: row.mapName, difficulty: row.difficulty ?? "", playerName: row.playerName ?? "", createdAt: row.createdAt, updatedAt: row.updatedAt, ocr: ocr?.responseJson ? JSON.parse(ocr.responseJson) : null, evidenceUrl: `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence` };
    },

    async getAdminEvidence(input) {
      if (!evidenceBucket) throw new Error("EVIDENCE_BUCKET_UNAVAILABLE");
      const attachment = await db.select().from(attachments).where(eq(attachments.submissionId, input.submissionId)).orderBy(desc(attachments.createdAt)).limit(1).get();
      if (!attachment?.objectKey) throw new Error("EVIDENCE_NOT_FOUND");
      const object = await evidenceBucket.get(attachment.objectKey);
      if (!object) throw new Error("EVIDENCE_NOT_FOUND");
      return { body: await object.arrayBuffer(), contentType: object.httpMetadata?.contentType ?? attachment.contentType };
    },

    async getPlayerSubmission(input, sessionToken) {
      const submission = await getPlayerOwnedSubmission(input.submissionId, sessionToken);
      const result = await db.select().from(ocrResults).where(eq(ocrResults.submissionId, submission.id)).orderBy(desc(ocrResults.createdAt)).limit(1).get();
      const raw = result?.responseJson ? JSON.parse(result.responseJson) as { data?: { map_name?: string | null; difficulty?: string | null; viewer_player?: string | null; challenge_completed?: boolean | null } } : null;
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
        ...(raw ? { ocr: { mapName: raw.data?.map_name ?? null, difficulty: raw.data?.difficulty ?? null, playerName: raw.data?.viewer_player ?? null, challengeCompleted: raw.data?.challenge_completed ?? null } } : {}),
      };
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

    async reviewSubmission(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "submission.review", idempotencyKey, input);
      if (replay) return;
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (!["ready_for_review", "ocr_review_required"].includes(row.status)) throw new Error("SUBMISSION_NOT_REVIEWABLE");
      const timestamp = now();
      await db.update(submissions).set({ status: input.decision, reviewReason: input.reason, updatedAt: timestamp }).where(eq(submissions.id, row.id));
      await db.insert(submissionReviews).values({ id: crypto.randomUUID(), submissionId: row.id, decision: input.decision, reason: input.reason, reviewer: auth.subject, createdAt: timestamp });
      await recordIdempotency(db, auth.subject, "submission.review", idempotencyKey, input, {});
      await recordAudit(db, auth, "submission.review", "submission", row.id, { decision: input.decision, reason: input.reason });
    },

    async processOcrJob(input) {
      if (!evidenceBucket || !ocrkitBaseUrl || !ocrkitApiToken || !ocrkitEvidenceBucket) throw new Error("OCR_NOT_CONFIGURED");
      let response: Response;
      try {
        response = await fetch(`${ocrkitBaseUrl.replace(/\/$/, "")}/api/v1/ocr/challenge/by-object`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${ocrkitApiToken}`, "x-request-id": crypto.randomUUID() }, body: JSON.stringify({ object_key: input.objectKey, bucket: ocrkitEvidenceBucket }) });
      } catch { throw new Error("OCR_NETWORK"); }
      if (!response.ok) throw new Error(`OCR_HTTP_${response.status}`);
      let result: OcrResponse & { data?: { map_name?: string | null; difficulty?: string | null; challenge_completed?: boolean | null; viewer_player?: string | null } };
      try { result = await response.json() as typeof result; }
      catch { throw new Error("OCR_INVALID_RESPONSE"); }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "ocr_pending") return;
      const data = result.data ?? {};
      const quality = assessOcrQuality(row.challengeType, result);
      if (!quality.accepted) {
        await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ qualityGate: quality }), createdAt: now() });
        await db.update(submissions).set({ status: "ocr_review_required", updatedAt: now(), reviewReason: "OCR 结果需要人工核对" }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
        return;
      }
      const { skipped, ...match } = matchOcrResult({ challengeType: row.challengeType, targetMapName: row.mapName, targetDifficulty: row.difficulty, targetPlayerName: row.playerName, mapName: data.map_name, difficulty: data.difficulty, challengeCompleted: data.challenge_completed, player: data.viewer_player });
      const matched = Object.values(match).every(Boolean);
      await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: matched ? "matched" : "mismatch", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped, qualityGate: quality }), createdAt: now() });
      await db.update(submissions).set({ status: matched ? "ready_for_review" : "resubmission_required", updatedAt: now(), reviewReason: matched ? null : "OCR 结果与目标挑战不匹配" }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
    },

    async markOcrJobFailed(input) {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row || row.status !== "ocr_pending") return;
      await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: "error", errorCode: input.errorCode, createdAt: now() });
      await db.update(submissions).set({ status: "ocr_review_required", updatedAt: now(), reviewReason: "OCR 服务异常，需要人工核对" }).where(and(eq(submissions.id, row.id), eq(submissions.status, "ocr_pending")));
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

    async dispatchPendingQqGroupPolicyEvents() {
      await dispatchPendingQqGroupPolicyEvents();
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
      await db.insert(bindingInvites).values({ id: inviteId, codeHash: await hashRequest(code), playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), playerId: input.playerId, createdBy: auth.subject, createdAt: timestamp, expiresAt: response.expiresAt });
      await recordIdempotency(db, auth.subject, "admin.binding_invite.create", idempotencyKey, input, response);
      await recordAudit(db, auth, "admin.binding_invite.create", "binding_invite", inviteId, { playerId: input.playerId });
      return response;
    },

    async redeemBindingInvite(input) {
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.codeHash, await hashRequest(input.code))).get();
      const normalized = normalizePlayerName(input.playerName);
      if (!invite || invite.expiresAt <= now() || invite.redeemedAt || invite.revokedAt || invite.playerId !== input.playerId || invite.normalizedPlayerName !== normalized) throw new Error("INVITE_INVALID");
      const pending = await db.select().from(bindingClaims).where(and(eq(bindingClaims.inviteId, invite.id), eq(bindingClaims.status, "pending_confirmation"))).get();
      if (pending && pending.expiresAt > now()) throw new Error("INVITE_INVALID");
      const timestamp = now(); const claimId = crypto.randomUUID(); const claimToken = randomToken(); const code = randomCode();
      await db.insert(bindingClaims).values({ id: claimId, inviteId: invite.id, tokenHash: await hashRequest(claimToken), codeHash: await hashRequest(code), playerName: input.playerName, normalizedPlayerName: normalized, playerId: input.playerId, status: "pending_confirmation", expiresAt: timestamp + loginTtlMs, createdAt: timestamp });
      return { contractVersion: "1" as const, claimId, claimToken, code, expiresAt: timestamp + loginTtlMs };
    },

    async verifyBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["verifyBindingClaim"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.binding_claim.verify", idempotencyKey, input); if (replay) return replay;
      const claim = await db.select().from(bindingClaims).where(and(eq(bindingClaims.codeHash, await hashRequest(input.code)), eq(bindingClaims.status, "pending_confirmation"))).get();
      if (!claim || claim.expiresAt <= now()) throw new Error("BINDING_CLAIM_CODE_INVALID");
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.status, "active"), eq(qqGroupAccess.verifyEnabled, 1))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const invite = await db.select().from(bindingInvites).where(eq(bindingInvites.id, claim.inviteId)).get();
      if (!invite || invite.redeemedAt || invite.revokedAt || invite.expiresAt <= now()) throw new Error("INVITE_INVALID");
      const timestamp = now();
      await db.update(bindingClaims).set({ status: "pending_review", memberOpenId: input.memberOpenId, groupOpenId: input.groupOpenId, messageId: input.messageId, verifiedAt: timestamp }).where(eq(bindingClaims.id, claim.id));
      await db.update(bindingInvites).set({ redeemedAt: timestamp }).where(eq(bindingInvites.id, invite.id));
      const response = { contractVersion: "1" as const, status: "verified" as const, environment: group.environment as "production" | "test" };
      await recordIdempotency(db, auth.subject, "qq.binding_claim.verify", idempotencyKey, input, response);
      await recordAudit(db, auth, "qq.binding_claim.verify", "binding_claim", claim.id, {});
      return response;
    },

    async listAdminBindingClaims() {
      const rows = await db.select({ claim: bindingClaims, invite: bindingInvites, account: playerAccounts }).from(bindingClaims).innerJoin(bindingInvites, eq(bindingClaims.inviteId, bindingInvites.id)).leftJoin(playerAccounts, and(eq(playerAccounts.normalizedPlayerName, bindingClaims.normalizedPlayerName), eq(playerAccounts.playerId, bindingClaims.playerId))).orderBy(desc(bindingClaims.createdAt));
      return { contractVersion: "1" as const, items: rows.map(({ claim, invite, account }) => ({ claimId: claim.id, playerName: claim.playerName, playerId: claim.playerId, status: claim.status as "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired", createdAt: claim.createdAt, ...(claim.memberOpenId ? { memberOpenId: claim.memberOpenId } : {}), ...(claim.groupOpenId ? { groupOpenId: claim.groupOpenId } : {}), invitedBy: invite.createdBy, ...(account ? { affectedPlayerAccountId: account.id } : {}) })) };
    },

    async decideAdminBindingClaim(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.binding_claim.decide", idempotencyKey, input); if (replay) return;
      const claim = await db.select().from(bindingClaims).where(eq(bindingClaims.id, input.claimId)).get();
      if (!claim || claim.status !== "pending_review" || !claim.memberOpenId || !claim.groupOpenId) throw new Error("BINDING_CLAIM_NOT_REVIEWABLE");
      const timestamp = now();
      if (input.decision === "rejected") { await db.update(bindingClaims).set({ status: "rejected", decidedAt: timestamp, decidedBy: auth.subject, decisionReason: input.reason }).where(eq(bindingClaims.id, claim.id)); }
      else {
        let account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.normalizedPlayerName, claim.normalizedPlayerName), eq(playerAccounts.playerId, claim.playerId))).get();
        if (!account) { account = { id: crypto.randomUUID(), playerId: claim.playerId, playerName: claim.playerName, normalizedPlayerName: claim.normalizedPlayerName, isAdmin: 0, status: "active", bannedAt: null, bannedBy: null, banReason: null, createdAt: timestamp, updatedAt: timestamp }; await db.insert(playerAccounts).values(account); }
        const old = await db.select().from(bindings).where(and(eq(bindings.status, "active"), or(eq(bindings.playerAccountId, account.id), eq(bindings.memberOpenId, claim.memberOpenId))));
        if (old.length) { await db.update(bindings).set({ status: "revoked", revokedAt: timestamp, revokedBy: auth.subject }).where(or(...old.map((binding) => eq(bindings.id, binding.id)))); await db.delete(qqSessions).where(or(...old.map((binding) => eq(qqSessions.memberOpenId, binding.memberOpenId)))); }
        const identityId = crypto.randomUUID(); const bindingId = crypto.randomUUID();
        await db.insert(identities).values({ id: identityId, createdAt: timestamp, updatedAt: timestamp });
        await db.insert(bindings).values({ id: bindingId, identityId, playerAccountId: account.id, provider: "qq", groupOpenId: claim.groupOpenId, memberOpenId: claim.memberOpenId, status: "active", createdAt: timestamp });
        await db.update(bindingClaims).set({ status: "approved", decidedAt: timestamp, decidedBy: auth.subject, decisionReason: input.reason }).where(eq(bindingClaims.id, claim.id));
      }
      await recordIdempotency(db, auth.subject, "admin.binding_claim.decide", idempotencyKey, input, {});
      await recordAudit(db, auth, `admin.binding_claim.${input.decision}`, "binding_claim", claim.id, { reason: input.reason });
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
