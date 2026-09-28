import { authenticateQqBot } from "@owbastion/auth";
import { createVerifiedRunEvidenceCompatibilityV1 } from "@owbastion/domain";
import { createPlatformServices } from "@owbastion/database";
import { createApp, type RuntimeEnv } from "./app";

type OcrQueueMessage = { version: number; submissionId: string; objectKey: string; manual?: boolean; requestId?: string };
type QqPolicyQueueMessage = { version: 1; eventId: string };
// Keep this aligned with `max_retries` for the OCR consumers in wrangler.toml and wrangler.local.toml.
export const OCR_QUEUE_MAX_RETRIES = 3;
export const OCR_QUEUE_MAX_DELIVERIES = OCR_QUEUE_MAX_RETRIES + 1;
const OCR_DEAD_LETTER_QUEUES = new Set(["owbastion-ocr-dlq", "owbastion-ocr-local-dlq"]);
const ocrThreshold = (env: RuntimeEnv) => { const parsed = Number(env.OCR_MANUAL_REVIEW_THRESHOLD); return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1; };
const ocrSampleRate = (env: RuntimeEnv) => { const parsed = Number(env.OCR_AUTO_REVIEW_SAMPLE_RATE); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0; };
const ocrFeedbackCalibrationRate = (env: RuntimeEnv) => { const parsed = Number(env.OCR_FEEDBACK_CALIBRATION_RATE); return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.02; };
const masteryCompatibility = (env: RuntimeEnv) => createVerifiedRunEvidenceCompatibilityV1({
  minimumGameVersion: env.MASTERY_MIN_GAME_VERSION,
  supportedOcrLayoutVersions: env.MASTERY_SUPPORTED_OCR_LAYOUT_VERSIONS?.split(","),
});

const app = createApp({
  authenticate: authenticateQqBot,
  services: (env) => createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCRKIT_API_TOKEN, env.OCR_QUEUE, env.QQ_POLICY_QUEUE, env.BINDING_INVITE_CODE_ENCRYPTION_KEY, ocrThreshold(env), ocrSampleRate(env), masteryCompatibility(env), ocrFeedbackCalibrationRate(env), env.EVIDENCE_PUBLIC_ORIGIN),
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
    const platform = createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCRKIT_API_TOKEN, env.OCR_QUEUE, env.QQ_POLICY_QUEUE, env.BINDING_INVITE_CODE_ENCRYPTION_KEY, ocrThreshold(env), ocrSampleRate(env), masteryCompatibility(env), ocrFeedbackCalibrationRate(env), env.EVIDENCE_PUBLIC_ORIGIN);
    if (OCR_DEAD_LETTER_QUEUES.has(batch.queue)) {
      for (const message of batch.messages) {
        const body = message.body as OcrQueueMessage;
        const requestId = body.requestId ?? crypto.randomUUID();
        try {
          await platform.markOcrJobFailed({ submissionId: body.submissionId, attempt: OCR_QUEUE_MAX_DELIVERIES, errorCode: "OCR_QUEUE_EXHAUSTED", manual: body.manual, requestId });
          console.error(JSON.stringify({ layer: "ocr", event: "dead_letter_recovered", submissionId: body.submissionId, attempt: OCR_QUEUE_MAX_DELIVERIES, requestId }));
          message.ack();
        } catch (error) {
          console.error(JSON.stringify({ layer: "ocr", event: "dead_letter_recovery_failed", submissionId: body.submissionId, attempt: OCR_QUEUE_MAX_DELIVERIES, requestId, errorName: error instanceof Error ? error.name : "UnknownError", errorMessage: error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256) }));
          message.retry({ delaySeconds: 60 });
        }
      }
      return;
    }
    for (const message of batch.messages) {
      if (isQqPolicyMessage(message.body)) {
        try {
          if (!env.QQBOT_POLICY_WEBHOOK_URL || !env.QQBOT_POLICY_WEBHOOK_SECRET) throw new Error("QQBOT_POLICY_WEBHOOK_NOT_CONFIGURED");
          const body = JSON.stringify(message.body);
          const timestamp = String(Math.floor(Date.now() / 1000));
          const response = await fetch(env.QQBOT_POLICY_WEBHOOK_URL, { method: "POST", headers: { "content-type": "application/json", "user-agent": "OWBastion-PlatformAPI/1.0", "x-owb-timestamp": timestamp, "x-owb-signature": await policySignature(env.QQBOT_POLICY_WEBHOOK_SECRET, timestamp, body) }, body });
          if (!response.ok) throw new Error(`QQBOT_POLICY_WEBHOOK_FAILED_${response.status}`);
          await platform.markQqGroupPolicyEventDelivered({ eventId: message.body.eventId });
          message.ack();
        } catch {
          message.retry({ delaySeconds: Math.min(60, 5 * Math.max(1, message.attempts)) });
        }
        continue;
      }
      const requestId = message.body.requestId ?? crypto.randomUUID();
      const submissionId = message.body.submissionId;
      try { await platform.processOcrJob({ ...message.body, attempt: message.attempts, requestId }); message.ack(); }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message.slice(0, 256) : String(error).slice(0, 256);
        console.error(JSON.stringify({ layer: "ocr", event: "queue_job_failed", submissionId, attempt: message.attempts, manual: Boolean(message.body.manual), requestId, errorName: error instanceof Error ? error.name : "UnknownError", errorMessage }));
        if (message.attempts < OCR_QUEUE_MAX_DELIVERIES) { console.warn(JSON.stringify({ layer: "ocr", event: "queue_job_retry", submissionId, attempt: message.attempts, manual: Boolean(message.body.manual), requestId, delaySeconds: Math.min(60, 5 * message.attempts), errorMessage })); message.retry({ delaySeconds: Math.min(60, 5 * message.attempts) }); continue; }
        const errorCode = error instanceof Error && error.message.startsWith("OCR_") ? error.message : "OCR_PROCESS_FAILED";
        try { await platform.markOcrJobFailed({ submissionId, attempt: message.attempts, errorCode, manual: message.body.manual, requestId }); message.ack(); }
        catch (markError) { console.error(JSON.stringify({ layer: "ocr", event: "queue_failure_record_failed", submissionId, attempt: message.attempts, manual: Boolean(message.body.manual), requestId, errorName: markError instanceof Error ? markError.name : "UnknownError", errorMessage: markError instanceof Error ? markError.message.slice(0, 256) : String(markError).slice(0, 256) })); message.retry({ delaySeconds: 60 }); }
      }
    }
  },
  async scheduled(_controller: ScheduledController, env: RuntimeEnv) {
    await createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCRKIT_API_TOKEN, env.OCR_QUEUE, env.QQ_POLICY_QUEUE, env.BINDING_INVITE_CODE_ENCRYPTION_KEY, ocrThreshold(env), ocrSampleRate(env), masteryCompatibility(env), ocrFeedbackCalibrationRate(env), env.EVIDENCE_PUBLIC_ORIGIN).dispatchPendingQqGroupPolicyEvents();
  },
};
