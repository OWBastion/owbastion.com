import { desc, eq, and, gt, like, or, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { AdminChallenge, AdminChallengeUpdateRequest, Challenge, Map, QqBindingRequest, QqGroupAccessRequest, QqLoginAttemptRequest, QqLoginVerifyRequest, SubmissionRequest, Title } from "@owbastion/contracts";
import { achievementChallenges, attachments, auditEvents, bindings, historicalTitleGrants, identities, idempotencyKeys, mapTitleRewards, maps, ocrResults, playerAccounts, playerTitleGrants, qqGroupAccess, qqLoginAttempts, qqSessions, submissionReviews, submissions, titleCatalog, titleChallenges, uploadSessions } from "./schema";
import { userEvidenceObjectKey } from "./object-key";
import { matchOcrResult } from "./ocr-match";

const now = () => Date.now();
const loginTtlMs = 2 * 60 * 1000;
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;
const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const uploadTtlMs = 10 * 60 * 1000;
const maxUploadBytes = 10 * 1024 * 1024;
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

export const createPlatformServices = (database: D1Database, evidenceBucket?: R2Bucket, uploadOrigin = "https://api.owbastion.com", ocrkitBaseUrl?: string, ocrQueue?: Queue, ocrkitEvidenceBucket?: string): PlatformServices => {
  const db = drizzle(database);

  return {
    async listMaps() {
      const rows = await db.select().from(maps).where(eq(maps.status, "active")).orderBy(maps.name);
      return rows.map((row): Map => ({ mapId: row.id, mapName: row.name, gameVersion: row.gameVersion }));
    },

    async listChallenges(input) {
      const items: Challenge[] = [];
      if (!input?.family || input.family === "map") {
        const rows = await db.select({ challenge: achievementChallenges, map: maps })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .where(and(eq(achievementChallenges.status, "active"), eq(maps.status, "active")))
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
        })));
      }
      if (!input?.family || input.family === "achievement") {
        const rows = await db.select({ challenge: titleChallenges, title: titleCatalog })
          .from(titleChallenges)
          .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
          .where(and(eq(titleChallenges.status, "active"), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active")))
          .orderBy(titleCatalog.category, titleCatalog.label);
        items.push(...rows.map(({ challenge, title }): Challenge => ({
          challengeId: challenge.id,
          family: "achievement",
          type: "title_achievement",
          kind: "title_achievement",
          titleKey: title.key,
          titleName: title.label,
          category: challenge.categoryOverride ?? title.category,
          condition: challenge.condition,
          evidenceRule: challenge.evidenceRule,
          gameVersion: challenge.gameVersion,
          status: "active",
          submissionMode: challenge.submissionMode as "manual" | "automatic",
        })));
      }
      return items;
    },

    async listAdminChallenges(input) {
      const items: AdminChallenge[] = [];
      if (!input.family || input.family === "map") {
        const rows = await db.select({ challenge: achievementChallenges, map: maps })
          .from(achievementChallenges)
          .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
          .where(input.status ? eq(achievementChallenges.status, input.status === "retired" ? "inactive" : "active") : undefined)
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
          status: challenge.status === "active" ? "active" : "retired",
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
          category: challenge.categoryOverride ?? title.category,
          categoryOverride: challenge.categoryOverride,
          condition: challenge.condition,
          evidenceRule: challenge.evidenceRule,
          gameVersion: challenge.gameVersion,
          status: challenge.status as "active" | "retired",
          submissionMode: challenge.submissionMode as "manual" | "automatic",
          introducedVersion: challenge.introducedVersion,
          retiredVersion: challenge.retiredVersion,
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
        await db.update(achievementChallenges).set({ status: input.status === "retired" ? "inactive" : "active", retiredVersion: input.status === "retired" ? input.retiredVersion! : null, updatedAt: timestamp }).where(eq(achievementChallenges.id, row.challenge.id));
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "map", type: "map_completion", kind: row.challenge.type as "difficulty_completion" | "pioneer" | "classic_completion", name: row.challenge.name, mapId: row.map.id, mapName: row.map.name, difficulty: row.challenge.difficulty ?? undefined, gameVersion: row.challenge.gameVersion, status: input.status, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "retired" ? input.retiredVersion! : null };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
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
          retiredVersion: input.status === "retired" ? input.retiredVersion! : null,
          updatedAt: timestamp,
        }).where(eq(titleChallenges.id, row.challenge.id));
        const response: AdminChallenge = { challengeId: row.challenge.id, family: "achievement", type: "title_achievement", kind: "title_achievement", titleKey: row.title.key, titleName: row.title.label, category: input.categoryOverride ?? row.title.category, categoryOverride: input.categoryOverride, condition: input.condition, evidenceRule: input.evidenceRule, gameVersion: row.challenge.gameVersion, status: input.status, submissionMode: input.submissionMode, introducedVersion: row.challenge.introducedVersion, retiredVersion: input.status === "retired" ? input.retiredVersion! : null };
        await recordIdempotency(db, auth.subject, "admin.achievement.update", idempotencyKey, input, response);
        await recordAudit(db, auth, "admin.achievement.update", "challenge", input.challengeId, input);
        return response;
      }
    },

    async listTitles(input) {
      const globalRows = await db.select().from(titleCatalog).where(eq(titleCatalog.scope, "global"));
      const globalTitles: Title[] = globalRows.map((row) => ({
        titleKey: row.key,
        label: row.label,
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
    },

    async listCurrentPlayerTitles(input) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(input.sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) return null;
      const binding = await db.select().from(bindings).where(and(eq(bindings.groupOpenId, session.groupOpenId), eq(bindings.memberOpenId, session.memberOpenId))).get();
      if (!binding) return null;
      const rows = await db.select({ grant: playerTitleGrants, historical: historicalTitleGrants, title: titleCatalog, mapName: maps.name }).from(playerTitleGrants)
        .innerJoin(historicalTitleGrants, eq(playerTitleGrants.historicalTitleGrantId, historicalTitleGrants.id)).innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id))
        .where(and(eq(playerTitleGrants.playerAccountId, binding.playerAccountId), eq(playerTitleGrants.status, "active"))).orderBy(desc(playerTitleGrants.grantedAt));
      return rows.map(({ grant, historical, title, mapName }) => ({ grantId: grant.id, titleKey: title.key, label: title.label, category: title.category, scope: historical.scope as "global" | "map", mapName: mapName ?? undefined, slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant.grantedAt }));
    },

    async listHistoricalTitleGrants(input) {
      const query = input.query ? `%${input.query}%` : undefined;
      const rows = await db.select({ historical: historicalTitleGrants, grant: playerTitleGrants, title: titleCatalog, mapName: maps.name, player: playerAccounts }).from(historicalTitleGrants)
        .innerJoin(titleCatalog, eq(historicalTitleGrants.titleKey, titleCatalog.key)).leftJoin(maps, eq(historicalTitleGrants.mapId, maps.id)).leftJoin(playerTitleGrants, eq(playerTitleGrants.historicalTitleGrantId, historicalTitleGrants.id)).leftJoin(playerAccounts, eq(playerTitleGrants.playerAccountId, playerAccounts.id))
        .where(query ? or(like(historicalTitleGrants.holderName, query), like(titleCatalog.label, query)) : undefined).orderBy(historicalTitleGrants.holderName).limit(100);
      return rows.map(({ historical, grant, title, mapName, player }) => ({ grantId: grant?.id ?? historical.id, titleKey: title.key, label: title.label, category: title.category, scope: historical.scope as "global" | "map", mapName: mapName ?? undefined, slot: historical.slot as "pioneer" | "conqueror" | "dominator" | undefined, grantedAt: grant?.grantedAt ?? 0, holderName: historical.holderName, playerAccountId: grant?.playerAccountId, playerName: player?.playerName, playerId: player?.playerId, status: grant ? grant.status as "active" | "revoked" : "unclaimed", revokeReason: grant?.revokeReason ?? undefined }));
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
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.groupOpenId, session.groupOpenId), eq(bindings.memberOpenId, session.memberOpenId))).get();
      if (!binding) throw new Error("UNAUTHENTICATED");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      const mapChallenge = await db.select({ challenge: achievementChallenges, map: maps })
        .from(achievementChallenges)
        .innerJoin(maps, eq(achievementChallenges.mapId, maps.id))
        .where(and(eq(achievementChallenges.id, input.challengeId), eq(achievementChallenges.status, "active"), eq(maps.status, "active")))
        .get();
      const titleChallenge = mapChallenge ? null : await db.select({ challenge: titleChallenges, title: titleCatalog })
        .from(titleChallenges)
        .innerJoin(titleCatalog, eq(titleChallenges.titleKey, titleCatalog.key))
        .where(and(eq(titleChallenges.id, input.challengeId), eq(titleChallenges.status, "active"), eq(titleCatalog.scope, "global"), eq(titleCatalog.availability, "active")))
        .get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      if (!mapChallenge && !titleChallenge) throw new Error("CHALLENGE_NOT_FOUND");
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
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.groupOpenId, authSession.groupOpenId), eq(bindings.memberOpenId, authSession.memberOpenId))).get();
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
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.groupOpenId, authSession.groupOpenId), eq(bindings.memberOpenId, authSession.memberOpenId))).get();
      if (!binding || binding.playerAccountId !== session.playerAccountId) throw new Error("UPLOAD_SESSION_INVALID");
      await db.update(uploadSessions).set({ status: "completed" }).where(eq(uploadSessions.id, session.id));
      await db.update(submissions).set({ status: "ocr_pending", updatedAt: now() }).where(eq(submissions.id, session.submissionId));
      if (ocrQueue) await ocrQueue.send({ version: 1, submissionId: session.submissionId, objectKey: session.objectKey });
      return { submissionId: session.submissionId, status: "ocr_pending" };
    },

    async listAdminSubmissions(input) {
      const rows = await db.select().from(submissions).where(input.status ? eq(submissions.status, input.status) : undefined).orderBy(desc(submissions.updatedAt)).limit(51);
      return { contractVersion: "1" as const, items: rows.slice(0, 50).map((row) => ({ submissionId: row.id, status: row.status as never, challengeId: row.challengeId ?? "", mapName: row.mapName, difficulty: row.difficulty ?? "", playerName: row.playerName ?? "", createdAt: row.createdAt, updatedAt: row.updatedAt, ocr: null, evidenceUrl: `${uploadOrigin}/v1/admin/submissions/${row.id}/evidence` })), hasMore: rows.length > 50 };
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
      if (!evidenceBucket || !ocrkitBaseUrl || !ocrkitEvidenceBucket) throw new Error("OCR_NOT_CONFIGURED");
      const response = await fetch(`${ocrkitBaseUrl.replace(/\/$/, "")}/api/v1/ocr/challenge/by-object`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ object_key: input.objectKey, bucket: ocrkitEvidenceBucket }) });
      if (!response.ok) {
        await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: input.submissionId, attempt: input.attempt, status: "error", errorCode: `OCR_HTTP_${response.status}`, createdAt: now() });
        if (input.attempt >= 3) await db.update(submissions).set({ status: "ocr_review_required", updatedAt: now() }).where(eq(submissions.id, input.submissionId));
        throw new Error("OCR_RETRYABLE");
      }
      const result = await response.json() as { data?: { map_name?: string | null; difficulty?: string | null; challenge_completed?: boolean | null; player?: string | null }; fields?: unknown };
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      const data = result.data ?? {};
      const { skipped, ...match } = matchOcrResult({ challengeType: row.challengeType, targetMapName: row.mapName, targetDifficulty: row.difficulty, targetPlayerName: row.playerName, mapName: data.map_name, difficulty: data.difficulty, challengeCompleted: data.challenge_completed, player: data.player });
      const matched = Object.values(match).every(Boolean);
      await db.insert(ocrResults).values({ id: crypto.randomUUID(), submissionId: row.id, attempt: input.attempt, status: matched ? "matched" : "mismatch", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ ...match, skipped }), createdAt: now() });
      await db.update(submissions).set({ status: matched ? "ready_for_review" : "resubmission_required", updatedAt: now(), reviewReason: matched ? null : "OCR 结果与目标挑战不匹配" }).where(eq(submissions.id, row.id));
    },

    async listQqGroupAccess() {
      const groups = await db.select().from(qqGroupAccess).orderBy(desc(qqGroupAccess.updatedAt));
      return groups.map((group) => ({ contractVersion: "1" as const, groupOpenId: group.groupOpenId, environment: group.environment as "production" | "test", enabled: group.enabled === 1, updatedAt: group.updatedAt }));
    },

    async listAdminPlayers(input) {
      const conditions = [];
      if (input.status) conditions.push(eq(playerAccounts.status, input.status));
      if (input.query) {
        const query = `%${input.query}%`;
        const matchingBindings = await db.select({ playerAccountId: bindings.playerAccountId }).from(bindings).where(or(like(bindings.groupOpenId, query), like(bindings.memberOpenId, query)));
        conditions.push(or(like(playerAccounts.playerId, query), like(playerAccounts.playerName, query), like(playerAccounts.normalizedPlayerName, query), ...(matchingBindings.length ? [inArray(playerAccounts.id, matchingBindings.map((binding) => binding.playerAccountId))] : []))!);
      }
      const accounts = await db.select().from(playerAccounts).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(playerAccounts.updatedAt)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize);
      const hasMore = accounts.length > input.pageSize;
      const items = accounts.slice(0, input.pageSize);
      return {
        contractVersion: "1" as const,
        items: await Promise.all(items.map(async (account) => ({
          playerAccountId: account.id,
          playerId: account.playerId,
          playerName: account.playerName,
          status: account.status as "active" | "banned",
          bindingCount: (await db.select().from(bindings).where(eq(bindings.playerAccountId, account.id))).length,
          updatedAt: account.updatedAt,
        }))),
        page: input.page,
        pageSize: input.pageSize,
        hasMore,
      };
    },

    async getAdminPlayer(input) {
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account) throw new Error("PLAYER_NOT_FOUND");
      const playerBindings = await db.select().from(bindings).where(eq(bindings.playerAccountId, account.id)).orderBy(desc(bindings.createdAt));
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
        const accountBindings = await db.select({ groupOpenId: bindings.groupOpenId, memberOpenId: bindings.memberOpenId }).from(bindings).where(eq(bindings.playerAccountId, input.playerAccountId));
        if (accountBindings.length) await db.delete(qqSessions).where(or(...accountBindings.map((binding) => and(eq(qqSessions.groupOpenId, binding.groupOpenId), eq(qqSessions.memberOpenId, binding.memberOpenId)))));
      }
      await recordIdempotency(db, auth.subject, "admin.player.status", idempotencyKey, input, {});
      await recordAudit(db, auth, `admin.player.${input.status}`, "player_account", input.playerAccountId, { status: input.status, reason: input.reason ?? null });
    },

    async removeAdminBinding(input, auth, idempotencyKey) {
      const replay = await replayOrConflict<Record<string, never>>(db, auth.subject, "admin.binding.remove", idempotencyKey, input);
      if (replay) return;
      const binding = await db.select().from(bindings).where(eq(bindings.id, input.bindingId)).get();
      if (!binding) throw new Error("BINDING_NOT_FOUND");
      await db.delete(qqSessions).where(and(eq(qqSessions.groupOpenId, binding.groupOpenId), eq(qqSessions.memberOpenId, binding.memberOpenId)));
      await db.delete(bindings).where(eq(bindings.id, input.bindingId));
      await recordIdempotency(db, auth.subject, "admin.binding.remove", idempotencyKey, input, {});
      await recordAudit(db, auth, "admin.binding.remove", "binding", input.bindingId, { playerAccountId: binding.playerAccountId });
    },

    async upsertQqGroupAccess(input: QqGroupAccessRequest, auth) {
      const timestamp = now();
      const existing = await db.select().from(qqGroupAccess).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId)).get();
      if (existing) {
        await db.update(qqGroupAccess).set({ environment: input.environment, enabled: input.enabled ? 1 : 0, updatedAt: timestamp }).where(eq(qqGroupAccess.groupOpenId, input.groupOpenId));
      } else {
        await db.insert(qqGroupAccess).values({ groupOpenId: input.groupOpenId, environment: input.environment, enabled: input.enabled ? 1 : 0, createdAt: timestamp, updatedAt: timestamp });
      }
      await recordAudit(db, auth, "qq.group_access.update", "qq_group_access", input.groupOpenId, { environment: input.environment, enabled: input.enabled });
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
      const group = await db.select().from(qqGroupAccess).where(and(eq(qqGroupAccess.groupOpenId, input.groupOpenId), eq(qqGroupAccess.enabled, 1))).get();
      if (!group) throw new Error("LOGIN_GROUP_NOT_ALLOWED");
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, input.provider), eq(bindings.groupOpenId, input.groupOpenId), eq(bindings.memberOpenId, input.memberOpenId))).get();
      if (!binding) throw new Error("LOGIN_BINDING_REQUIRED");
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, binding.playerAccountId)).get();
      if (!account || account.status === "banned") throw new Error("PLAYER_BANNED");
      const attempt = await db.select().from(qqLoginAttempts).where(and(eq(qqLoginAttempts.codeHash, await hashRequest(input.code)), eq(qqLoginAttempts.status, "pending"))).get();
      if (!attempt) throw new Error("LOGIN_CODE_INVALID");
      if (attempt.expiresAt <= now()) {
        await db.update(qqLoginAttempts).set({ status: "expired" }).where(eq(qqLoginAttempts.id, attempt.id));
        throw new Error("LOGIN_CODE_EXPIRED");
      }
      await db.update(qqLoginAttempts).set({ status: "verified", groupOpenId: input.groupOpenId, memberOpenId: input.memberOpenId, environment: group.environment, messageId: input.messageId, verifiedAt: now() }).where(eq(qqLoginAttempts.id, attempt.id));
      const response = { contractVersion: "1" as const, status: "verified" as const, environment: group.environment as "production" | "test" };
      await recordIdempotency(db, auth.subject, "qq.login.verify", idempotencyKey, input, response);
      await recordAudit(db, auth, "qq.login.verify", "qq_login_attempt", attempt.id, { environment: group.environment });
      return response;
    },

    async getCurrentPlayer(input) {
      const session = await db.select().from(qqSessions).where(and(eq(qqSessions.tokenHash, await hashRequest(input.sessionToken)), gt(qqSessions.expiresAt, now()))).get();
      if (!session) return null;
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.groupOpenId, session.groupOpenId), eq(bindings.memberOpenId, session.memberOpenId))).get();
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

    async createBinding(input: QqBindingRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["createBinding"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.binding.create", idempotencyKey, input);
      if (replay) return replay;

      const existing = await db.select().from(bindings).where(and(eq(bindings.provider, input.provider), eq(bindings.groupOpenId, input.groupOpenId), eq(bindings.memberOpenId, input.memberOpenId))).get();
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
    },

    async createSubmission(input: SubmissionRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["createSubmission"]> extends Promise<infer T> ? T : never>(db, auth.subject, "submission.create", idempotencyKey, input);
      if (replay) return replay;
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, input.actor.provider), eq(bindings.groupOpenId, input.actor.groupOpenId), eq(bindings.memberOpenId, input.actor.memberOpenId))).get();
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
