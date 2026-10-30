import { describe, expect, it } from "vitest";
import type { AuthContext } from "@owbastion/domain";
import { createTestD1 } from "../test/d1";
import {
  auditEventsRequiredIdSchema,
  bindingsSchema,
  idempotencyKeysRequiredIdSchema,
  playerAccountsSchema,
  portalSessionsSchema,
  qqGroupAccessSchema,
} from "../test/schema";
import { createPlatformServices } from "./index";

const auth: AuthContext = { actorType: "service", subject: "qqbot", roles: ["channel:write"], provider: "test" };
const now = Date.now();

const setup = (groupStatus: "active" | "legacy" = "active") => {
  const { database, sqlite } = createTestD1({ foreignKeys: true, batchMode: "transactional", reportWriteChangesInAll: true });
  sqlite.exec([playerAccountsSchema, bindingsSchema, portalSessionsSchema, qqGroupAccessSchema, auditEventsRequiredIdSchema, idempotencyKeysRequiredIdSchema].join(";\n"));
  sqlite.prepare("INSERT INTO qq_group_access (group_open_id, display_name, environment, status, bind_enabled, verify_enabled, lifecycle_occurred_at, created_at, updated_at) VALUES ('group.main', '主群', 'production', ?, 1, 1, 0, ?, ?)").run(groupStatus, now, now);
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player.a', '1001', 'Player A', 'player a', 0, 'active', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding.a', 'identity.a', 'player.a', 'qq', 'group.main', 'member.a', 'active', ?)").run(now);
  sqlite.prepare("INSERT INTO portal_sessions (id, player_account_id, token_hash, expires_at) VALUES ('session.a', 'player.a', 'hash', ?)").run(now + 60_000);
  return { sqlite, services: createPlatformServices(database) };
};
const left = (groupOpenId: string, memberOpenId: string) => ({ contractVersion: "1" as const, groupOpenId, memberOpenId, occurredAt: now });
const account = (sqlite: ReturnType<typeof setup>["sqlite"]) => sqlite.prepare("SELECT status, banned_by, ban_reason FROM player_accounts WHERE id = 'player.a'").get();

describe("QQ group member left", () => {
  it("bans the bound player of the active group, ends sessions, audits, and replays idempotently", async () => {
    const { sqlite, services } = setup();
    await services.reportQqGroupMemberLeft(left("group.main", "member.a"), auth, "left-1");
    expect(account(sqlite)).toEqual({ status: "banned", banned_by: "qqbot", ban_reason: "退群自动封禁" });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM portal_sessions").get()).toEqual({ count: 0 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE operation = 'admin.player.banned'").get()).toEqual({ count: 1 });
    await services.reportQqGroupMemberLeft(left("group.main", "member.a"), auth, "left-1");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual({ count: 1 });
  });

  it("ignores unbound members, groups that are not active, and players that are already banned", async () => {
    const inactive = setup("legacy");
    await inactive.services.reportQqGroupMemberLeft(left("group.main", "member.a"), auth, "left-legacy");
    expect(account(inactive.sqlite)).toMatchObject({ status: "active" });

    const active = setup();
    await active.services.reportQqGroupMemberLeft(left("group.main", "member.stranger"), auth, "left-stranger");
    await active.services.reportQqGroupMemberLeft(left("group.unknown", "member.a"), auth, "left-unknown-group");
    expect(account(active.sqlite)).toMatchObject({ status: "active" });

    active.sqlite.prepare("UPDATE player_accounts SET status = 'banned', banned_by = 'admin', ban_reason = '手动' WHERE id = 'player.a'").run();
    await active.services.reportQqGroupMemberLeft(left("group.main", "member.a"), auth, "left-again");
    expect(account(active.sqlite)).toEqual({ status: "banned", banned_by: "admin", ban_reason: "手动" });
    expect(active.sqlite.prepare("SELECT COUNT(*) AS count FROM audit_events").get()).toEqual({ count: 0 });
  });
});
