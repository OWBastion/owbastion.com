import { authenticatePlatformActor } from "@owbastion/auth";
import { createPlatformServices } from "@owbastion/database";
import { createApp, type RuntimeEnv } from "./app";

type OcrQueueMessage = { version: number; submissionId: string; objectKey: string };
type QqPolicyQueueMessage = { version: 1; eventId: string };

const app = createApp({
  authenticate: authenticatePlatformActor,
  services: (env) => createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCRKIT_API_TOKEN, env.OCR_QUEUE, env.OCRKIT_EVIDENCE_BUCKET, env.CACHE, env.QQ_POLICY_QUEUE, env.BINDING_INVITE_CODE_ENCRYPTION_KEY),
});

const policySignature = async (secret: string, timestamp: string, body: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const isQqPolicyMessage = (body: OcrQueueMessage | QqPolicyQueueMessage): body is QqPolicyQueueMessage => "eventId" in body;

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<OcrQueueMessage | QqPolicyQueueMessage>, env: RuntimeEnv) {
    const platform = createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCRKIT_API_TOKEN, env.OCR_QUEUE, env.OCRKIT_EVIDENCE_BUCKET, env.CACHE, env.QQ_POLICY_QUEUE, env.BINDING_INVITE_CODE_ENCRYPTION_KEY);
    for (const message of batch.messages) {
      if (isQqPolicyMessage(message.body)) {
        try {
          if (!env.QQBOT_POLICY_WEBHOOK_URL || !env.QQBOT_POLICY_WEBHOOK_SECRET) throw new Error("QQBOT_POLICY_WEBHOOK_NOT_CONFIGURED");
          const body = JSON.stringify(message.body);
          const timestamp = String(Math.floor(Date.now() / 1000));
          const response = await fetch(env.QQBOT_POLICY_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "x-owb-timestamp": timestamp, "x-owb-signature": await policySignature(env.QQBOT_POLICY_WEBHOOK_SECRET, timestamp, body) }, body });
          if (!response.ok) throw new Error(`QQBOT_POLICY_WEBHOOK_FAILED_${response.status}`);
          await platform.markQqGroupPolicyEventDelivered({ eventId: message.body.eventId });
          message.ack();
        } catch {
          message.retry({ delaySeconds: Math.min(60, 5 * Math.max(1, message.attempts)) });
        }
        continue;
      }
      try { await platform.processOcrJob({ ...message.body, attempt: message.attempts }); message.ack(); }
      catch (error) {
        if (message.attempts < 3) { message.retry({ delaySeconds: Math.min(60, 5 * message.attempts) }); continue; }
        const errorCode = error instanceof Error && error.message.startsWith("OCR_") ? error.message : "OCR_PROCESS_FAILED";
        try { await platform.markOcrJobFailed({ submissionId: message.body.submissionId, attempt: message.attempts, errorCode }); message.ack(); }
        catch { message.retry({ delaySeconds: 60 }); }
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: RuntimeEnv) {
    await createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCRKIT_API_TOKEN, env.OCR_QUEUE, env.OCRKIT_EVIDENCE_BUCKET, env.CACHE, env.QQ_POLICY_QUEUE, env.BINDING_INVITE_CODE_ENCRYPTION_KEY).dispatchPendingQqGroupPolicyEvents();
  },
};
