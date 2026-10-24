import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../test/map-title-rule-fixtures";
import { createPlatformServices } from "./index";

describe("administrator BattleTag change", () => {
  const admin = { actorType: "user" as const, subject: "admin.1", roles: ["maintainer"] as const, provider: "test" };
  const setup = () => {
    const { database, sqlite } = createTestDatabase();
    const timestamp = Date.now();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.1', '1111', 'A', 'a', ?, ?)").run(timestamp, timestamp);
    sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, created_at) VALUES ('binding.1', 'identity.1', 'player.1', 'qq', 'group.1', 'member.1', ?)").run(timestamp);
    sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at, created_at) VALUES ('session.1', 'player.1', 'hash', ?, ?)").run(timestamp + 60_000, timestamp);
    const account = () => sqlite.prepare("SELECT id, player_id, player_name, normalized_player_name FROM player_accounts WHERE id = 'player.1'").get();
    const insertInvite = (id: string, normalizedPlayerName: string, playerId: string, expiresAt = timestamp + 60_000) => sqlite.prepare("INSERT INTO binding_invites (id, code_hash, player_name, normalized_player_name, player_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)").run(id, `hash.${id}`, normalizedPlayerName, normalizedPlayerName, playerId, timestamp, expiresAt);
    return { sqlite, timestamp, services: createPlatformServices(database), account, insertInvite };
  };
  const change = (playerName: string, playerId: string) => ({ contractVersion: "1" as const, playerAccountId: "player.1", playerName, playerId });

  it("changes the full BattleTag on the same account, audits both sides, and replays idempotently", async () => {
    const { sqlite, services, account } = setup();

    await services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.1");
    await services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.1");

    expect(account()).toEqual({ id: "player.1", player_id: "2222", player_name: "B", normalized_player_name: "b" });
    expect(sqlite.prepare("SELECT player_account_id, status FROM bindings").all()).toEqual([{ player_account_id: "player.1", status: "active" }]);
    expect(sqlite.prepare("SELECT player_account_id FROM portal_sessions").all()).toEqual([{ player_account_id: "player.1" }]);
    const audits = sqlite.prepare("SELECT payload_json FROM audit_events WHERE operation = 'admin.player.identity.update'").all() as Array<{ payload_json: string }>;
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].payload_json)).toEqual({ previousPlayerName: "A", previousPlayerId: "1111", playerName: "B", playerId: "2222" });
    await expect(services.updateAdminPlayerIdentity(change("C", "3333"), admin, "identity.1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(account()).toMatchObject({ player_id: "2222", player_name: "B" });
  });

  it("changes only the number", async () => {
    const { services, account } = setup();

    await services.updateAdminPlayerIdentity(change("A", "2222"), admin, "identity.1");

    expect(account()).toEqual({ id: "player.1", player_id: "2222", player_name: "A", normalized_player_name: "a" });
  });

  it("rejects a BattleTag used by another account", async () => {
    const { sqlite, timestamp, services, account } = setup();
    sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, created_at, updated_at) VALUES ('player.2', '2222', 'B', 'b', ?, ?)").run(timestamp, timestamp);

    await expect(services.updateAdminPlayerIdentity(change("b", "2222"), admin, "identity.1")).rejects.toThrow("PLAYER_BATTLETAG_CONFLICT");

    expect(account()).toEqual({ id: "player.1", player_id: "1111", player_name: "A", normalized_player_name: "a" });
  });

  it.each([["old", "a", "1111"], ["new", "b", "2222"]])("blocks while the %s BattleTag has a usable invite and allows it after revocation or expiry", async (_side, normalizedPlayerName, playerId) => {
    const { sqlite, timestamp, services, account, insertInvite } = setup();
    insertInvite("invite.usable", normalizedPlayerName, playerId);
    insertInvite("invite.expired", normalizedPlayerName, playerId, timestamp - 1);

    await expect(services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.1")).rejects.toThrow("PLAYER_BATTLETAG_PENDING_INVITE");
    expect(account()).toMatchObject({ player_id: "1111", player_name: "A" });

    sqlite.prepare("UPDATE binding_invites SET revoked_at = ?, revoked_by = 'admin' WHERE id = 'invite.usable'").run(timestamp);
    await services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.2");
    expect(account()).toMatchObject({ player_id: "2222", player_name: "B" });
  });

  it.each([["old", "a", "1111"], ["new", "b", "2222"]])("blocks while the %s BattleTag has an undecided binding claim", async (_side, normalizedPlayerName, playerId) => {
    const { sqlite, timestamp, services, account, insertInvite } = setup();
    insertInvite("invite.1", normalizedPlayerName, playerId);
    sqlite.prepare("UPDATE binding_invites SET revoked_at = ? WHERE id = 'invite.1'").run(timestamp);
    const insertClaim = (id: string, status: string, expiresAt: number) => sqlite.prepare("INSERT INTO binding_claims (id, invite_id, token_hash, code_hash, player_name, normalized_player_name, player_id, status, expires_at, created_at) VALUES (?, 'invite.1', 'token', ?, ?, ?, ?, ?, ?, ?)").run(id, `code.${id}`, normalizedPlayerName, normalizedPlayerName, playerId, status, expiresAt, timestamp);
    insertClaim("claim.expired", "pending_confirmation", timestamp - 1);
    insertClaim("claim.rejected", "rejected", timestamp + 60_000);
    insertClaim("claim.review", "pending_review", timestamp - 1);

    await expect(services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.1")).rejects.toThrow("PLAYER_BATTLETAG_PENDING_INVITE");
    expect(account()).toMatchObject({ player_id: "1111", player_name: "A" });

    sqlite.prepare("UPDATE binding_claims SET status = 'pending_confirmation', expires_at = ? WHERE id = 'claim.review'").run(timestamp + 60_000);
    await expect(services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.2")).rejects.toThrow("PLAYER_BATTLETAG_PENDING_INVITE");

    sqlite.prepare("UPDATE binding_claims SET status = 'rejected' WHERE id = 'claim.review'").run();
    await services.updateAdminPlayerIdentity(change("B", "2222"), admin, "identity.3");
    expect(account()).toMatchObject({ player_id: "2222", player_name: "B" });
  });
});
