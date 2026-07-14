import { authenticateQqBot } from "@owbastion/auth";
import { createPlatformServices } from "@owbastion/database";
import { createApp } from "./app";

const app = createApp({
  authenticate: authenticateQqBot,
  services: (env) => createPlatformServices(env.DB, env.EVIDENCE_BUCKET),
});

export default app;
