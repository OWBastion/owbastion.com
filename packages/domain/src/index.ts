import type {
  QqBindingRequest,
  QqBindingResponse,
  AdminBindingInviteRequest, AdminBindingInviteResponse, AdminBindingInviteBatchRequest, AdminBindingInviteBatchResponse, AdminBindingInviteListResponse, AdminBindingInviteRevokeRequest, AdminBindingInviteCodeResponse, BindingInviteRedeemRequest, BindingInviteRedeemResponse, QqBindingClaimVerifyRequest, AdminBindingClaimDecisionRequest,
  SubmissionRequest,
  SubmissionResponse,
  SubmissionStatusResponse,
  PlayerSubmissionDetail,
  QqLoginAttemptRequest,
  QqLoginAttemptResponse,
  QqLoginStatusResponse,
  QqLoginVerifyRequest,
  QqLoginVerifyResponse,
  QqGroupAccessRequest,
  QqGroupAccessResponse,
  QqGroupRegistrationRequest,
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
  AdminChallenge, AdminChallengeListResponse, AdminChallengeUpdateRequest, AdminMapMetadataUpdateRequest,
  AdminCatalogTitleUpdateRequest,
  RandomEvent, RandomEventListResponse, AdminRandomEventCreateRequest, AdminRandomEventUpdateRequest, AdminRandomEventImportRequest,
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
  listRandomEvents(input: { query?: string; category?: string; rarity?: string; status?: "implemented" | "removed"; includeArchived?: boolean }): Promise<RandomEvent[]>;
  getRandomEvent(input: { eventId: string; includeArchived?: boolean }): Promise<RandomEvent | null>;
  createAdminRandomEvent(input: AdminRandomEventCreateRequest, auth: AuthContext, idempotencyKey: string): Promise<RandomEvent>;
  updateAdminRandomEvent(input: AdminRandomEventUpdateRequest & { eventId: string }, auth: AuthContext, idempotencyKey: string): Promise<RandomEvent>;
  archiveAdminRandomEvent(input: { eventId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  previewAdminRandomEventImport(input: AdminRandomEventImportRequest, auth: AuthContext): Promise<{ sourceHash: string; validRowCount: number; errors: Array<{ row: number; message: string }>; rows: Array<{ name: string; category: string; releaseStatus: "development" | "implemented" | "removed" }> }>;
  importAdminRandomEvents(input: AdminRandomEventImportRequest, auth: AuthContext, idempotencyKey: string): Promise<{ importedCount: number }>;
  listMaps(): Promise<Map[]>;
  updateAdminMapMetadata(input: AdminMapMetadataUpdateRequest & { mapId: string }, auth: AuthContext, idempotencyKey: string): Promise<Map>;
  listChallenges(input?: { family?: "map" | "achievement" }): Promise<Challenge[]>;
  listTitles(input: { mapId?: string }): Promise<Title[]>;
  uploadAdminTitleIcon(input: { titleKey: string; body: ArrayBuffer; contentType: string }, auth: AuthContext): Promise<{ iconUrl: string }>;
  getPublicTitleIcon(input: { titleKey: string }): Promise<{ body: ReadableStream; contentType: string; etag?: string } | null>;
  listCurrentPlayerTitles(input: { sessionToken: string }): Promise<OwnedTitle[] | null>;
  listHistoricalTitleGrants(input: { query?: string }, auth: AuthContext): Promise<HistoricalTitleGrant[]>;
  createAdminTitleGrant(input: AdminTitleGrantRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createAdminTitleGrantBulk(input: AdminTitleGrantBulkRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminTitleGrantBulkResponse>;
  revokeAdminTitleGrant(input: { grantId: string; reason: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  listAdminChallenges(input: { family?: "map" | "achievement"; status?: string }, auth: AuthContext): Promise<AdminChallengeListResponse>;
  updateAdminChallenge(input: AdminChallengeUpdateRequest & { challengeId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminChallenge>;
  updateAdminCatalogTitle(input: AdminCatalogTitleUpdateRequest & { titleKey: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createPlayerUploadSession(input: PlayerUploadSessionRequest, sessionToken: string): Promise<PlayerUploadSessionResponse>;
  completePlayerUpload(input: { uploadId: string }, sessionToken: string): Promise<{ submissionId: string; status: string }>;
  uploadEvidence(input: { uploadId: string; body: ArrayBuffer; contentType: string }, sessionToken: string): Promise<void>;
  listAdminSubmissions(input: { statuses?: AdminSubmission["status"][]; page: number; pageSize: number }, auth: AuthContext): Promise<AdminSubmissionListResponse>;
  getAdminSubmission(input: { submissionId: string }, auth: AuthContext): Promise<AdminSubmission>;
  getAdminEvidence(input: { submissionId: string }, auth: AuthContext): Promise<{ body: ArrayBuffer; contentType: string }>;
  processOcrJob(input: { submissionId: string; objectKey: string; attempt: number }): Promise<void>;
  markOcrJobFailed(input: { submissionId: string; attempt: number; errorCode: string }): Promise<void>;
  reviewSubmission(input: { submissionId: string; decision: AdminSubmissionReviewRequest["decision"]; reason: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createBinding(input: QqBindingRequest, auth: AuthContext, idempotencyKey: string): Promise<QqBindingResponse>;
  createAdminBindingInvite(input: AdminBindingInviteRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminBindingInviteResponse>;
  createAdminBindingInviteBatch(input: AdminBindingInviteBatchRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminBindingInviteBatchResponse>;
  listAdminBindingInvites(auth: AuthContext): Promise<AdminBindingInviteListResponse>;
  getAdminBindingInviteCode(input: { inviteId: string }, auth: AuthContext): Promise<AdminBindingInviteCodeResponse>;
  revokeAdminBindingInvite(input: { inviteId: string } & AdminBindingInviteRevokeRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  redeemBindingInvite(input: BindingInviteRedeemRequest): Promise<BindingInviteRedeemResponse>;
  verifyBindingClaim(input: QqBindingClaimVerifyRequest, auth: AuthContext, idempotencyKey: string): Promise<QqLoginVerifyResponse>;
  listAdminBindingClaims(auth: AuthContext): Promise<{ contractVersion: "1"; items: Array<{ claimId: string; playerName: string; playerId: string; status: "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired"; createdAt: number; memberOpenId?: string; groupOpenId?: string; invitedBy: string; affectedPlayerAccountId?: string }> }>;
  decideAdminBindingClaim(input: { claimId: string } & AdminBindingClaimDecisionRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createSubmission(input: SubmissionRequest, auth: AuthContext, idempotencyKey: string): Promise<SubmissionResponse>;
  getSubmission(input: { submissionId: string }, auth: AuthContext): Promise<SubmissionStatusResponse>;
  getPlayerSubmission(input: { submissionId: string }, sessionToken: string): Promise<PlayerSubmissionDetail>;
  getPlayerEvidence(input: { submissionId: string }, sessionToken: string): Promise<{ body: ArrayBuffer; contentType: string }>;
  createQqLoginAttempt(input: QqLoginAttemptRequest): Promise<QqLoginAttemptResponse>;
  getQqLoginStatus(input: { attemptId: string; attemptToken: string }): Promise<QqLoginStatusResponse>;
  verifyQqLogin(input: QqLoginVerifyRequest, auth: AuthContext, idempotencyKey: string): Promise<QqLoginVerifyResponse>;
  upsertQqGroupAccess(input: QqGroupAccessRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  registerQqGroup(input: QqGroupRegistrationRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  listQqGroupAccess(auth: AuthContext): Promise<QqGroupAccessResponse[]>;
  dispatchPendingQqGroupPolicyEvents(): Promise<void>;
  markQqGroupPolicyEventDelivered(input: { eventId: string }): Promise<void>;
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
