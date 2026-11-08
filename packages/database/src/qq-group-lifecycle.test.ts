import { describe, expect, it } from "vitest";
import type { AuthContext } from "@owbastion/domain";
import { createTestD1 } from "../test/d1";
import { auditEventsRequiredIdSchema, idempotencyKeysRequiredIdSchema, qqGroupAccessSchema } from "../test/schema";
import { createPlatformServices } from "./index";

const auth: AuthContext = { actorType: "service", subject: "qqbot", roles: ["channel:write"], provider: "test" };

describe("QQ group lifecycle reports", () => {
  it("keeps the newest lifecycle report and notifies once when an older report is processed concurrently", async () => {
    const { database, sqlite } = createTestD1({ foreignKeys: true, batchMode: "transactional", reportWriteChangesInAll: true });
    sqlite.exec([qqGroupAccessSchema, auditEventsRequiredIdSchema, idempotencyKeysRequiredIdSchema, "CREATE TABLE qq_group_policy_outbox (id TEXT PRIMARY KEY NOT NULL, request_id TEXT, created_at INTEGER NOT NULL, enqueued_at INTEGER, delivered_at INTEGER)"].join(";\n"));
    sqlite.prepare("INSERT INTO qq_group_access (group_open_id, display_name, environment, status, bind_enabled, verify_enabled, lifecycle_occurred_at, created_at, updated_at) VALUES ('group.main', '主群', 'production', 'active', 1, 1, 50, 1, 1)").run();
    const services = createPlatformServices(database);
    const report = (occurredAt: number) => ({ contractVersion: "1" as const, groupOpenId: "group.main", status: "disconnected" as const, occurredAt });

    await Promise.all([
      services.registerQqGroup(report(200), auth, "report-newer"),
      services.registerQqGroup(report(100), auth, "report-older"),
    ]);

    expect(sqlite.prepare("SELECT status, lifecycle_occurred_at FROM qq_group_access WHERE group_open_id = 'group.main'").get()).toEqual({ status: "disconnected", lifecycle_occurred_at: 200 });
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM qq_group_policy_outbox").get()).toEqual({ count: 1 });
  });
});
