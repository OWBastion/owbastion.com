import type {
  QqBindingRequest,
  QqBindingResponse,
  AdminBindingInviteRequest, AdminBindingInviteResponse, AdminBindingInviteBatchRequest, AdminBindingInviteBatchResponse, AdminBindingInviteListResponse, AdminBindingInviteRevokeRequest, AdminBindingInviteCodeResponse, AdminActiveBindingListResponse, BindingInviteRedeemRequest, BindingInviteRedeemResponse, BindingClaimStatusResponse, QqBindingClaimVerifyRequest, AdminBindingClaimDecisionRequest, AdminBindingClaimListResponse, BindingClaimSessionResponse,
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
  AdminPlayerIdentityRequest,
  CurrentPlayerResponse,
  AdminSubmission,
  AdminSubmissionListResponse,
  AdminSubmissionChallengeRequest,
  AdminSubmissionChallengeResponse,
  AdminSubmissionReviewRequest,
  AdminSubmissionReviewResponse,
  AdminSubmissionOcrRetryResponse,
  AdminSubmissionSpotCheckRequest,
  AdminSubmissionSpotCheckResponse,
  Challenge,
  Map,
  Title,
  OwnedTitle, HistoricalTitleGrant, AdminTitleGrantListResponse, AdminTitleGrantHolderDetailResponse, AdminHistoricalTitleHolderFilter, AdminTitleGrantRequest, AdminTitleGrantBulkRequest, AdminTitleGrantBulkResponse, AdminManualTitleGrantRequest, AdminManualTitleGrantResponse,
  AdminChallenge, AdminChallengeListResponse, AdminChallengeUpdateRequest, AdminAchievementCreateRequest, AdminMapMetadataUpdateRequest,
  AdminCatalogTitleUpdateRequest,
  AdminMapTitleRule, AdminMapTitleRuleListResponse, AdminMapTitleRuleCreateRequest, AdminMapTitleRuleUpdateRequest, AdminMapTitleInheritanceResponse, AdminMapTitleRuleExceptionUpsertRequest,
  RandomEvent, RandomEventListResponse, AdminRandomEventCreateRequest, AdminRandomEventUpdateRequest, AdminRandomEventImportRequest,
  PlayerUploadSessionRequest,
  PlayerUploadSessionResponse,
  PlayerSubmissionChallengeRequest,
  AgentEventListResponse, AgentMapListResponse, AgentAchievementListResponse, AgentTitleListResponse, AgentSearchResponse, AgentSearchResult, AgentPlayerTitleGrantListResponse, AgentMapTitleHolderListResponse,
  AdminReview, AdminReviewAudit, AdminReviewListResponse,
} from "@owbastion/contracts";

export * from "./mastery";

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

export const reviewTargetTypes = ["event", "map"] as const;
export type ReviewTargetType = (typeof reviewTargetTypes)[number];
export type ReviewRating = 1 | 2 | 3 | 4 | 5;
export type ReviewStatus = "active" | "withdrawn" | "invalidated";
export type ReviewCommentStatus = "visible" | "hidden";
export type ReviewTarget = { targetType: ReviewTargetType; targetId: string };
export type ReviewUpsertInput = ReviewTarget & { rating: ReviewRating; comment?: string | null; anonymous?: boolean };
export type ReviewRecord = ReviewTarget & {
  reviewId: string;
  playerAccountId: string;
  rating: ReviewRating;
  comment: string | null;
  commentStatus: ReviewCommentStatus;
  anonymous: boolean;
  status: ReviewStatus;
  createdAt: number;
  updatedAt: number;
  withdrawnAt: number | null;
  invalidatedAt: number | null;
  invalidatedBy: string | null;
  invalidationReason: string | null;
};
export type ReviewSummary = ReviewTarget & {
  averageRating: number | null;
  reviewCount: number;
  ratingDistribution: Record<ReviewRating, number>;
  sampleInsufficient: boolean;
};
export type ReviewSummaryBatchInput = { targetType: ReviewTargetType; targetIds: string[] };
export type PublicReviewComment = {
  rating: ReviewRating;
  comment: string;
  author: { displayName: string } | null;
  createdAt: number;
};
export type PublicReviewCommentQuery = ReviewTarget & { page: number; pageSize: number };
export type PublicReviewCommentPage = ReviewTarget & {
  items: PublicReviewComment[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};
export type AdminReviewQuery = {
  targetType?: ReviewTargetType;
  targetId?: string;
  status?: ReviewStatus;
  commentStatus?: ReviewCommentStatus;
  rating?: ReviewRating;
  from?: number;
  to?: number;
  page: number;
  pageSize: number;
};
export type AdminReviewDetail = { contractVersion: "1"; review: AdminReview; audit: AdminReviewAudit[] };

export type AgentPageInput = { page: number; pageSize: number };
export type AgentEventQuery = AgentPageInput & { query?: string; category?: string; rarity?: string };
export type AgentMapQuery = AgentPageInput & { query?: string; mechanic?: string };
export type AgentAchievementQuery = AgentPageInput & { query?: string; status?: "active" | "sunsetting"; mapId?: string };
export type AgentTitleQuery = AgentPageInput & { query?: string; category?: string; scope?: "global" | "map"; mapId?: string };
export type AgentPlayerTitleGrantQuery = AgentPageInput;
export type AgentMapTitleHolderQuery = AgentPageInput & { mapId: string };
export type AgentSearchQuery = AgentPageInput & { query: string; kind?: AgentSearchResult["kind"] };

export type PlatformServices = {
  listAgentEvents(input: AgentEventQuery): Promise<AgentEventListResponse>;
  getAgentEvent(input: { eventId: string }): Promise<RandomEvent | null>;
  listAgentMaps(input: AgentMapQuery): Promise<AgentMapListResponse>;
  getAgentMap(input: { mapId: string }): Promise<Map | null>;
  listAgentAchievements(input: AgentAchievementQuery): Promise<AgentAchievementListResponse>;
  getAgentAchievement(input: { challengeId: string; mapId?: string }): Promise<Challenge | null>;
  listAgentTitles(input: AgentTitleQuery): Promise<AgentTitleListResponse>;
  listAgentPlayerTitleGrants(input: AgentPlayerTitleGrantQuery): Promise<AgentPlayerTitleGrantListResponse>;
  listAgentMapTitleHolders(input: AgentMapTitleHolderQuery): Promise<AgentMapTitleHolderListResponse>;
  getAgentTitle(input: { titleKey: string }): Promise<Title | null>;
  searchAgentContent(input: AgentSearchQuery): Promise<AgentSearchResponse>;
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
  listHistoricalTitleGrants(input: { query?: string; filter?: AdminHistoricalTitleHolderFilter; page: number; pageSize: number }, auth: AuthContext): Promise<AdminTitleGrantListResponse>;
  getHistoricalTitleHolder(input: { holderName: string; page: number; pageSize: number; grantStatus?: "all" | "unclaimed" | "active" | "revoked" }, auth: AuthContext): Promise<AdminTitleGrantHolderDetailResponse>;
  createAdminTitleGrant(input: AdminTitleGrantRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createAdminTitleGrantBulk(input: AdminTitleGrantBulkRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminTitleGrantBulkResponse>;
  revokeAdminTitleGrant(input: { grantId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createAdminManualTitleGrant(input: AdminManualTitleGrantRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminManualTitleGrantResponse>;
  listAdminChallenges(input: { family?: "map" | "achievement"; status?: string }, auth: AuthContext): Promise<AdminChallengeListResponse>;
  createAdminAchievement(input: AdminAchievementCreateRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminChallenge>;
  updateAdminChallenge(input: AdminChallengeUpdateRequest & { challengeId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminChallenge>;
  updateAdminCatalogTitle(input: AdminCatalogTitleUpdateRequest & { titleKey: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  listAdminMapTitleRules(auth: AuthContext): Promise<AdminMapTitleRuleListResponse>;
  createAdminMapTitleRule(input: AdminMapTitleRuleCreateRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminMapTitleRule>;
  updateAdminMapTitleRule(input: AdminMapTitleRuleUpdateRequest & { ruleId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminMapTitleRule>;
  listAdminMapTitleInheritance(input: { mapId: string }, auth: AuthContext): Promise<AdminMapTitleInheritanceResponse>;
  upsertAdminMapTitleRuleException(input: AdminMapTitleRuleExceptionUpsertRequest & { mapId: string; ruleId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createPlayerUploadSession(input: PlayerUploadSessionRequest, sessionToken: string): Promise<PlayerUploadSessionResponse>;
  completePlayerUpload(input: { uploadId: string }, sessionToken: string, requestId?: string): Promise<{ submissionId: string; status: string }>;
  confirmPlayerSubmissionChallenge(input: PlayerSubmissionChallengeRequest & { submissionId: string }, sessionToken: string): Promise<PlayerSubmissionDetail>;
  uploadEvidence(input: { uploadId: string; body: ArrayBuffer; contentType: string }, sessionToken: string): Promise<void>;
  listAdminSubmissions(input: { statuses?: AdminSubmission["status"][]; spotCheck?: "pending" | "confirmed" | "revoked"; page: number; pageSize: number }, auth: AuthContext): Promise<AdminSubmissionListResponse>;
  getAdminSubmission(input: { submissionId: string }, auth: AuthContext): Promise<AdminSubmission>;
  getAdminEvidence(input: { submissionId: string }, auth: AuthContext): Promise<{ body: ArrayBuffer; contentType: string }>;
  selectAdminSubmissionChallenge(input: AdminSubmissionChallengeRequest & { submissionId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminSubmissionChallengeResponse>;
  requestAdminOcr(input: { submissionId: string }, auth: AuthContext, idempotencyKey: string, requestId?: string): Promise<AdminSubmissionOcrRetryResponse>;
  resolveAdminSubmissionSpotCheck(input: { submissionId: string } & AdminSubmissionSpotCheckRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminSubmissionSpotCheckResponse>;
  processOcrJob(input: { submissionId: string; objectKey: string; attempt: number; manual?: boolean; requestId?: string }): Promise<void>;
  markOcrJobFailed(input: { submissionId: string; attempt: number; errorCode: string; manual?: boolean; requestId?: string }): Promise<void>;
  reviewSubmission(input: { submissionId: string; decision: AdminSubmissionReviewRequest["decision"]; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminSubmissionReviewResponse>;
  createBinding(input: QqBindingRequest, auth: AuthContext, idempotencyKey: string): Promise<QqBindingResponse>;
  createAdminBindingInvite(input: AdminBindingInviteRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminBindingInviteResponse>;
  createAdminBindingInviteBatch(input: AdminBindingInviteBatchRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminBindingInviteBatchResponse>;
  listAdminBindingInvites(auth: AuthContext): Promise<AdminBindingInviteListResponse>;
  retryHistoricalTitleMigration(input: { inviteId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  getAdminBindingInviteCode(input: { inviteId: string }, auth: AuthContext): Promise<AdminBindingInviteCodeResponse>;
  listAdminBindings(auth: AuthContext): Promise<AdminActiveBindingListResponse>;
  revokeAdminBindingInvite(input: { inviteId: string } & AdminBindingInviteRevokeRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  redeemBindingInvite(input: BindingInviteRedeemRequest): Promise<BindingInviteRedeemResponse>;
  getBindingClaimStatus(input: { claimId: string; claimToken: string }): Promise<BindingClaimStatusResponse>;
  exchangeBindingClaimSession(input: { claimId: string; claimToken: string }): Promise<BindingClaimSessionResponse & { sessionToken: string }>;
  verifyBindingClaim(input: QqBindingClaimVerifyRequest, auth: AuthContext, idempotencyKey: string): Promise<QqLoginVerifyResponse>;
  listAdminBindingClaims(auth: AuthContext): Promise<AdminBindingClaimListResponse>;
  decideAdminBindingClaim(input: { claimId: string } & AdminBindingClaimDecisionRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createSubmission(input: SubmissionRequest, auth: AuthContext, idempotencyKey: string): Promise<SubmissionResponse>;
  getSubmission(input: { submissionId: string }, auth: AuthContext): Promise<SubmissionStatusResponse>;
  getPlayerSubmission(input: { submissionId: string }, sessionToken: string): Promise<PlayerSubmissionDetail>;
  getPlayerEvidence(input: { submissionId: string }, sessionToken: string): Promise<{ body: ArrayBuffer; contentType: string }>;
  requestManualReview(input: { submissionId: string }, sessionToken: string): Promise<void>;
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
  updateAdminPlayerIdentity(input: AdminPlayerIdentityRequest & { playerAccountId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  removeAdminBinding(input: { bindingId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  listAdminReviews(input: AdminReviewQuery, auth: AuthContext): Promise<AdminReviewListResponse>;
  getAdminReview(input: { reviewId: string }, auth: AuthContext): Promise<AdminReviewDetail>;
  getReviewSummary(input: ReviewTarget): Promise<ReviewSummary>;
  getReviewSummaries(input: ReviewSummaryBatchInput): Promise<ReviewSummary[]>;
  listPublicReviewComments(input: PublicReviewCommentQuery): Promise<PublicReviewCommentPage>;
  getPlayerReview(input: ReviewTarget, auth: AuthContext): Promise<ReviewRecord | null>;
  upsertReview(input: ReviewUpsertInput, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord>;
  withdrawReview(input: { reviewId: string }, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord>;
  hideReviewComment(input: { reviewId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord>;
  restoreReviewComment(input: { reviewId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord>;
  invalidateReview(input: { reviewId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord>;
  restoreReview(input: { reviewId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<ReviewRecord>;
  getCurrentPlayer(input: { sessionToken: string }): Promise<CurrentPlayerResponse | null>;
  logoutPortalSession(input: { sessionToken: string }): Promise<void>;
  listLocalDevAccounts(): Promise<LocalDevAccount[]>;
  createLocalDevSession(input: { accountId: string }): Promise<{ sessionToken: string }>;
};

export type Authenticator<Env> = (request: Request, env: Env) => Promise<AuthContext | null>;
