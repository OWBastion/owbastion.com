import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { QqBindingRequest, SubmissionRequest } from "@owbastion/contracts";
import { attachments, auditEvents, bindings, identities, idempotencyKeys, playerAccounts, submissions } from "./schema";

const now = () => Date.now();

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
  const objectKey = `evidence/submissions/${submissionId}/${sha256}.${extension}`;
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: responseType } });
  await db.update(attachments).set({ objectKey, sha256, byteSize: bytes.byteLength, uploadStatus: "stored" }).where(eq(attachments.id, attachmentId));
  return objectKey;
};

export const createPlatformServices = (database: D1Database, evidenceBucket?: R2Bucket): PlatformServices => {
  const db = drizzle(database);

  return {
    async createBinding(input: QqBindingRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["createBinding"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.binding.create", idempotencyKey, input);
      if (replay) return replay;

      const existing = await db.select().from(bindings).where(and(eq(bindings.provider, input.provider), eq(bindings.groupOpenId, input.groupOpenId), eq(bindings.memberOpenId, input.memberOpenId))).get();
      let account = existing
        ? await db.select().from(playerAccounts).where(eq(playerAccounts.id, existing.playerAccountId)).get()
        : await db.select().from(playerAccounts).where(eq(playerAccounts.playerId, input.playerId)).get();
      if (existing && account?.playerId !== input.playerId) throw new Error("BINDING_CONFLICT");
      if (!account) {
        const timestamp = now();
        account = { id: crypto.randomUUID(), playerId: input.playerId, playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), createdAt: timestamp, updatedAt: timestamp };
        await db.insert(playerAccounts).values(account);
      } else if (account.playerName !== input.playerName) {
        await db.update(playerAccounts).set({ playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), updatedAt: now() }).where(eq(playerAccounts.id, account.id));
        account = { ...account, playerName: input.playerName, normalizedPlayerName: normalizePlayerName(input.playerName), updatedAt: now() };
      }

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
      return { contractVersion: "1" as const, submissionId: submission.id, status: submission.status as "received" | "evidence_pending" | "evidence_stored" | "ocr_pending" | "resubmission_required", mapName: submission.mapName, createdAt: submission.createdAt, updatedAt: submission.updatedAt };
    },
  };
};

export * from "./schema";
