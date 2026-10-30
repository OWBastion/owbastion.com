import { qqGroupMemberLeftRequestSchema, qqGroupRegistrationRequestSchema } from "@owbastion/contracts";
import type { AuthContext } from "@owbastion/domain";
import { errorResponse, idempotencyErrors, parseBody, respondToMappedError, type ApiApp, type ServiceAccessor } from "./route-contract";

type QqGroupLifecycleDependencies = {
  services: ServiceAccessor;
  authenticate: (request: Request, env: any) => Promise<AuthContext | null>;
};

export const registerQqGroupLifecycleRoutes = (app: ApiApp, dependencies: QqGroupLifecycleDependencies) => {
  const channelWrite = (path: string, schema: typeof qqGroupRegistrationRequestSchema | typeof qqGroupMemberLeftRequestSchema, action: (c: any, input: any, auth: AuthContext, key: string) => Promise<void>) =>
    app.post(path, async (c) => {
      const auth = await dependencies.authenticate(c.req.raw, c.env);
      if (!auth) return errorResponse(c, 401, "UNAUTHENTICATED", "Authentication is required");
      if (!auth.roles.includes("channel:write")) return errorResponse(c, 403, "FORBIDDEN", "The actor cannot write channel data");
      const idempotencyKey = c.req.header("idempotency-key");
      if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
      const parsed = schema.safeParse(await parseBody(c.req.raw));
      if (!parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
      try {
        await action(c, parsed.data, auth, idempotencyKey);
        return c.body(null, 204);
      } catch (error) {
        return respondToMappedError(c, error, idempotencyErrors);
      }
    });

  channelWrite("/v1/qq/groups", qqGroupRegistrationRequestSchema, (c, input, auth, key) => dependencies.services(c).registerQqGroup(input, auth, key));
  channelWrite("/v1/qq/group-members/left", qqGroupMemberLeftRequestSchema, (c, input, auth, key) => dependencies.services(c).reportQqGroupMemberLeft(input, auth, key));
};
