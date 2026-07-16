import { authenticatePlatformActor } from "@owbastion/auth";
import { createPlatformServices } from "@owbastion/database";
import { createApp, type RuntimeEnv } from "./app";

const app = createApp({
  authenticate: authenticatePlatformActor,
  services: (env) => createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCR_QUEUE, env.OCRKIT_EVIDENCE_BUCKET),
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<{ version: number; submissionId: string; objectKey: string }>, env: RuntimeEnv) {
    const platform = createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCR_QUEUE, env.OCRKIT_EVIDENCE_BUCKET);
    for (const message of batch.messages) {
      try { await platform.processOcrJob({ ...message.body, attempt: message.attempts }); message.ack(); }
      catch { if (message.attempts >= 3) message.ack(); else message.retry({ delaySeconds: Math.min(60, 5 * message.attempts) }); }
    }
  },
};
