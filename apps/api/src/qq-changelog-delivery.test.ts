import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "./app";
import { deliverQqChangelogPush, type QqChangelogQueueMessage } from "./qq-changelog-delivery";

const env = { QQBOT_CHANGELOG_WEBHOOK_URL: "https://qqbot.test/changelog", QQBOT_POLICY_WEBHOOK_SECRET: "secret" } as RuntimeEnv;
const message: QqChangelogQueueMessage = { version: 1, changelogPush: { version: "26.1115.3", groupOpenId: "group.a", idempotencyKey: "changelog:26.1115.3:group.a:1" } };
const request = { contractVersion: "1" as const, ...message.changelogPush, markdown: "# 日志" };

const platform = (loaded: typeof request | null = request) => {
  const recorded: unknown[] = [];
  return { recorded, services: { loadQqChangelogPushForDelivery: async () => loaded, recordQqChangelogPushResult: async (input: unknown) => { recorded.push(input); } } };
};
const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("QQ changelog delivery", () => {
  it("signs the request and records a sent result", async () => {
    respond(200, { contractVersion: "1", status: "sent" });
    const { services, recorded } = platform();
    expect(await deliverQqChangelogPush(services, env, message)).toEqual({ done: true });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(init.headers["x-owb-signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toEqual(request);
    expect(recorded).toEqual([{ ...message.changelogPush, result: { contractVersion: "1", status: "sent" } }]);
  });

  it("records a non-retryable failure and stops", async () => {
    respond(200, { contractVersion: "1", status: "failed", retryable: false, errorCode: "40034105" });
    const { services, recorded } = platform();
    expect(await deliverQqChangelogPush(services, env, message)).toEqual({ done: true });
    expect(recorded).toHaveLength(1);
  });

  it.each([
    ["a retryable failure from qqbot", () => respond(200, { contractVersion: "1", status: "failed", retryable: true, errorCode: "40034100" }), "40034100"],
    ["an HTTP error", () => respond(500, {}), "QQBOT_CHANGELOG_WEBHOOK_FAILED_500"],
    ["an invalid response", () => respond(200, { nope: true }), "QQBOT_CHANGELOG_RESPONSE_INVALID"],
  ])("asks for a retry on %s without recording", async (_name, stub, errorCode) => {
    stub();
    const { services, recorded } = platform();
    expect(await deliverQqChangelogPush(services, env, message)).toEqual({ done: false, errorCode });
    expect(recorded).toEqual([]);
  });

  it("records a permanent failure when qqbot rejects the request with a client error", async () => {
    respond(401, {});
    const { services, recorded } = platform();
    expect(await deliverQqChangelogPush(services, env, message)).toEqual({ done: true });
    expect(recorded).toEqual([{ ...message.changelogPush, result: { status: "failed", retryable: false, errorCode: "QQBOT_CHANGELOG_WEBHOOK_FAILED_401" } }]);
  });

  it("skips a stale message without calling qqbot", async () => {
    respond(200, {});
    expect(await deliverQqChangelogPush(platform(null).services, env, message)).toEqual({ done: true });
    expect(fetch).not.toHaveBeenCalled();
  });
});
