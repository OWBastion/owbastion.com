import type { Context, Hono } from "hono";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { RuntimeEnv } from "../app";

type ApiEnvironment = { Bindings: RuntimeEnv; Variables: { requestId: string; platformServices: PlatformServices } };
export type ApiContext = Context<ApiEnvironment>;
export type ApiApp = Hono<ApiEnvironment>;
export type ServiceAccessor = (context: ApiContext) => PlatformServices;
export type RouteAccess = { auth?: AuthContext; error?: Response };
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;
export type MutationStatus = 404 | 409 | 422 | 503;
export type RouteErrorMap = Partial<Record<string, { status: ErrorStatus; message: string; responseCode?: string }>>;

export type AdminMutationOptions<T> = {
  schema?: { safeParse(value: unknown): { success: true; data: T } | { success: false; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } };
  status?: 200 | 201;
  noContent?: boolean;
  before?: () => Response | undefined;
  prepare?: (value: unknown) => unknown;
  invalidMessage?: string;
  action: (input: T, auth: AuthContext, idempotencyKey: string) => Promise<unknown>;
  errors?: Record<string, { status: MutationStatus; message: string }>;
};

export type AdminMutation = <T = undefined>(c: any, options: AdminMutationOptions<T>) => Promise<Response>;

export type AdminRouteDependencies = {
  services: ServiceAccessor;
  requireMaintainer: (c: any) => Promise<RouteAccess>;
  adminMutation: AdminMutation;
};

export const errorResponse = (c: any, status: ErrorStatus, code: string, message: string): Response =>
  c.json({ contractVersion: "1", error: { code, message, requestId: c.get("requestId") } }, status);

export const errorGroup = (status: MutationStatus, message: string, ...codes: string[]): Record<string, { status: MutationStatus; message: string }> =>
  Object.fromEntries(codes.map((code) => [code, { status, message }]));

export const idempotencyConflict = { status: 409, message: "The idempotency key was used with a different request" } as const;
export const idempotencyErrors: RouteErrorMap = { IDEMPOTENCY_CONFLICT: idempotencyConflict };
export const unauthenticatedErrors: RouteErrorMap = { UNAUTHENTICATED: { status: 401, message: "Authentication is required" } };

export const parseBody = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export const routeErrorResponse = (context: ApiContext, error: unknown, errors: RouteErrorMap) => {
  if (!(error instanceof Error)) return null;
  const mapping = errors[error.message];
  return mapping ? errorResponse(context, mapping.status, mapping.responseCode ?? error.message, mapping.message) : null;
};

export const respondToMappedError = (context: ApiContext, error: unknown, errors: RouteErrorMap): Response => {
  const response = routeErrorResponse(context, error, errors);
  if (response) return response;
  throw error;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => uuidPattern.test(value);

export const maintainerRoute = (
  requireMaintainer: AdminRouteDependencies["requireMaintainer"],
  action: (context: ApiContext, auth: AuthContext) => Promise<any> | any,
) => async (context: ApiContext) => {
  const access = await requireMaintainer(context);
  if (access.error) return access.error;
  return action(context, access.auth!);
};

type PlayerWriteDependencies = {
  requirePortalPlayer: (context: any) => Promise<{ error?: Response; sessionToken?: string }>;
};

// A Portal-session write: authenticated, idempotent, body validated against the contract.
export const createPlayerWrite = ({ requirePortalPlayer }: PlayerWriteDependencies, errors: RouteErrorMap) =>
  <Body>(
    schema: { safeParse(value: unknown): { success: true; data: Body } | { success: false } } | null,
    action: (context: any, sessionToken: string, idempotencyKey: string, body: Body) => Promise<unknown>,
    status: 200 | 201 = 200,
  ) => async (c: any) => {
    const access = await requirePortalPlayer(c);
    if (access.error) return access.error;
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey) return errorResponse(c, 422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key is required");
    const parsed = schema ? schema.safeParse(await parseBody(c.req.raw)) : null;
    if (parsed && !parsed.success) return errorResponse(c, 422, "INVALID_REQUEST", "The request does not match contract v1");
    try { return c.json(await action(c, access.sessionToken!, idempotencyKey, (parsed as { data: Body } | null)?.data as Body), status); }
    catch (error) {
      const response = routeErrorResponse(c, error, errors);
      if (response) return response;
      throw error;
    }
  };
