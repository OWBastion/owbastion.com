import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AuthContext } from "@owbastion/domain";
import { createTestD1 } from "../test/d1";
import { auditEventsRequiredIdSchema, qqGroupAccessSchema } from "../test/schema";
import { createPlatformServices } from "./index";

const auth: AuthContext = { actorType: "user", subject: "admin", roles: ["maintainer"], provider: "test" };
const pushesMigration = readFileSync(new URL("../../../migrations/0117_qq_changelog_pushes.sql", import.meta.url), "utf8");
const VERSION = "26.1115.3";
const keyFor = (group: string, generation: number) => `changelog:${VERSION}:${group}:${generation}`;

const setup = () => {
  const { database, sqlite } = createTestD1({ foreignKeys: true, batchMode: "transactional" });
  sqlite.exec([qqGroupAccessSchema, auditEventsRequiredIdSchema, pushesMigration].join(";\n"));
  const insertGroup = sqlite.prepare("INSERT INTO qq_group_access (group_open_id, display_name, environment, status, created_at, updated_at) VALUES (?, ?, 'production', ?, 1, 1)");
  insertGroup.run("group.a", "A", "active");
  insertGroup.run("group.b", "B", "pending");
  insertGroup.run("group.gone", "C", "disconnected");
  const sent: unknown[] = [];
  const queue = { send: async (message: unknown) => { sent.push(message); } } as unknown as Queue;
  const services = createPlatformServices(database, undefined, undefined, undefined, undefined, undefined, queue);
  const record = (group: string, generation: number, result: Parameters<typeof services.recordQqChangelogPushResult>[0]["result"]) =>
    services.recordQqChangelogPushResult({ version: VERSION, groupOpenId: group, idempotencyKey: keyFor(group, generation), result });
  return { services, sqlite, sent, record };
};
const request = (groupOpenIds: string[], confirmResend = false) => ({ contractVersion: "1" as const, version: VERSION, markdown: "# 日志", groupOpenIds, confirmResend });
const queued = (group: string, generation: number) => ({ version: 1, changelogPush: { version: VERSION, groupOpenId: group, idempotencyKey: keyFor(group, generation) } });

describe("QQ changelog pushes", () => {
  it("queues one push per group with a stable idempotency key", async () => {
    const { services, sent } = setup();
    const items = await services.requestQqChangelogPush(request(["group.a", "group.b"]), auth);
    expect(items.map((item) => [item.groupOpenId, item.status])).toEqual([["group.a", "pending"], ["group.b", "pending"]]);
    expect(sent).toEqual([queued("group.a", 1), queued("group.b", 1)]);
  });

  it("rejects disconnected and unknown groups without writing", async () => {
    const { services, sqlite, sent } = setup();
    await expect(services.requestQqChangelogPush(request(["group.a", "group.gone"]), auth)).rejects.toThrow("QQ_CHANGELOG_GROUP_NOT_PUSHABLE");
    await expect(services.requestQqChangelogPush(request(["nope"]), auth)).rejects.toThrow("QQ_CHANGELOG_GROUP_NOT_PUSHABLE");
    expect(sqlite.prepare("SELECT COUNT(*) AS count FROM qq_changelog_pushes").get()).toEqual({ count: 0 });
    expect(sent).toEqual([]);
  });

  it("rejects a resend without confirmation, then advances the key with it", async () => {
    const { services, sent, record } = setup();
    await services.requestQqChangelogPush(request(["group.a"]), auth);
    await record("group.a", 1, { contractVersion: "1", status: "sent" });
    await expect(services.requestQqChangelogPush(request(["group.a", "group.b"]), auth)).rejects.toThrow("QQ_CHANGELOG_ALREADY_SENT");
    expect(sent).toHaveLength(1);
    await services.requestQqChangelogPush(request(["group.a"], true), auth);
    expect(sent[1]).toEqual(queued("group.a", 2));
    // A late result for the first generation must not overwrite the resend.
    await record("group.a", 1, { contractVersion: "1", status: "sent" });
    expect((await services.listQqChangelogPushes({ version: VERSION }, auth))[0]!.status).toBe("pending");
  });

  it("keeps the key when a failed push is retried and reports retryability", async () => {
    const { services, sent, record } = setup();
    await services.requestQqChangelogPush(request(["group.a"]), auth);
    await record("group.a", 1, { contractVersion: "1", status: "failed", retryable: false, errorCode: "40034105" });
    expect(await services.listQqChangelogPushes({ version: VERSION }, auth)).toEqual([expect.objectContaining({ status: "failed", retryable: false, errorCode: "40034105" })]);
    await services.requestQqChangelogPush(request(["group.a"]), auth);
    expect(sent[1]).toEqual(queued("group.a", 1));
  });

  it("delivers the stored markdown only while the push is pending", async () => {
    const { services, record } = setup();
    await services.requestQqChangelogPush(request(["group.b"]), auth);
    const input = { version: VERSION, groupOpenId: "group.b", idempotencyKey: keyFor("group.b", 1) };
    expect(await services.loadQqChangelogPushForDelivery(input)).toEqual({ contractVersion: "1", ...input, markdown: "# 日志" });
    await record("group.b", 1, { contractVersion: "1", status: "sent" });
    expect(await services.loadQqChangelogPushForDelivery(input)).toBeNull();
  });
});
