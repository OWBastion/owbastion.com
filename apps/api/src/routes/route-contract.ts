import type { Context, Hono } from "hono";
import type { AuthContext, PlatformServices } from "@owbastion/domain";
import type { RuntimeEnv } from "../app";

type ApiEnvironment = { Bindings: RuntimeEnv; Variables: { requestId: string } };
export type ApiContext = Context<ApiEnvironment>;
export type ApiApp = Hono<ApiEnvironment>;
export type ServiceAccessor = (env: RuntimeEnv) => PlatformServices;
export type RouteAccess = { auth?: AuthContext; error?: Response };
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;
export type MutationStatus = 404 | 409 | 422 | 503;

export type AdminMutationOptions<T> = {
  schema?: { safeParse(value: unknown): { success: true; data: T } | { success: false } };
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
  errorResponse: (c: any, status: ErrorStatus, code: string, message: string) => Response;
  errorGroup: (status: MutationStatus, message: string, ...codes: string[]) => Record<string, { status: MutationStatus; message: string }>;
  adminMutation: AdminMutation;
};

export const maintainerRoute = (
  requireMaintainer: AdminRouteDependencies["requireMaintainer"],
  action: (context: ApiContext, auth: AuthContext) => Promise<any> | any,
) => async (context: ApiContext) => {
  const access = await requireMaintainer(context);
  if (access.error) return access.error;
  return action(context, access.auth!);
};
