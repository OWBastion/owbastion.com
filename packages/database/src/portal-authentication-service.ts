import { and, eq, gt, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createPasskeyAuthenticationOptions, createPasskeyRegistrationOptions, passkeyUserHandleMatches, verifyPasskeyAuthentication, verifyPasskeyRegistration } from "@owbastion/auth";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { QqLoginAttemptRequest, QqLoginVerifyRequest } from "@owbastion/contracts";
import { bindings, idempotencyKeys, passkeyChallenges, passkeyCredentials, passkeyRecoveryGrants, playerAccounts, portalSessions, qqGroupAccess, qqLoginAttempts } from "./schema";
import { resolvePortalSession } from "./portal-session";

type PortalAuthenticationServices = Pick<PlatformServices,
  | "createQqLoginAttempt"
  | "getQqLoginStatus"
  | "verifyQqLogin"
  | "createPasskeyLoginOptions"
  | "createCurrentPlayerPasskeyRegistrationOptions"
  | "completeCurrentPlayerPasskeyRegistration"
  | "listCurrentPlayerPasskeys"
  | "removeCurrentPlayerPasskey"
  | "createAdminPasskeyRecovery"
  | "createPasskeyRecoveryOptions"
  | "completePasskeyRecoveryRegistration"
  | "completePasskeyLogin"
  | "logoutPortalSession"
  | "listLocalDevAccounts"
  | "createLocalDevSession"
>;

type PortalAuthenticationDependencies = {
  now: () => number;
  randomToken: (bytes?: number) => string;
  randomCode: (length: number) => string;
  hashRequest: (value: unknown) => Promise<string>;
  sessionTtlMs: number;
  expiredAuthRowRetentionMs: number;
  pruneExpiredPortalSessions: (timestamp: number) => Promise<void>;
  bindingInviteCodeEncryptionKey?: string;
  encryptBindingInviteCode: (code: string, secret?: string) => Promise<string>;
  decryptBindingInviteCode: (value: string, secret?: string) => Promise<string>;
  replayOrConflict: <T>(db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown) => Promise<T | null>;
  recordIdempotency: (db: ReturnType<typeof drizzle>, actorId: string, operation: string, key: string, input: unknown, response: unknown) => Promise<void>;
  recordAudit: (db: ReturnType<typeof drizzle>, auth: AuthContext, operation: string, entityType: string, entityId: string, payload: unknown) => Promise<void>;
};

export const createPortalAuthenticationServices = (
  database: D1Database,
  db: ReturnType<typeof drizzle>,
  dependencies: PortalAuthenticationDependencies,
): PortalAuthenticationServices => {
  const { now, randomToken, randomCode, hashRequest, sessionTtlMs, expiredAuthRowRetentionMs, pruneExpiredPortalSessions, bindingInviteCodeEncryptionKey, encryptBindingInviteCode, decryptBindingInviteCode, replayOrConflict, recordIdempotency, recordAudit } = dependencies;
  const loginTtlMs = 2 * 60 * 1000;
  const passkeyChallengeTtlMs = 5 * 60 * 1000;
  const passkeyRecoveryTtlMs = 30 * 60 * 1000;
  const getCurrentPortalPlayer = (sessionToken: string) => resolvePortalSession(db, sessionToken);

  const runPasskeyRegistrationBatch = async (statements: D1PreparedStatement[]) => {
    try { return await database.batch(statements); }
    catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("UNIQUE constraint failed: player_accounts")) throw new Error("PLAYER_ACCOUNT_EXISTS");
      if (message.includes("UNIQUE constraint failed: passkey_credentials")) throw new Error("PASSKEY_REGISTRATION_INVALID");
      throw error;
    }
  };
  const pruneExpiredPasskeyChallenges = async (timestamp: number) => {
    await database.batch([
      database.prepare("DELETE FROM portal_sessions WHERE expires_at <= ? AND passkey_challenge_id IN (SELECT id FROM passkey_challenges WHERE expires_at <= ?)").bind(timestamp, timestamp),
      database.prepare(`
        DELETE FROM passkey_challenges
        WHERE expires_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM portal_sessions
            WHERE portal_sessions.passkey_challenge_id = passkey_challenges.id
              AND portal_sessions.expires_at > ?
          )
      `).bind(timestamp, timestamp),
    ]);
  };

  // Anonymous callers can create qq_login_attempts rows without authentication (#245), so this table's retention
  // runs on its own creation path rather than waiting for an authenticated maintenance path or a cron decision.
  // Pending confirmation claims are pruned from redeemBindingInvite, and expired Portal sessions when a new
  // session is issued; approved and pending-review claims remain as business and migration provenance.
  const pruneExpiredAuthRows = async (timestamp: number) => {
    const staleBefore = timestamp - expiredAuthRowRetentionMs;
    await database.batch([
      database.prepare("UPDATE qq_login_attempts SET status = 'expired' WHERE status = 'pending' AND expires_at <= ?").bind(timestamp),
      database.prepare("DELETE FROM qq_login_attempts WHERE status != 'pending' AND expires_at <= ?").bind(staleBefore),
    ]);
  };

  return {
    async createQqLoginAttempt(_input: QqLoginAttemptRequest) {
      const timestamp = now();
      await pruneExpiredAuthRows(timestamp);
      const attemptId = crypto.randomUUID();
      const attemptToken = randomToken();
      const tokenHash = await hashRequest(attemptToken);
      const maxCodeAttempts = 5;
      for (let attemptIndex = 0; attemptIndex < maxCodeAttempts; attemptIndex += 1) {
        const code = randomCode(6);
        try {
          await db.insert(qqLoginAttempts).values({ id: attemptId, tokenHash, codeHash: await hashRequest(code), status: "pending", expiresAt: timestamp + loginTtlMs, createdAt: timestamp });
          return { contractVersion: "1" as const, attemptId, attemptToken, code, expiresAt: timestamp + loginTtlMs };
        } catch (error) {
          const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
          const message = cause instanceof Error ? cause.message : "";
          // A live pending attempt already holds this code_hash (qq_login_attempts_pending_code_idx); retry with a fresh code.
          if (!message.includes("UNIQUE constraint failed: qq_login_attempts.code_hash") || attemptIndex === maxCodeAttempts - 1) throw error;
        }
      }
      throw new Error("LOGIN_CODE_UNAVAILABLE");
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
      const binding = await db.select().from(bindings).where(and(eq(bindings.provider, "qq"), eq(bindings.memberOpenId, attempt.memberOpenId), eq(bindings.status, "active"))).get();
      const account = binding ? await db.select().from(playerAccounts).where(and(eq(playerAccounts.id, binding.playerAccountId), eq(playerAccounts.status, "active"))).get() : null;
      if (!account) return { contractVersion: "1" as const, status: "expired" as const };
      const sessionToken = randomToken();
      const timestamp = now();
      await pruneExpiredPortalSessions(timestamp);
      await db.insert(portalSessions).values({ id: crypto.randomUUID(), playerAccountId: account.id, tokenHash: await hashRequest(sessionToken), expiresAt: timestamp + sessionTtlMs, createdAt: timestamp });
      await db.update(qqLoginAttempts).set({ sessionTokenHash: await hashRequest(sessionToken), sessionIssuedAt: timestamp }).where(eq(qqLoginAttempts.id, attempt.id));
      return { contractVersion: "1" as const, status: "verified" as const, environment: attempt.environment as "production" | "test", sessionToken };
    },

    async verifyQqLogin(input: QqLoginVerifyRequest, auth, idempotencyKey) {
      const replay = await replayOrConflict<ReturnType<PlatformServices["verifyQqLogin"]> extends Promise<infer T> ? T : never>(db, auth.subject, "qq.login.verify", idempotencyKey, input);
      if (replay) return replay;
      const timestamp = now();
      const codeHash = await hashRequest(input.code);
      // qq_login_attempts_pending_code_idx guarantees at most one pending row per code_hash, so this can only ever
      // match the single live attempt for that code, never an older abandoned-but-pending row sharing the same code.
      const attempt = await db.select().from(qqLoginAttempts).where(and(eq(qqLoginAttempts.codeHash, codeHash), eq(qqLoginAttempts.status, "pending"), gt(qqLoginAttempts.expiresAt, timestamp))).get();
      if (!attempt) {
        const staleAttempt = await db.select().from(qqLoginAttempts).where(and(eq(qqLoginAttempts.codeHash, codeHash), eq(qqLoginAttempts.status, "pending"))).get();
        if (staleAttempt) {
          await db.update(qqLoginAttempts).set({ status: "expired" }).where(eq(qqLoginAttempts.id, staleAttempt.id));
          throw new Error("LOGIN_CODE_EXPIRED");
        }
        throw new Error("LOGIN_CODE_INVALID");
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


    async createPasskeyLoginOptions(input) {
      const options = await createPasskeyAuthenticationOptions(input.rpId);
      const timestamp = now();
      const challengeId = crypto.randomUUID();
      await pruneExpiredPasskeyChallenges(timestamp);
      await db.insert(passkeyChallenges).values({ id: challengeId, purpose: "login", challenge: options.challenge, playerAccountId: null, inviteId: null, recoveryGrantId: null, expiresAt: timestamp + passkeyChallengeTtlMs, usedAt: null, consumedBy: null, createdAt: timestamp });
      return { contractVersion: "1" as const, challengeId, options: { ...options } };
    },

    async createCurrentPlayerPasskeyRegistrationOptions(input) {
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current || current.player.status !== "active") throw new Error("UNAUTHENTICATED");
      const existing = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.playerAccountId, current.player.id));
      const options = await createPasskeyRegistrationOptions({
        rpId: input.rpId,
        accountId: current.player.id,
        userName: `${current.player.playerName}#${current.player.playerId}`,
        displayName: current.player.playerName,
        excludeCredentials: existing.map((credential) => ({ id: credential.credentialId, ...(credential.transportsJson ? { transports: JSON.parse(credential.transportsJson) as string[] } : {}) })),
      });
      const timestamp = now();
      const challengeId = crypto.randomUUID();
      await pruneExpiredPasskeyChallenges(timestamp);
      await db.insert(passkeyChallenges).values({ id: challengeId, purpose: "registration", challenge: options.challenge, playerAccountId: current.player.id, inviteId: null, recoveryGrantId: null, expiresAt: timestamp + passkeyChallengeTtlMs, usedAt: null, consumedBy: null, createdAt: timestamp });
      return { contractVersion: "1" as const, challengeId, options: { ...options } };
    },

    async completeCurrentPlayerPasskeyRegistration(input) {
      const current = await getCurrentPortalPlayer(input.sessionToken);
      const timestamp = now();
      const challenge = await db.select().from(passkeyChallenges).where(and(eq(passkeyChallenges.id, input.challengeId), eq(passkeyChallenges.purpose, "registration"), isNull(passkeyChallenges.usedAt), gt(passkeyChallenges.expiresAt, timestamp))).get();
      if (!current || current.player.status !== "active" || !challenge || challenge.playerAccountId !== current.player.id) throw new Error("PASSKEY_CHALLENGE_INVALID");
      const registered = await verifyPasskeyRegistration({ credential: input.credential, challenge: challenge.challenge, origin: input.origin, rpId: input.rpId });
      const consumedBy = randomToken(16);
      const credentialRowId = crypto.randomUUID();
      const results = await runPasskeyRegistrationBatch([
        database.prepare("UPDATE passkey_challenges SET used_at = ?, consumed_by = ? WHERE id = ? AND purpose = 'registration' AND player_account_id = ? AND used_at IS NULL AND expires_at > ?").bind(timestamp, consumedBy, challenge.id, current.player.id, timestamp),
        database.prepare("INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at, last_used_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM player_accounts WHERE id = ? AND status = 'active')").bind(credentialRowId, current.player.id, registered.credentialId, registered.publicKey, registered.counter, JSON.stringify(registered.transports), input.name, timestamp, challenge.id, consumedBy, current.player.id),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'user', ?, 'passkey.register', 'player_account', ?, ?, ? WHERE EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM passkey_credentials WHERE id = ?)").bind(crypto.randomUUID(), crypto.randomUUID(), current.player.id, current.player.id, JSON.stringify({ passkeyName: input.name }), timestamp, challenge.id, consumedBy, credentialRowId),
      ]);
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) throw new Error("PASSKEY_CHALLENGE_REPLAYED");
    },

    async listCurrentPlayerPasskeys(input) {
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) return null;
      const items = await db.select({ passkeyId: passkeyCredentials.id, name: passkeyCredentials.name, createdAt: passkeyCredentials.createdAt, lastUsedAt: passkeyCredentials.lastUsedAt }).from(passkeyCredentials).where(eq(passkeyCredentials.playerAccountId, current.player.id)).orderBy(passkeyCredentials.createdAt);
      const qqBinding = await db.select({ id: bindings.id }).from(bindings).where(and(eq(bindings.playerAccountId, current.player.id), eq(bindings.provider, "qq"), eq(bindings.status, "active"))).get();
      return { contractVersion: "1" as const, items, qqBound: Boolean(qqBinding) };
    },

    async removeCurrentPlayerPasskey(input) {
      const current = await getCurrentPortalPlayer(input.sessionToken);
      if (!current) throw new Error("UNAUTHENTICATED");
      const credentials = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.playerAccountId, current.player.id));
      const credential = credentials.find(({ id }) => id === input.passkeyId);
      if (!credential) throw new Error("PASSKEY_NOT_FOUND");
      const qqBinding = await db.select({ id: bindings.id }).from(bindings).where(and(eq(bindings.playerAccountId, current.player.id), eq(bindings.provider, "qq"), eq(bindings.status, "active"))).get();
      if (credentials.length < 2 && !qqBinding) throw new Error("PASSKEY_LAST_CREDENTIAL");
      const results = await database.batch([
        database.prepare("DELETE FROM passkey_credentials WHERE id = ? AND player_account_id = ? AND ((SELECT COUNT(*) FROM passkey_credentials WHERE player_account_id = ?) > 1 OR EXISTS (SELECT 1 FROM bindings WHERE player_account_id = ? AND provider = 'qq' AND status = 'active'))").bind(credential.id, current.player.id, current.player.id, current.player.id),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'user', ?, 'passkey.remove', 'passkey_credential', ?, '{}', ? WHERE changes() = 1").bind(crypto.randomUUID(), crypto.randomUUID(), current.player.id, credential.id, now()),
      ]);
      if (results[0]?.meta.changes !== 1) throw new Error("PASSKEY_LAST_CREDENTIAL");
    },

    async createAdminPasskeyRecovery(input, auth, idempotencyKey) {
      const operation = "admin.passkey_recovery.create";
      const request = { playerAccountId: input.playerAccountId, identityVerified: input.identityVerified };
      const requestHash = await hashRequest(request);
      const existing = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.id, `${auth.subject}:${operation}:${idempotencyKey}`)).get();
      if (existing) {
        if (existing.requestHash !== requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
        const saved = JSON.parse(existing.responseJson) as { tokenCiphertext: string; expiresAt: number };
        return { token: await decryptBindingInviteCode(saved.tokenCiphertext, bindingInviteCodeEncryptionKey), expiresAt: saved.expiresAt };
      }
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.playerAccountId)).get();
      if (!account || account.status !== "active") throw new Error("PLAYER_NOT_FOUND");
      const timestamp = now();
      const expiresAt = timestamp + passkeyRecoveryTtlMs;
      const token = randomToken();
      const tokenCiphertext = await encryptBindingInviteCode(token, bindingInviteCodeEncryptionKey);
      const grantId = crypto.randomUUID();
      await database.batch([
        database.prepare("UPDATE passkey_recovery_grants SET used_at = ? WHERE player_account_id = ? AND used_at IS NULL").bind(timestamp, account.id),
        database.prepare("INSERT INTO passkey_recovery_grants (id, player_account_id, token_hash, expires_at, used_at, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)").bind(grantId, account.id, await hashRequest(token), expiresAt, auth.subject, timestamp),
        database.prepare("INSERT INTO idempotency_keys (id, actor_id, operation, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(`${auth.subject}:${operation}:${idempotencyKey}`, auth.subject, operation, requestHash, JSON.stringify({ tokenCiphertext, expiresAt }), timestamp),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) VALUES (?, ?, ?, ?, 'passkey.recovery.issue', 'player_account', ?, ?, ?)").bind(crypto.randomUUID(), crypto.randomUUID(), auth.actorType, auth.subject, account.id, JSON.stringify({ identityVerified: true, expiresAt }), timestamp),
      ]);
      return { token, expiresAt };
    },

    async createPasskeyRecoveryOptions(input) {
      const timestamp = now();
      const tokenHash = await hashRequest(input.token);
      const grant = await db.select({ grant: passkeyRecoveryGrants, player: playerAccounts }).from(passkeyRecoveryGrants)
        .innerJoin(playerAccounts, eq(passkeyRecoveryGrants.playerAccountId, playerAccounts.id))
        .where(and(eq(passkeyRecoveryGrants.tokenHash, tokenHash), isNull(passkeyRecoveryGrants.usedAt), gt(passkeyRecoveryGrants.expiresAt, timestamp), eq(playerAccounts.status, "active"))).get();
      if (!grant) throw new Error("PASSKEY_RECOVERY_INVALID");
      const options = await createPasskeyRegistrationOptions({ rpId: input.rpId, accountId: grant.player.id, userName: `${grant.player.playerName}#${grant.player.playerId}`, displayName: grant.player.playerName });
      const challengeId = crypto.randomUUID();
      await pruneExpiredPasskeyChallenges(timestamp);
      await db.insert(passkeyChallenges).values({ id: challengeId, purpose: "recovery", challenge: options.challenge, playerAccountId: grant.player.id, inviteId: null, recoveryGrantId: grant.grant.id, expiresAt: timestamp + passkeyChallengeTtlMs, usedAt: null, consumedBy: null, createdAt: timestamp });
      return { contractVersion: "1" as const, challengeId, options: { ...options } };
    },

    async completePasskeyRecoveryRegistration(input) {
      const timestamp = now();
      const challenge = await db.select().from(passkeyChallenges).where(and(eq(passkeyChallenges.id, input.challengeId), eq(passkeyChallenges.purpose, "recovery"), isNull(passkeyChallenges.usedAt), gt(passkeyChallenges.expiresAt, timestamp))).get();
      if (!challenge?.playerAccountId || !challenge.recoveryGrantId) throw new Error("PASSKEY_RECOVERY_INVALID");
      const grant = await db.select().from(passkeyRecoveryGrants).where(and(eq(passkeyRecoveryGrants.id, challenge.recoveryGrantId), eq(passkeyRecoveryGrants.tokenHash, await hashRequest(input.token)), isNull(passkeyRecoveryGrants.usedAt), gt(passkeyRecoveryGrants.expiresAt, timestamp))).get();
      if (!grant || grant.playerAccountId !== challenge.playerAccountId) throw new Error("PASSKEY_RECOVERY_INVALID");
      const account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.id, challenge.playerAccountId), eq(playerAccounts.status, "active"))).get();
      if (!account) throw new Error("PASSKEY_RECOVERY_INVALID");
      const registered = await verifyPasskeyRegistration({ credential: input.credential, challenge: challenge.challenge, origin: input.origin, rpId: input.rpId });
      const consumedBy = randomToken(16);
      const credentialRowId = crypto.randomUUID();
      const sessionToken = randomToken();
      const sessionId = crypto.randomUUID();
      await pruneExpiredPortalSessions(timestamp);
      const results = await runPasskeyRegistrationBatch([
        database.prepare("UPDATE passkey_challenges SET used_at = ?, consumed_by = ? WHERE id = ? AND purpose = 'recovery' AND player_account_id = ? AND used_at IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM passkey_recovery_grants WHERE id = ? AND player_account_id = ? AND used_at IS NULL AND expires_at > ?)").bind(timestamp, consumedBy, challenge.id, account.id, timestamp, grant.id, account.id, timestamp),
        database.prepare("UPDATE passkey_recovery_grants SET used_at = ? WHERE id = ? AND player_account_id = ? AND used_at IS NULL AND expires_at > ? AND EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?)").bind(timestamp, grant.id, account.id, timestamp, challenge.id, consumedBy),
        database.prepare("DELETE FROM passkey_credentials WHERE player_account_id = ? AND EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?)").bind(account.id, challenge.id, consumedBy),
        database.prepare("DELETE FROM portal_sessions WHERE player_account_id = ? AND EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?)").bind(account.id, challenge.id, consumedBy),
        database.prepare("INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at, last_used_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL WHERE EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM passkey_recovery_grants WHERE id = ? AND used_at = ?) AND EXISTS (SELECT 1 FROM player_accounts WHERE id = ? AND status = 'active')").bind(credentialRowId, account.id, registered.credentialId, registered.publicKey, registered.counter, JSON.stringify(registered.transports), input.name, timestamp, challenge.id, consumedBy, grant.id, timestamp, account.id),
        database.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, passkey_challenge_id, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM passkey_credentials WHERE id = ?)").bind(sessionId, account.id, await hashRequest(sessionToken), challenge.id, timestamp + sessionTtlMs, timestamp, challenge.id, consumedBy, credentialRowId),
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'user', ?, 'passkey.recovery.complete', 'player_account', ?, ?, ? WHERE EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM passkey_credentials WHERE id = ?)").bind(crypto.randomUUID(), crypto.randomUUID(), account.id, account.id, JSON.stringify({ passkeyName: input.name }), timestamp, challenge.id, consumedBy, credentialRowId),
      ]);
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1 || results[4]?.meta.changes !== 1 || results[5]?.meta.changes !== 1) throw new Error("PASSKEY_RECOVERY_INVALID");
      return { sessionToken };
    },

    async completePasskeyLogin(input) {
      const timestamp = now();
      const challenge = await db.select().from(passkeyChallenges).where(and(eq(passkeyChallenges.id, input.challengeId), eq(passkeyChallenges.purpose, "login"), isNull(passkeyChallenges.usedAt), gt(passkeyChallenges.expiresAt, timestamp))).get();
      const credentialId = typeof input.credential.id === "string" ? input.credential.id : "";
      if (!challenge || !credentialId) throw new Error("PASSKEY_CHALLENGE_INVALID");
      const stored = await db.select().from(passkeyCredentials).where(eq(passkeyCredentials.credentialId, credentialId)).get();
      if (!stored) throw new Error("PASSKEY_CREDENTIAL_INVALID");
      const account = await db.select().from(playerAccounts).where(and(eq(playerAccounts.id, stored.playerAccountId), eq(playerAccounts.status, "active"))).get();
      if (!account) throw new Error("PASSKEY_CREDENTIAL_INVALID");
      const response = input.credential.response;
      const userHandle = typeof response === "object" && response !== null && "userHandle" in response && typeof response.userHandle === "string" ? response.userHandle : undefined;
      if (!passkeyUserHandleMatches(userHandle, account.id)) throw new Error("PASSKEY_CREDENTIAL_INVALID");
      const verified = await verifyPasskeyAuthentication({ credential: input.credential, challenge: challenge.challenge, origin: input.origin, rpId: input.rpId, storedCredential: { id: stored.credentialId, publicKey: stored.publicKey, counter: stored.counter, transports: stored.transportsJson ? JSON.parse(stored.transportsJson) as string[] : undefined } });
      if (verified.credentialId !== stored.credentialId) throw new Error("PASSKEY_CREDENTIAL_INVALID");
      const sessionToken = randomToken();
      const tokenHash = await hashRequest(sessionToken);
      const consumedBy = randomToken(16);
      const sessionId = crypto.randomUUID();
      await pruneExpiredPortalSessions(timestamp);
      const results = await database.batch([
        database.prepare("UPDATE passkey_challenges SET used_at = ?, consumed_by = ? WHERE id = ? AND purpose = 'login' AND used_at IS NULL AND expires_at > ?").bind(timestamp, consumedBy, challenge.id, timestamp),
        database.prepare("UPDATE passkey_credentials SET counter = ?, last_used_at = ? WHERE id = ? AND counter = ? AND EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?)").bind(verified.newCounter, timestamp, stored.id, stored.counter, challenge.id, consumedBy),
        database.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, passkey_challenge_id, expires_at, created_at) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM passkey_challenges WHERE id = ? AND consumed_by = ?) AND EXISTS (SELECT 1 FROM passkey_credentials WHERE id = ? AND counter = ? AND last_used_at = ?)").bind(sessionId, account.id, tokenHash, challenge.id, timestamp + sessionTtlMs, timestamp, challenge.id, consumedBy, stored.id, verified.newCounter, timestamp),
      ]);
      if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1 || results[2]?.meta.changes !== 1) throw new Error("PASSKEY_CHALLENGE_REPLAYED");
      return { sessionToken };
    },

    async logoutPortalSession(input) {
      await db.delete(portalSessions).where(eq(portalSessions.tokenHash, await hashRequest(input.sessionToken)));
    },

    async listLocalDevAccounts() {
      const accounts = await db.select().from(playerAccounts).where(or(eq(playerAccounts.playerId, "local-player"), eq(playerAccounts.playerId, "local-admin"))).orderBy(playerAccounts.playerId);
      return accounts.map((account) => ({ accountId: account.id, playerId: account.playerId, playerName: account.playerName, isAdmin: account.isAdmin === 1 }));
    },

    async createLocalDevSession(input) {
      const account = await db.select().from(playerAccounts).where(eq(playerAccounts.id, input.accountId)).get();
      if (!account || !["local-player", "local-admin"].includes(account.playerId)) throw new Error("LOCAL_ACCOUNT_NOT_FOUND");
      const timestamp = now();
      const sessionToken = randomToken();
      const sessionTokenHash = await hashRequest(sessionToken);
      await pruneExpiredPortalSessions(timestamp);
      await db.insert(portalSessions).values({ id: crypto.randomUUID(), playerAccountId: account.id, tokenHash: sessionTokenHash, expiresAt: timestamp + sessionTtlMs, createdAt: timestamp });
      return { sessionToken };
    },
  };
};
