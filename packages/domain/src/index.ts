import type {
  QqBindingRequest,
  QqBindingResponse,
  SubmissionRequest,
  SubmissionResponse,
  SubmissionStatusResponse,
  QqLoginAttemptRequest,
  QqLoginAttemptResponse,
  QqLoginStatusResponse,
  QqLoginVerifyRequest,
  QqLoginVerifyResponse,
  QqGroupAccessRequest,
  QqGroupAccessResponse,
  AdminPlayerDetail,
  AdminPlayerListResponse,
  AdminPlayerStatusRequest,
  CurrentPlayerResponse,
  AdminSubmission,
  AdminSubmissionListResponse,
  AdminSubmissionReviewRequest,
  Challenge,
  Map,
  Title,
  OwnedTitle, HistoricalTitleGrant, AdminTitleGrantRequest, AdminTitleGrantBulkRequest, AdminTitleGrantBulkResponse,
  AdminChallenge, AdminChallengeListResponse, AdminChallengeUpdateRequest,
  PlayerUploadSessionRequest,
  PlayerUploadSessionResponse,
} from "@owbastion/contracts";

export type LocalDevAccount = {
  accountId: string;
  playerId: string;
  playerName: string;
  isAdmin: boolean;
};

export type AuthContext = {
  actorType: "service" | "user";
  subject: string;
  roles: readonly string[];
  provider: string;
};

export type PlatformServices = {
  listMaps(): Promise<Map[]>;
  listChallenges(input?: { family?: "map" | "achievement" }): Promise<Challenge[]>;
  listTitles(input: { mapId?: string }): Promise<Title[]>;
  listCurrentPlayerTitles(input: { sessionToken: string }): Promise<OwnedTitle[] | null>;
  listHistoricalTitleGrants(input: { query?: string }, auth: AuthContext): Promise<HistoricalTitleGrant[]>;
  createAdminTitleGrant(input: AdminTitleGrantRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createAdminTitleGrantBulk(input: AdminTitleGrantBulkRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminTitleGrantBulkResponse>;
  revokeAdminTitleGrant(input: { grantId: string; reason: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  listAdminChallenges(input: { family?: "map" | "achievement"; status?: string }, auth: AuthContext): Promise<AdminChallengeListResponse>;
  updateAdminChallenge(input: AdminChallengeUpdateRequest & { challengeId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminChallenge>;
  createPlayerUploadSession(input: PlayerUploadSessionRequest, sessionToken: string): Promise<PlayerUploadSessionResponse>;
  completePlayerUpload(input: { uploadId: string }, sessionToken: string): Promise<{ submissionId: string; status: string }>;
  uploadEvidence(input: { uploadId: string; body: ArrayBuffer; contentType: string }, sessionToken: string): Promise<void>;
  listAdminSubmissions(input: { status?: string }, auth: AuthContext): Promise<AdminSubmissionListResponse>;
  getAdminSubmission(input: { submissionId: string }, auth: AuthContext): Promise<AdminSubmission>;
  getAdminEvidence(input: { submissionId: string }, auth: AuthContext): Promise<{ body: ArrayBuffer; contentType: string }>;
  processOcrJob(input: { submissionId: string; objectKey: string; attempt: number }): Promise<void>;
  reviewSubmission(input: { submissionId: string; decision: AdminSubmissionReviewRequest["decision"]; reason: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createBinding(input: QqBindingRequest, auth: AuthContext, idempotencyKey: string): Promise<QqBindingResponse>;
  createSubmission(input: SubmissionRequest, auth: AuthContext, idempotencyKey: string): Promise<SubmissionResponse>;
  getSubmission(input: { submissionId: string }, auth: AuthContext): Promise<SubmissionStatusResponse>;
  createQqLoginAttempt(input: QqLoginAttemptRequest): Promise<QqLoginAttemptResponse>;
  getQqLoginStatus(input: { attemptId: string; attemptToken: string }): Promise<QqLoginStatusResponse>;
  verifyQqLogin(input: QqLoginVerifyRequest, auth: AuthContext, idempotencyKey: string): Promise<QqLoginVerifyResponse>;
  upsertQqGroupAccess(input: QqGroupAccessRequest, auth: AuthContext): Promise<void>;
  listQqGroupAccess(auth: AuthContext): Promise<QqGroupAccessResponse[]>;
  listAdminPlayers(input: { query?: string; status?: "active" | "banned"; page: number; pageSize: number }, auth: AuthContext): Promise<AdminPlayerListResponse>;
  getAdminPlayer(input: { playerAccountId: string }, auth: AuthContext): Promise<AdminPlayerDetail>;
  setAdminPlayerStatus(input: { playerAccountId: string; status: "active" | "banned"; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  removeAdminBinding(input: { bindingId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  getCurrentPlayer(input: { sessionToken: string }): Promise<CurrentPlayerResponse | null>;
  logoutPortalSession(input: { sessionToken: string }): Promise<void>;
  listLocalDevAccounts(): Promise<LocalDevAccount[]>;
  createLocalDevSession(input: { accountId: string }): Promise<{ sessionToken: string }>;
};

export type Authenticator<Env> = (request: Request, env: Env) => Promise<AuthContext | null>;
