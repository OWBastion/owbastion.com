import type {
  QqBindingRequest,
  QqBindingResponse,
  SubmissionRequest,
  SubmissionResponse,
  SubmissionStatusResponse,
} from "@owbastion/contracts";

export type AuthContext = {
  actorType: "service" | "user";
  subject: string;
  roles: readonly string[];
  provider: string;
};

export type PlatformServices = {
  createBinding(input: QqBindingRequest, auth: AuthContext, idempotencyKey: string): Promise<QqBindingResponse>;
  createSubmission(input: SubmissionRequest, auth: AuthContext, idempotencyKey: string): Promise<SubmissionResponse>;
  getSubmission(input: { submissionId: string }, auth: AuthContext): Promise<SubmissionStatusResponse>;
};

export type Authenticator<Env> = (request: Request, env: Env) => Promise<AuthContext | null>;
