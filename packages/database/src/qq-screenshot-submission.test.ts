import { afterEach, describe, expect, it, vi } from "vitest";
import type { QqScreenshotSubmissionRequest } from "@owbastion/contracts";
import type { AuthContext } from "@owbastion/domain";
import { createPlatformServices } from "./index";
import { createD1, installSchema } from "./ocr-test-harness";

const auth: AuthContext = { actorType: "service", subject: "qqbot", roles: ["channel:write"], provider: "test" };
const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sourceUrl = "https://multimedia.nt.qq.com.cn/download?fileid=secret-token";
const request = (overrides: Partial<QqScreenshotSubmissionRequest> = {}): QqScreenshotSubmissionRequest => ({
  contractVersion: "1", commandMessageId: "message-1", groupOpenId: "group-1", memberOpenId: "member-1",
  attachment: { url: sourceUrl, filename: "a.png", contentType: "image/png" }, ...overrides,
});

const setup = (options: { queueFails?: () => boolean } = {}) => {
  const { database, sqlite } = createD1();
  installSchema(sqlite);
  const now = Date.now();
  sqlite.prepare("INSERT INTO qq_group_access (group_open_id, environment, status, created_at, updated_at) VALUES ('group-1', 'production', 'active', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES ('player-1', 'p1', 'Tester', 'tester', 0, 'active', ?, ?)").run(now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES ('binding-1', 'identity-1', 'player-1', 'qq', 'group-1', 'member-1', 'active', ?)").run(now);
  const stored = new Map<string, ArrayBuffer>();
  const queued: Array<Record<string, unknown>> = [];
  const bucket = { put: vi.fn(async (key: string, body: ArrayBuffer) => { stored.set(key, body); }) } as unknown as R2Bucket;
  const queue = { send: vi.fn(async (message: Record<string, unknown>) => { if (options.queueFails?.()) throw new Error("queue down"); queued.push(message); }) } as unknown as Queue;
  const services = createPlatformServices(database, bucket, "https://api.example.com", undefined, undefined, queue);
  return { services, sqlite, stored, queued, bucket, queue };
};

const stubFetch = (handler: (url: string) => Response | Promise<Response>) => {
  const fetchMock = vi.fn(async (input: URL | string) => handler(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const count = (sqlite: ReturnType<typeof setup>["sqlite"], table: string) => Number((sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);

afterEach(() => vi.unstubAllGlobals());

describe("QQ screenshot submission", () => {
  it("stores the image privately and enters the normal OCR path without retaining the QQ URL", async () => {
    const { services, sqlite, stored, queued } = setup();
    stubFetch(() => new Response(png(), { headers: { "content-type": "text/plain" } }));

    const response = await services.submitQqScreenshot(request(), auth, "key-1", "request-1");

    expect(response).toMatchObject({ contractVersion: "1", status: "processing" });
    const submission = sqlite.prepare("SELECT * FROM submissions").get() as Record<string, unknown>;
    expect(submission).toMatchObject({ id: response.submissionId, player_account_id: "player-1", binding_id: "binding-1", status: "ocr_pending", source_provider: "qq", source_message_id: "message-1" });
    const attachment = sqlite.prepare("SELECT * FROM attachments").get() as Record<string, unknown>;
    expect(attachment).toMatchObject({ content_type: "image/png", byte_size: 12, upload_status: "stored" });
    expect([...stored.keys()]).toEqual([attachment.object_key]);
    expect(queued).toEqual([{ version: 2, jobId: expect.any(String), submissionId: response.submissionId, objectKey: attachment.object_key, requestId: "request-1" }]);
    expect(sqlite.prepare("SELECT status FROM ocr_results").get()).toEqual({ status: "pending" });
    for (const table of ["submissions", "attachments", "ocr_results", "idempotency_keys", "audit_events"]) {
      expect(JSON.stringify(sqlite.prepare(`SELECT * FROM ${table}`).all())).not.toMatch(/multimedia|secret-token/);
    }
  });

  it("replays one logical Submission for a duplicate delivery", async () => {
    const { services, sqlite, queued } = setup();
    const fetchMock = stubFetch(() => new Response(png()));

    const first = await services.submitQqScreenshot(request(), auth, "key-1");
    const second = await services.submitQqScreenshot(request(), auth, "key-1");

    expect(second).toEqual(first);
    expect(count(sqlite, "submissions")).toBe(1);
    expect(queued).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("creates one Submission when the same command is delivered concurrently", async () => {
    const { services, sqlite, queued } = setup();
    stubFetch(() => new Response(png()));

    const outcomes = await Promise.allSettled([services.submitQqScreenshot(request(), auth, "key-1"), services.submitQqScreenshot(request(), auth, "key-1")]);

    const accepted = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value.submissionId] : []);
    expect(accepted.length).toBeGreaterThan(0);
    expect(new Set(accepted).size).toBe(1);
    expect(count(sqlite, "submissions")).toBe(1);
    expect(queued).toHaveLength(1);
  });

  it("fails closed when an idempotency identity is reused with a different payload", async () => {
    const { services, sqlite } = setup();
    stubFetch(() => new Response(png()));
    await services.submitQqScreenshot(request(), auth, "key-1");

    await expect(services.submitQqScreenshot(request({ commandMessageId: "message-2" }), auth, "key-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(services.submitQqScreenshot(request({ attachment: { url: `${sourceUrl}2`, filename: "a.png", contentType: "image/png" } }), auth, "key-1")).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(count(sqlite, "submissions")).toBe(1);
  });

  it.each([
    ["unbound member", request({ memberOpenId: "stranger" }), "BINDING_NOT_FOUND"],
    ["inactive group", request({ groupOpenId: "group-2" }), "LOGIN_GROUP_NOT_ALLOWED"],
  ])("writes nothing for %s", async (_name, input, code) => {
    const { services, sqlite, bucket, queue } = setup();
    const fetchMock = stubFetch(() => new Response(png()));

    await expect(services.submitQqScreenshot(input, auth, "key-1")).rejects.toThrow(code);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(queue.send).not.toHaveBeenCalled();
    expect(count(sqlite, "submissions") + count(sqlite, "idempotency_keys")).toBe(0);
  });

  it("rejects a banned Player without fetching or storing evidence", async () => {
    const { services, sqlite, bucket } = setup();
    sqlite.prepare("UPDATE player_accounts SET status = 'banned'").run();
    const fetchMock = stubFetch(() => new Response(png()));

    await expect(services.submitQqScreenshot(request(), auth, "key-1")).rejects.toThrow("PLAYER_BANNED");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(count(sqlite, "submissions")).toBe(0);
  });

  it("does not create a Submission when the QQ URL is expired, and a later retry can succeed", async () => {
    const { services, sqlite, bucket } = setup();
    let available = false;
    stubFetch(() => available ? new Response(png()) : new Response("gone", { status: 404 }));

    await expect(services.submitQqScreenshot(request(), auth, "key-1")).rejects.toThrow("SOURCE_ATTACHMENT_UNAVAILABLE");
    expect(bucket.put).not.toHaveBeenCalled();
    expect(count(sqlite, "submissions") + count(sqlite, "idempotency_keys")).toBe(0);

    available = true;
    await expect(services.submitQqScreenshot(request(), auth, "key-1")).resolves.toMatchObject({ status: "processing" });
    expect(count(sqlite, "submissions")).toBe(1);
  });

  it.each([
    ["plain HTTP", "http://multimedia.nt.qq.com.cn/a.png"],
    ["an untrusted host", "https://evil.example.com/a.png"],
    ["a lookalike host", "https://notqq.com/a.png"],
    ["an IP literal", "https://127.0.0.1/a.png"],
    ["an explicit port", "https://gchat.qpic.cn:8443/a.png"],
    ["embedded credentials", "https://user:pass@gchat.qpic.cn/a.png"],
  ])("refuses to fetch %s", async (_name, url) => {
    const { services, sqlite } = setup();
    const fetchMock = stubFetch(() => new Response(png()));

    await expect(services.submitQqScreenshot(request({ attachment: { url, filename: "a.png", contentType: "image/png" } }), auth, "key-1")).rejects.toThrow("SOURCE_ATTACHMENT_UNAVAILABLE");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(count(sqlite, "submissions")).toBe(0);
  });

  it("revalidates redirects and refuses a redirect to a private target", async () => {
    const { services, sqlite } = setup();
    const fetchMock = stubFetch((url) => url.startsWith("https://gchat.qpic.cn") ? new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } }) : new Response(png()));

    await expect(services.submitQqScreenshot(request({ attachment: { url: "https://gchat.qpic.cn/a.png", filename: "a.png", contentType: "image/png" } }), auth, "key-1")).rejects.toThrow("SOURCE_ATTACHMENT_UNAVAILABLE");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(count(sqlite, "submissions")).toBe(0);
  });

  it("follows a bounded redirect between trusted hosts", async () => {
    const { services } = setup();
    stubFetch((url) => url.startsWith("https://gchat.qpic.cn") ? new Response(null, { status: 302, headers: { location: "https://multimedia.nt.qq.com.cn/b.png" } }) : new Response(png()));

    await expect(services.submitQqScreenshot(request({ attachment: { url: "https://gchat.qpic.cn/a.png", filename: "a.png", contentType: "image/png" } }), auth, "key-1")).resolves.toMatchObject({ status: "processing" });
  });

  it("validates actual content instead of trusting the declared type or size", async () => {
    const { services, sqlite } = setup();
    stubFetch(() => new Response("<html></html>", { headers: { "content-type": "image/png" } }));
    await expect(services.submitQqScreenshot(request(), auth, "key-1")).rejects.toThrow("UNSUPPORTED_ATTACHMENT_TYPE");

    stubFetch(() => new Response(new Uint8Array(10 * 1024 * 1024 + 1).fill(1)));
    await expect(services.submitQqScreenshot(request(), auth, "key-2")).rejects.toThrow("ATTACHMENT_SIZE_INVALID");
    expect(count(sqlite, "submissions")).toBe(0);
  });

  it("keeps evidence and claim on queue failure so the next retry resumes the same Submission", async () => {
    let failing = true;
    const { services, sqlite, stored, queued } = setup({ queueFails: () => failing });
    const fetchMock = stubFetch(() => new Response(png()));

    await expect(services.submitQqScreenshot(request(), auth, "key-1")).rejects.toThrow("queue down");
    expect(count(sqlite, "submissions")).toBe(1);
    expect(sqlite.prepare("SELECT status, error_code FROM ocr_results").get()).toEqual({ status: "error", error_code: "OCR_QUEUE_SEND_FAILED" });
    expect(stored.size).toBe(1);

    failing = false;
    const retried = await services.submitQqScreenshot(request(), auth, "key-1");
    expect(retried).toMatchObject({ status: "processing" });
    expect(count(sqlite, "submissions")).toBe(1);
    expect(count(sqlite, "attachments")).toBe(1);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ submissionId: retried.submissionId, objectKey: [...stored.keys()][0] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(stored.size).toBe(1);
  });

  it("rejects a live in-flight send marker and resumes a stale one", async () => {
    const { services, sqlite, queued } = setup();
    stubFetch(() => new Response(png()));
    const accepted = await services.submitQqScreenshot(request(), auth, "key-1");

    // Simulate a lost response: revert the finalized claim back to an enqueueing marker.
    sqlite.prepare("UPDATE idempotency_keys SET response_json = ?, created_at = ? WHERE operation = 'qq.screenshot.submit'").run("qq-screenshot-enqueueing:send:live", Date.now());
    await expect(services.submitQqScreenshot(request(), auth, "key-1")).rejects.toThrow("QQ_SUBMISSION_IN_PROGRESS");
    expect(queued).toHaveLength(1);

    // Once the marker is stale, a redelivery of the same command resumes it without
    // fetching or storing again, and resolves to the same Submission.
    sqlite.prepare("UPDATE idempotency_keys SET created_at = ? WHERE operation = 'qq.screenshot.submit'").run(Date.now() - 61_000);
    const fetchMock = stubFetch(() => new Response(png()));
    const resumed = await services.submitQqScreenshot(request(), auth, "key-1");
    expect(resumed).toEqual(accepted);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(count(sqlite, "submissions")).toBe(1);
    expect(queued).toHaveLength(2);
    expect(queued[1]).toMatchObject({ submissionId: accepted.submissionId, jobId: queued[0]!.jobId });
    expect(sqlite.prepare("SELECT response_json FROM idempotency_keys WHERE operation = 'qq.screenshot.submit'").get()).toEqual({ response_json: JSON.stringify(accepted) });
  });
});
