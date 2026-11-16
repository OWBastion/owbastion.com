import { qqbotChangelogSendResponseSchema, type QqbotChangelogSendResponse } from "@owbastion/contracts";
import type { PlatformServices } from "@owbastion/domain";
import type { RuntimeEnv } from "./app";
import { webhookSignature } from "./webhook-signature";

export type QqChangelogQueueMessage = { version: 1; changelogPush: { version: string; groupOpenId: string; idempotencyKey: string } };
export const isQqChangelogMessage = (body: object): body is QqChangelogQueueMessage => "changelogPush" in body;

// Three deliveries match the qq-policy queue's max_retries; the last one records the failure instead of retrying.
export const QQ_CHANGELOG_MAX_ATTEMPTS = 3;

type Delivery = Pick<PlatformServices, "loadQqChangelogPushForDelivery" | "recordQqChangelogPushResult">;
type Outcome = { done: true } | { done: false; errorCode: string };

class QqbotHttpError extends Error {
  constructor(readonly status: number) { super(`QQBOT_CHANGELOG_WEBHOOK_FAILED_${status}`); }
  // A client error other than a timeout or a rate limit will not change on retry (bad signature, wrong path).
  get permanent() { return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429; }
}

const sendToQqbot = async (env: RuntimeEnv, body: string): Promise<QqbotChangelogSendResponse> => {
  if (!env.QQBOT_CHANGELOG_WEBHOOK_URL || !env.QQBOT_POLICY_WEBHOOK_SECRET) throw new Error("QQBOT_CHANGELOG_WEBHOOK_NOT_CONFIGURED");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(env.QQBOT_CHANGELOG_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "user-agent": "OWBastion-PlatformAPI/1.0", "x-owb-timestamp": timestamp, "x-owb-signature": await webhookSignature(env.QQBOT_POLICY_WEBHOOK_SECRET, timestamp, body) }, body });
  if (!response.ok) throw new QqbotHttpError(response.status);
  const parsed = qqbotChangelogSendResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw new Error("QQBOT_CHANGELOG_RESPONSE_INVALID");
  return parsed.data;
};

/** Delivers one queued push. `done: false` asks the queue to retry; the error code is recorded once attempts run out. */
export const deliverQqChangelogPush = async (platform: Delivery, env: RuntimeEnv, message: QqChangelogQueueMessage): Promise<Outcome> => {
  const request = await platform.loadQqChangelogPushForDelivery(message.changelogPush);
  // A resent generation or an already-recorded result makes this message stale.
  if (!request) return { done: true };
  let result: QqbotChangelogSendResponse;
  try { result = await sendToQqbot(env, JSON.stringify(request)); }
  catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 64) : "QQBOT_CHANGELOG_UNREACHABLE";
    if (!(error instanceof QqbotHttpError && error.permanent)) return { done: false, errorCode };
    await platform.recordQqChangelogPushResult({ ...message.changelogPush, result: { status: "failed", retryable: false, errorCode } });
    return { done: true };
  }
  // A retryable failure reported by qqbot is retried like a transport failure.
  if (result.status === "failed" && result.retryable) return { done: false, errorCode: result.errorCode };
  await platform.recordQqChangelogPushResult({ ...message.changelogPush, result });
  return { done: true };
};
