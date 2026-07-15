import { authenticatePlatformActor } from "@owbastion/auth";
import { createPlatformServices } from "@owbastion/database";
import { createApp, type RuntimeEnv } from "./app";

const app = createApp({
  authenticate: authenticatePlatformActor,
  services: (env) => createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCR_QUEUE),
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<{ version: number; submissionId: string; objectKey: string; attempt: number }>, env: RuntimeEnv) {
    const platform = createPlatformServices(env.DB, env.EVIDENCE_BUCKET, env.UPLOAD_ORIGIN, env.OCRKIT_BASE_URL, env.OCR_QUEUE);
    for (const message of batch.messages) {
      try { await platform.processOcrJob(message.body); message.ack(); }
      catch { if (message.body.attempt >= 3) message.ack(); else message.retry({ delaySeconds: Math.min(60, 5 * message.body.attempt) }); }
    }
  },
};
