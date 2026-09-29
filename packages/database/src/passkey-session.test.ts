import {
  auditEventsRequiredIdSchema,
  bindingInvitesSchema,
  idempotencyKeysRequiredIdSchema,
  playerAccountsSchema,
} from "../test/schema";
import { createTestD1 } from "../test/d1";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

const { verifyAuthentication, verifyRegistration } = vi.hoisted(() => ({
  verifyAuthentication: vi.fn(),
  verifyRegistration: vi.fn(async () => ({ credentialId: "credential.registered", publicKey: "cHVi", counter: 0, transports: [] })),
}));

vi.mock("@owbastion/auth", async (importOriginal) => {
  const original = await importOriginal<typeof import("@owbastion/auth")>();
  let nextChallenge = 0;
  return {
    ...original,
    createPasskeyAuthenticationOptions: vi.fn(async () => ({ challenge: `login-challenge-${++nextChallenge}` })),
    createPasskeyRegistrationOptions: vi.fn(async () => ({ challenge: `registration-challenge-${++nextChallenge}` })),
    verifyPasskeyAuthentication: verifyAuthentication,
    verifyPasskeyRegistration: verifyRegistration,
  };
});

const { createPlatformServices } = await import("./index");
const { hashRequest, resolvePortalSession } = await import("./portal-session");

const createD1 = () => createTestD1({ foreignKeys: true, batchMode: "serialized", reportWriteChangesInAll: true });
const installSchema = (sqlite: DatabaseSync) => sqlite.exec(`
  ${playerAccountsSchema}
  CREATE UNIQUE INDEX player_accounts_battletag_idx ON player_accounts(normalized_player_name, player_id);
  CREATE TABLE bindings (id TEXT PRIMARY KEY, identity_id TEXT, player_account_id TEXT NOT NULL, provider TEXT NOT NULL, group_open_id TEXT, member_open_id TEXT, status TEXT NOT NULL, revoked_at INTEGER, revoked_by TEXT, created_at INTEGER NOT NULL);
  ${bindingInvitesSchema}
  CREATE TABLE binding_invite_historical_title_grants (
    id TEXT PRIMARY KEY NOT NULL, invite_id TEXT NOT NULL, historical_title_grant_id TEXT NOT NULL,
    authorized_by TEXT NOT NULL, status TEXT NOT NULL, player_title_grant_id TEXT, last_error TEXT,
    created_at INTEGER NOT NULL, processed_at INTEGER
  );
  CREATE TABLE passkey_credentials (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    credential_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, counter INTEGER NOT NULL,
    transports_json TEXT, name TEXT NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER
  );
  CREATE TABLE passkey_challenges (
    id TEXT PRIMARY KEY NOT NULL, purpose TEXT NOT NULL, challenge TEXT NOT NULL,
    player_account_id TEXT, invite_id TEXT REFERENCES binding_invites(id), recovery_grant_id TEXT REFERENCES passkey_recovery_grants(id),
    expires_at INTEGER NOT NULL, used_at INTEGER, consumed_by TEXT, created_at INTEGER NOT NULL
  );
  CREATE TABLE passkey_recovery_grants (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  ${idempotencyKeysRequiredIdSchema}
  CREATE TABLE portal_sessions (
    id TEXT PRIMARY KEY NOT NULL, player_account_id TEXT NOT NULL REFERENCES player_accounts(id),
    token_hash TEXT NOT NULL UNIQUE, passkey_challenge_id TEXT UNIQUE REFERENCES passkey_challenges(id),
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  ${auditEventsRequiredIdSchema}
`);

const addAccount = (sqlite: DatabaseSync, id: string, playerId: string, isAdmin = 0) => {
  sqlite.prepare(`
    INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', 1, 1)
  `).run(id, playerId, `Player ${playerId}`, `player ${playerId}`, isAdmin);
};

const addSession = async (sqlite: DatabaseSync, id: string, accountId: string, token: string) => {
  sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, accountId, await hashRequest(token), Date.now() + 60_000, Date.now());
};

describe("Passkey session and ownership boundaries", () => {
  afterEach(() => {
    verifyAuthentication.mockReset();
    verifyRegistration.mockReset();
    vi.useRealTimers();
  });

  it("issues a direct Player Account session once and revokes it on logout", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    addAccount(sqlite, "account.one", "1001");
    sqlite.prepare(`
      INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at)
      VALUES ('credential.row', 'account.one', 'credential.one', 'cHVi', 8, '[]', 'laptop', 1)
    `).run();
    const services = createPlatformServices(database);

    const issued = await services.createPasskeyLoginOptions({ rpId: "owbastion.com" });
    expect(issued.options.challenge).toBe("login-challenge-1");
    verifyAuthentication.mockImplementation(async ({ challenge, origin, rpId, storedCredential }) => {
      expect(challenge).toBe("login-challenge-1");
      expect(origin).toBe("https://owbastion.com");
      expect(rpId).toBe("owbastion.com");
      return { credentialId: storedCredential.id, newCounter: 9 };
    });

    const { sessionToken } = await services.completePasskeyLogin({
      contractVersion: "1", challengeId: issued.challengeId, credential: { id: "credential.one" },
      origin: "https://owbastion.com", rpId: "owbastion.com",
    });
    const playerSession = await resolvePortalSession(database, sessionToken);
    expect(playerSession?.player.id).toBe("account.one");
    expect(sqlite.prepare("SELECT counter FROM passkey_credentials WHERE id = 'credential.row'").get()).toEqual({ counter: 9 });

    await expect(services.completePasskeyLogin({
      contractVersion: "1", challengeId: issued.challengeId, credential: { id: "credential.one" },
      origin: "https://owbastion.com", rpId: "owbastion.com",
    })).rejects.toThrow("PASSKEY_CHALLENGE_INVALID");
    await services.logoutPortalSession({ sessionToken });
    expect(await resolvePortalSession(database, sessionToken)).toBeNull();
  });

  it("keeps registration challenges and credentials within the authenticated Player Account", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    addAccount(sqlite, "account.one", "1001");
    addAccount(sqlite, "account.two", "1002");
    await addSession(sqlite, "session.one", "account.one", "session-token.one");
    await addSession(sqlite, "session.two", "account.two", "session-token.two");
    sqlite.prepare(`
      INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at)
      VALUES ('credential.row.one', 'account.one', 'credential.one', 'cHVi', 0, '[]', 'first device', 1),
             ('credential.row.two', 'account.two', 'credential.two', 'cHVi', 0, '[]', 'other player device', 1)
    `).run();
    const services = createPlatformServices(database);

    const options = await services.createCurrentPlayerPasskeyRegistrationOptions({ sessionToken: "session-token.one", name: "second device", rpId: "owbastion.com" });
    expect(options.options.challenge).toBe("registration-challenge-2");
    const verifyInput = { contractVersion: "1" as const, challengeId: options.challengeId, credential: { id: "new.credential" }, name: "second device", origin: "https://owbastion.com", rpId: "owbastion.com" };
    await expect(services.completeCurrentPlayerPasskeyRegistration({ ...verifyInput, sessionToken: "session-token.two" })).rejects.toThrow("PASSKEY_CHALLENGE_INVALID");
    await services.completeCurrentPlayerPasskeyRegistration({ ...verifyInput, sessionToken: "session-token.one" });

    const ownPasskeys = await services.listCurrentPlayerPasskeys({ sessionToken: "session-token.one" });
    expect(ownPasskeys?.items.map(({ name }) => name)).toEqual(["first device", "second device"]);
    const secondPasskeyId = ownPasskeys?.items.find(({ name }) => name === "second device")?.passkeyId;
    expect(secondPasskeyId).toBeTruthy();
    await expect(services.removeCurrentPlayerPasskey({ sessionToken: "session-token.two", passkeyId: "credential.row.one" })).rejects.toThrow("PASSKEY_NOT_FOUND");
    await services.removeCurrentPlayerPasskey({ sessionToken: "session-token.one", passkeyId: "credential.row.one" });
    await expect(services.removeCurrentPlayerPasskey({ sessionToken: "session-token.one", passkeyId: secondPasskeyId! })).rejects.toThrow("PASSKEY_LAST_CREDENTIAL");
  });

  it("rejects a discoverable credential when its user handle identifies another account", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    addAccount(sqlite, "account.one", "1001");
    addAccount(sqlite, "account.two", "1002");
    sqlite.prepare(`
      INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at)
      VALUES ('credential.row.two', 'account.two', 'credential.two', 'cHVi', 0, '[]', 'device', 1)
    `).run();
    const services = createPlatformServices(database);
    const issued = await services.createPasskeyLoginOptions({ rpId: "owbastion.com" });
    const userHandle = Buffer.from("account.one").toString("base64url");
    await expect(services.completePasskeyLogin({
      contractVersion: "1", challengeId: issued.challengeId,
      credential: { id: "credential.two", response: { userHandle } },
      origin: "https://owbastion.com", rpId: "owbastion.com",
    })).rejects.toThrow("PASSKEY_CREDENTIAL_INVALID");
    expect(verifyAuthentication).not.toHaveBeenCalled();
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_sessions").get()).toEqual({ count: 0 });
  });

  it("allows only one concurrent completion of a one-time recovery grant", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00.000Z"));
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    addAccount(sqlite, "account.one", "1001");
    sqlite.prepare(`
      INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at)
      VALUES ('credential.old', 'account.one', 'credential.old', 'cHVi', 0, '[]', 'old device', 1)
    `).run();
    await addSession(sqlite, "session.old", "account.one", "session-token.old");
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "recovery-test-key");
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    const recovery = await services.createAdminPasskeyRecovery({ playerAccountId: "account.one", identityVerified: true }, maintainer, "recovery.one");
    const first = await services.createPasskeyRecoveryOptions({ token: recovery.token, rpId: "owbastion.com" });
    const second = await services.createPasskeyRecoveryOptions({ token: recovery.token, rpId: "owbastion.com" });

    let verifiedCount = 0;
    let releaseVerification: () => void = () => undefined;
    const bothVerified = new Promise<void>((resolve) => { releaseVerification = resolve; });
    verifyRegistration.mockImplementation(async () => {
      const current = ++verifiedCount;
      if (current === 2) releaseVerification();
      await bothVerified;
      return { credentialId: `credential.recovery.${current}`, publicKey: "cHVi", counter: 0, transports: [] };
    });
    const complete = (challengeId: string, credentialId: string) => services.completePasskeyRecoveryRegistration({
      contractVersion: "1", token: recovery.token, challengeId, credential: { id: credentialId }, name: credentialId,
      origin: "https://owbastion.com", rpId: "owbastion.com",
    });

    const results = await Promise.allSettled([complete(first.challengeId, "credential.first"), complete(second.challengeId, "credential.second")]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM passkey_credentials WHERE player_account_id = 'account.one'").get()).toEqual({ count: 1 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_sessions WHERE player_account_id = 'account.one'").get()).toEqual({ count: 1 });
    expect(await resolvePortalSession(database, "session-token.old")).toBeNull();
    const issued = results.find((result) => result.status === "fulfilled");
    expect(issued?.status === "fulfilled" ? (await resolvePortalSession(database, issued.value.sessionToken))?.player.id : null).toBe("account.one");
  });

  it("keeps existing credentials and sessions until a recovery registration completes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00.000Z"));
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    addAccount(sqlite, "account.one", "1001");
    sqlite.prepare(`
      INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at)
      VALUES ('credential.old', 'account.one', 'credential.old', 'cHVi', 0, '[]', 'old device', 1)
    `).run();
    await addSession(sqlite, "session.old", "account.one", "session-token.old");
    const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, undefined, "recovery-test-key");
    const maintainer = { actorType: "user" as const, subject: "admin", roles: ["maintainer"], provider: "portal-session" };
    await services.createAdminPasskeyRecovery({ playerAccountId: "account.one", identityVerified: true }, maintainer, "recovery.unused");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM passkey_credentials WHERE player_account_id = 'account.one'").get()).toEqual({ count: 1 });
    expect((await resolvePortalSession(database, "session-token.old"))?.player.id).toBe("account.one");
  });

  it("issues a direct Player Account session for a verified QQ login attempt and only once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00.000Z"));
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    sqlite.exec(`
      CREATE TABLE qq_login_attempts (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, code_hash TEXT NOT NULL, status TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'login',
        player_account_id TEXT, target_group_open_id TEXT, group_open_id TEXT, member_open_id TEXT, environment TEXT, message_id TEXT,
        session_token_hash TEXT, session_issued_at INTEGER, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, verified_at INTEGER
      );
    `);
    addAccount(sqlite, "account.one", "1001");
    sqlite.prepare("INSERT INTO bindings (id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.one', 'account.one', 'qq', 'group-1', 'member-1', 'active', 1)").run();
    const services = createPlatformServices(database);
    const attempt = await services.createQqLoginAttempt({ contractVersion: "1", provider: "qq" });
    expect(await services.getQqLoginStatus({ attemptId: attempt.attemptId, attemptToken: attempt.attemptToken })).toEqual({ contractVersion: "1", status: "pending" });
    sqlite.prepare("UPDATE qq_login_attempts SET status = 'verified', group_open_id = 'group-1', member_open_id = 'member-1', environment = 'production' WHERE id = ?").run(attempt.attemptId);

    const first = await services.getQqLoginStatus({ attemptId: attempt.attemptId, attemptToken: attempt.attemptToken });
    expect(first.sessionToken).toBeDefined();
    expect((await resolvePortalSession(database, first.sessionToken!))?.player.id).toBe("account.one");
    const second = await services.getQqLoginStatus({ attemptId: attempt.attemptId, attemptToken: attempt.attemptToken });
    expect(second.sessionToken).toBeUndefined();
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_sessions").get()).toEqual({ count: 1 });
  });

  it("lets a player remove the last Passkey only while an active QQ binding remains as a login fallback", async () => {
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    for (const [id, playerId] of [["account.one", "1001"], ["account.two", "1002"]]) {
      addAccount(sqlite, id, playerId);
      sqlite.prepare("INSERT INTO passkey_credentials (id, player_account_id, credential_id, public_key, counter, transports_json, name, created_at) VALUES (?, ?, ?, 'cHVi', 0, '[]', 'device', 1)").run(`credential.${id}`, id, `credential-id.${id}`);
      await addSession(sqlite, `session.${id}`, id, `token.${id}`);
    }
    sqlite.prepare("INSERT INTO bindings (id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.one', 'account.one', 'qq', 'group-1', 'member-1', 'active', 1)").run();
    const services = createPlatformServices(database);

    expect((await services.listCurrentPlayerPasskeys({ sessionToken: "token.account.one" }))?.qqBound).toBe(true);
    expect((await services.listCurrentPlayerPasskeys({ sessionToken: "token.account.two" }))?.qqBound).toBe(false);
    await expect(services.removeCurrentPlayerPasskey({ sessionToken: "token.account.two", passkeyId: "credential.account.two" })).rejects.toThrow("PASSKEY_LAST_CREDENTIAL");
    await services.removeCurrentPlayerPasskey({ sessionToken: "token.account.one", passkeyId: "credential.account.one" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM passkey_credentials WHERE player_account_id = 'account.one'").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM passkey_credentials WHERE player_account_id = 'account.two'").get()).toEqual({ count: 1 });
  });

  it("prunes expired challenges and sessions while retaining challenges referenced by live sessions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T10:00:00.000Z"));
    const { database, sqlite } = createD1();
    installSchema(sqlite);
    addAccount(sqlite, "account.one", "1001");
    const timestamp = Date.now();
    const insertChallenge = (id: string, expiresAt: number, usedAt: number | null = null) => sqlite.prepare(`
      INSERT INTO passkey_challenges (id, purpose, challenge, expires_at, used_at, created_at)
      VALUES (?, 'login', ?, ?, ?, ?)
    `).run(id, id, expiresAt, usedAt, timestamp - 60_000);
    insertChallenge("challenge.expired", timestamp - 1);
    insertChallenge("challenge.live-session", timestamp - 1, timestamp - 2);
    insertChallenge("challenge.expired-session", timestamp - 1);
    insertChallenge("challenge.unexpired", timestamp + 60_000);
    sqlite.prepare(`
      INSERT INTO portal_sessions (id, player_account_id, token_hash, passkey_challenge_id, expires_at, created_at)
      VALUES ('session.live', 'account.one', 'token.live', 'challenge.live-session', ?, ?),
             ('session.expired', 'account.one', 'token.expired', 'challenge.expired-session', ?, ?)
    `).run(timestamp + 60_000, timestamp - 30_000, timestamp, timestamp - 30_000);
    const services = createPlatformServices(database);

    const issued = await services.createPasskeyLoginOptions({ rpId: "owbastion.com" });

    expect(issued.options.challenge).toMatch(/^login-challenge-\d+$/u);
    const remainingChallengeIds = sqlite.prepare("SELECT id FROM passkey_challenges").all() as Array<{ id: string }>;
    expect(remainingChallengeIds.map(({ id }) => id).sort()).toEqual(["challenge.live-session", "challenge.unexpired", issued.challengeId].sort());
    expect(sqlite.prepare("SELECT id FROM portal_sessions").all()).toEqual([{ id: "session.live" }]);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
});
