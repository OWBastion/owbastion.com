import { Hono } from "hono";
import {
  qqBindingRequestSchema,
  submissionRequestSchema,
} from "@owbastion/contracts";
import type { Authenticator, PlatformServices } from "@owbastion/domain";

export type RuntimeEnv = {
  DB: D1Database;
  EVIDENCE_BUCKET?: R2Bucket;
  QQBOT_API_TOKEN?: string;
};

type AppDependencies = {
  authenticate: Authenticator<RuntimeEnv>;
  services: (env: RuntimeEnv) => PlatformServices;
};

const requestId = (request: Request) => request.headers.get("x-request-id") ?? crypto.randomUUID();

const errorResponse = (c: any, status: 400 | 401 | 403 | 404 | 409 | 422 | 500, code: string, message: string) =>
  c.json({ contractVersion: "1", error: { code, message, requestId: requestId(c.req.raw) } }, status);

const parseBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export const createApp = (dependencies: AppDependencies) => {
  const app = new Hono<{ Bindings: RuntimeEnv }>();

  app.get("/health", (c) =>
    c.json({
      service: "api",
      status: "ok",
    }),
  );

  app.post("/v1/qq/bindings", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = qqBindingRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");

    try {
      return c.json(await dependencies.services(c.env).createBinding(parsed.data, auth, idempotencyKey), 201);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request");
      if (error instanceof Error && error.message === "BINDING_CONFLICT") return errorResponse(c, 409, "BINDING_CONFLICT", "The QQ identity is already bound to another player");
      throw error;
    }
  });

  app.post("/v1/submissions", async (c) => {
    const auth = await dependencies.authenticate(c.req.raw, c.env);
    if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
    if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = submissionRequestSchema.safeParse(await parseBody(c.req.raw));
    if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");

    try {
      return c.json(await dependencies.services(c.env).createSubmission(parsed.data, auth, idempotencyKey), 201);
    } catch (error) {
      if (error instanceof Error && error.message === "IDEMPOTENCY_CONFLICT") return errorResponse(c, 409, "IDEMPOTENCY_CONFLICT", "The idempotency key was used with a different request");
      if (error instanceof Error && error.message === "BINDING_NOT_FOUND") return errorResponse(c, 422, "BINDING_NOT_FOUND", "The binding does not exist");
      throw error;
    }
  });

  app.get("/v1/submissions/:submissionId", async (c) => {
    c.header("Access-Control-Allow-Origin", "*");
    const submissionId = c.req.param("submissionId");
    if (!/^[0-9a-f-]{36}$/.test(submissionId)) return errorResponse(c, 422, "INVALID_SUBMISSION_ID", "The submission ID is invalid");
    try {
      return c.json(await dependencies.services(c.env).getSubmission({ submissionId }, { actorType: "user", subject: "public-status", roles: [], provider: "public" }));
    } catch (error) {
      if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return errorResponse(c, 404, "SUBMISSION_NOT_FOUND", "The submission does not exist");
      throw error;
    }
  });

  return app;
};

export type { AppDependencies };
