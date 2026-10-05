import type {
  QqBindingRequest,
  QqBindingResponse,
  AdminBindingInviteRequest, AdminBindingInviteResponse, AdminBindingInviteBatchRequest, AdminBindingInviteBatchResponse, AdminBindingInviteListResponse, AdminBindingInviteRevokeRequest, AdminBindingInviteCodeResponse, AdminActiveBindingListResponse, BindingInviteRedeemRequest, BindingInviteRedeemResponse, BindingClaimStatusResponse, BindingClaimSessionResponse, QqBindingClaimVerifyRequest, QqBindingClaimVerifyResponse, AdminBindingClaimDecisionRequest, AdminBindingClaimListResponse,
  SubmissionStatusResponse,
  PlayerSubmissionStatus,
  PlayerSubmissionDetail,
  QqLoginAttemptRequest,
  QqLoginAttemptResponse,
  QqLoginStatusResponse,
  QqLoginVerifyRequest,
  PasskeyLoginOptionsResponse,
  PasskeyLoginVerifyRequest,
  PasskeyRegistrationVerifyRequest,
  PasskeyPublicRegistrationOptionsRequest,
  PasskeyPublicRegistrationVerifyRequest,
  PasskeyCredentialListResponse,
  AdminPasskeyRecoveryRequest,
  QqGroupAccessRequest,
  QqGroupAccessResponse,
  QqGroupRegistrationRequest,
  AdminPlayerDetail,
  AdminPlayerListResponse,
  AdminPlayerStatusRequest,
  AdminPlayerIdentityRequest,
  CurrentPlayerResponse,
  CurrentPlayerTitlesResponse,
  CurrentPlayerMasteryResponse,
  AdminSubmission,
  AdminSubmissionListResponse,
  AdminSubmissionReviewRequest,
  AdminSubmissionReviewPreviewResponse,
  AdminSubmissionReviewResponse,
  AdminSubmissionOcrRetryResponse,
  AdminSubmissionSpotCheckRequest,
  AdminSubmissionSpotCheckResponse,
  AdminVerifiedRunListResponse,
  AdminVerifiedRunDetailResponse,
  AdminVerifiedRunStateRequest,
  AdminVerifiedRunStateResponse,
  AdminVerifiedRunConflictResolutionRequest,
  AdminVerifiedRunConflictResolutionResponse,
  AdminVerifiedRunCorrectionRequest,
  AdminVerifiedRunCorrectionResponse,
  Challenge,
  Map,
  Title,
  OwnedTitle, HistoricalTitleGrant, AdminTitleGrantListResponse, AdminTitleGrantHolderDetailResponse, AdminHistoricalTitleHolderFilter, AdminTitleGrantRequest, AdminTitleGrantBulkRequest, AdminTitleGrantBulkResponse, AdminManualTitleGrantRequest, AdminManualTitleGrantResponse, AdminManualTitleGrantBatchRequest, AdminManualTitleGrantBatchResponse,
  AdminChallenge, AdminChallengeListResponse, AdminChallengeUpdateRequest, AdminAchievementCreateRequest, AdminMapMetadataUpdateRequest,
  AdminMapEditorResponse, AdminMapRevision, AdminMapRevisionCreateRequest, AdminMapRevisionUpdateRequest, AdminMapRevisionPromotionRequest,
  AdminCatalogTitleUpdateRequest,
  AdminMapTitleRule, AdminMapTitleRuleListResponse, AdminMapTitleRuleCreateRequest, AdminMapTitleRuleUpdateRequest, AdminMapTitleInheritanceResponse, AdminMapTitleRuleExceptionUpsertRequest,
  RandomEvent, RandomEventListResponse, AdminRandomEventCreateRequest, AdminRandomEventUpdateRequest, AdminRandomEventImportRequest, RandomEventVersion, AdminRandomEventVersionAvailabilityRequest, AdminRandomEventVersionListResponse,
  PlayerUploadSessionRequest,
  PlayerUploadSessionResponse,
  OcrAccuracyFeedbackRequest,
  OcrAccuracyFeedbackResponse,
  AdminScreenshotSetListResponse,
  AdminScreenshotSetCandidateListResponse,
  AdminScreenshotSetCreateRequest,
  AdminScreenshotSetCreateResponse,
  AdminScreenshotSetFinalizeResponse,
  AdminScreenshotSetDiscardResponse,
  AdminScreenshotSetDetailResponse,
  ScreenshotSetStatus,
  OcrkitScreenshotSetResponse,
  AgentEventListResponse, AgentMap, AgentMapListResponse, AgentAchievementListResponse, AgentTitle, AgentTitleListResponse, AgentSearchResponse, AgentSearchResult, AgentPlayerTitleGrantListResponse, AgentMapTitleHolderListResponse,
  AdminReview, AdminReviewAudit, AdminReviewListResponse,
} from "@owbastion/contracts";
import type { VerifiedRunDifficulty, MasteryMapProfile, VerifiedRunActor, RecordVerifiedRunResult, VerifiedRun, VerifiedRunInput } from "./mastery";

export * from "./mastery";
export * from "./gameplay-revision";
export * from "./challenge-conditions";
export * from "./random-event";

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
export type ReviewTarget = { targetType: "event"; targetId: string } | { targetType: "map"; targetId: string; gameplayRevisionId: string };
export type ReviewUpsertInput = ReviewTarget & { rating: ReviewRating; comment?: string | null; anonymous?: boolean };
export type ReviewRecord = {
  reviewId: string;
  playerAccountId: string;
  targetType: ReviewTargetType;
  targetId: string;
  gameplayRevisionId: string | null;
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
export type ReviewSummary = {
  targetType: ReviewTargetType;
  targetId: string;
  gameplayRevisionId: string | null;
  averageRating: number | null;
  reviewCount: number;
  ratingDistribution: Record<ReviewRating, number>;
  sampleInsufficient: boolean;
};
export type ReviewSummaryBatchInput = { targetType: "event"; targetIds: string[] } | { targetType: "map"; targets: Array<{ targetId: string; gameplayRevisionId: string }> };
export type PublicReviewComment = {
  rating: ReviewRating;
  comment: string;
  author: { displayName: string } | null;
  createdAt: number;
};
export type PublicReviewCommentQuery = ReviewTarget & { page: number; pageSize: number };
export type PublicReviewCommentPage = {
  targetType: ReviewTargetType;
  targetId: string;
  gameplayRevisionId: string | null;
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
export type AgentEventQuery = AgentPageInput & { query?: string; category?: string; rarity?: string; status?: RandomEvent["releaseStatus"] };
export type AgentMapQuery = AgentPageInput & { query?: string; mechanic?: string };
export type AgentAchievementQuery = AgentPageInput & { query?: string; status?: "active" | "sunsetting"; mapId?: string };
export type AgentTitleQuery = AgentPageInput & { query?: string; category?: string; scope?: "global" | "map"; mapId?: string };
export type AgentPlayerTitleGrantQuery = AgentPageInput;
export type AgentMapTitleHolderQuery = AgentPageInput & { mapId: string };
export type AgentSearchQuery = AgentPageInput & { query: string; kind?: AgentSearchResult["kind"]; status?: RandomEvent["releaseStatus"] };
export type AdminVerifiedRunQuery = AgentPageInput & {
  playerAccountId?: string;
  mapId?: string;
  gameplayRevisionId?: string;
  difficulty?: VerifiedRunDifficulty;
  status?: "active" | "invalidated";
  unresolvedConflictsOnly?: boolean;
  acceptanceSource?: "submission_automatic" | "submission_review";
  matchCode?: string;
  from?: number;
  to?: number;
};

export type PlatformServices = {
  recordVerifiedRun(input: VerifiedRunInput): Promise<RecordVerifiedRunResult>;
  invalidateVerifiedRun(input: { verifiedRunId: string; reason?: string }, actor: VerifiedRunActor): Promise<VerifiedRun>;
  restoreVerifiedRun(input: { verifiedRunId: string; reason?: string }, actor: VerifiedRunActor): Promise<VerifiedRun>;
  rebuildMasteryProfiles(input: { playerAccountId: string; mapId?: string; gameplayRevisionId?: string; recentLimit?: number }): Promise<MasteryMapProfile[]>;
  listAdminVerifiedRuns(input: AdminVerifiedRunQuery, auth: AuthContext): Promise<AdminVerifiedRunListResponse>;
  getAdminVerifiedRun(input: { verifiedRunId: string }, auth: AuthContext): Promise<AdminVerifiedRunDetailResponse>;
  correctAdminVerifiedRun(input: AdminVerifiedRunCorrectionRequest & { verifiedRunId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminVerifiedRunCorrectionResponse>;
  transitionAdminVerifiedRun(input: AdminVerifiedRunStateRequest & { verifiedRunId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminVerifiedRunStateResponse>;
  resolveAdminVerifiedRunConflict(input: AdminVerifiedRunConflictResolutionRequest & { verifiedRunId: string; submissionId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminVerifiedRunConflictResolutionResponse>;
  listAgentEvents(input: AgentEventQuery): Promise<AgentEventListResponse>;
  getAgentEvent(input: { eventId: string; status?: RandomEvent["releaseStatus"] }): Promise<RandomEvent | null>;
  listAgentMaps(input: AgentMapQuery): Promise<AgentMapListResponse>;
  getAgentMap(input: { mapId: string }): Promise<AgentMap | null>;
  listAgentAchievements(input: AgentAchievementQuery): Promise<AgentAchievementListResponse>;
  getAgentAchievement(input: { challengeId: string; mapId?: string; gameplayRevisionId?: string }): Promise<Challenge | null>;
  listAgentTitles(input: AgentTitleQuery): Promise<AgentTitleListResponse>;
  listAgentPlayerTitleGrants(input: AgentPlayerTitleGrantQuery): Promise<AgentPlayerTitleGrantListResponse>;
  listAgentMapTitleHolders(input: AgentMapTitleHolderQuery): Promise<AgentMapTitleHolderListResponse>;
  getAgentTitle(input: { titleKey: string }): Promise<AgentTitle | null>;
  searchAgentContent(input: AgentSearchQuery): Promise<AgentSearchResponse>;
  listRandomEvents(input: { query?: string; category?: string; rarity?: string; status?: RandomEvent["releaseStatus"]; includeArchived?: boolean }): Promise<RandomEvent[]>;
  getRandomEvent(input: { eventId: string; status?: RandomEvent["releaseStatus"]; includeArchived?: boolean }): Promise<RandomEvent | null>;
  createAdminRandomEvent(input: AdminRandomEventCreateRequest, auth: AuthContext, idempotencyKey: string): Promise<RandomEvent>;
  updateAdminRandomEvent(input: AdminRandomEventUpdateRequest & { eventId: string }, auth: AuthContext, idempotencyKey: string): Promise<RandomEvent>;
  archiveAdminRandomEvent(input: { eventId: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  previewAdminRandomEventImport(input: AdminRandomEventImportRequest, auth: AuthContext): Promise<{ sourceHash: string; validRowCount: number; errors: Array<{ row: number; message: string }>; rows: Array<{ name: string; category: string; releaseStatus: "development" | "implemented" | "removed" }> }>;
  importAdminRandomEvents(input: AdminRandomEventImportRequest, auth: AuthContext, idempotencyKey: string): Promise<{ importedCount: number }>;
  listAdminRandomEventVersions(auth: AuthContext): Promise<AdminRandomEventVersionListResponse>;
  updateAdminRandomEventVersion(input: AdminRandomEventVersionAvailabilityRequest & { gameVersion: string }, auth: AuthContext, idempotencyKey: string): Promise<RandomEventVersion>;
  listMaps(): Promise<Map[]>;
  updateAdminMapMetadata(input: AdminMapMetadataUpdateRequest & { mapId: string }, auth: AuthContext, idempotencyKey: string): Promise<Map>;
  getAdminMapEditor(input: { mapId: string }, auth: AuthContext): Promise<AdminMapEditorResponse>;
  createAdminMapRevision(input: AdminMapRevisionCreateRequest & { mapId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminMapRevision>;
  updateAdminMapRevision(input: AdminMapRevisionUpdateRequest & { mapId: string; revisionId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminMapRevision>;
  promoteAdminMapRevision(input: AdminMapRevisionPromotionRequest & { mapId: string; revisionId: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminMapRevision>;
  listChallenges(input?: { family?: "map" | "achievement" }): Promise<Challenge[]>;
  listTitles(input: { mapId?: string }): Promise<Title[]>;
  uploadAdminTitleIcon(input: { titleKey: string; body: ArrayBuffer; contentType: string }, auth: AuthContext): Promise<{ iconUrl: string }>;
  getPublicTitleIcon(input: { titleKey: string; version?: string }): Promise<{ body: ReadableStream; contentType: string; etag?: string } | null>;
  listCurrentPlayerTitles(input: { sessionToken: string }): Promise<Omit<CurrentPlayerTitlesResponse, "contractVersion"> | null>;
  replaceCurrentPlayerEquippedTitles(input: { grantIds: string[]; sessionToken: string }, idempotencyKey: string): Promise<{ contractVersion: "1"; grantIds: string[] }>;
  replaceAdminPlayerEquippedTitles(input: { playerAccountId: string; grantIds: string[] }, auth: AuthContext, idempotencyKey: string): Promise<{ contractVersion: "1"; grantIds: string[] }>;
  listHistoricalTitleGrants(input: { query?: string; filter?: AdminHistoricalTitleHolderFilter; page: number; pageSize: number }, auth: AuthContext): Promise<AdminTitleGrantListResponse>;
  getHistoricalTitleHolder(input: { holderName: string; page: number; pageSize: number; grantStatus?: "all" | "unclaimed" | "active" | "revoked" }, auth: AuthContext): Promise<AdminTitleGrantHolderDetailResponse>;
  createAdminTitleGrant(input: AdminTitleGrantRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createAdminTitleGrantBulk(input: AdminTitleGrantBulkRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminTitleGrantBulkResponse>;
  revokeAdminTitleGrant(input: { grantId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  restoreAdminTitleGrant(input: { grantId: string; reason?: string }, auth: AuthContext, idempotencyKey: string): Promise<void>;
  createAdminManualTitleGrant(input: AdminManualTitleGrantRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminManualTitleGrantResponse>;
  createAdminManualTitleGrantBatch(input: AdminManualTitleGrantBatchRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminManualTitleGrantBatchResponse>;
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
  completePlayerUpload(input: { uploadId: string }, sessionToken: string, requestId?: string): Promise<{ submissionId: string; status: PlayerSubmissionStatus }>;
  uploadEvidence(input: { uploadId: string; body: ArrayBuffer; contentType: string }, sessionToken: string): Promise<void>;
  listAdminSubmissions(input: { statuses?: AdminSubmission["status"][]; spotCheck?: "pending" | "confirmed" | "revoked"; order?: "oldest" | "newest"; page: number; pageSize: number }, auth: AuthContext): Promise<AdminSubmissionListResponse>;
  getAdminSubmission(input: { submissionId: string }, auth: AuthContext): Promise<AdminSubmission>;
  requestAdminOcr(input: { submissionId: string }, auth: AuthContext, idempotencyKey: string, requestId?: string): Promise<AdminSubmissionOcrRetryResponse>;
  resolveAdminSubmissionSpotCheck(input: { submissionId: string } & AdminSubmissionSpotCheckRequest, auth: AuthContext, idempotencyKey: string): Promise<AdminSubmissionSpotCheckResponse>;
  completeOcrJob(input: { jobId: string; payload: import("@owbastion/contracts").OcrkitJobCallback }): Promise<void>;
  processOcrJob(input: { jobId: string; submissionId: string; objectKey: string; attempt: number; manual?: boolean; requestId?: string }): Promise<void>;
  markOcrJobFailed(input: { jobId?: string; submissionId: string; attempt: number; errorCode: string; manual?: boolean; requestId?: string }): Promise<void>;
  reconcileStaleOcrJobs(input: { olderThan: number }): Promise<number>;
  previewSubmissionReview(input: { submissionId: string; fieldCorrections?: AdminSubmissionReviewRequest["fieldCorrections"]; confirmedChallengeIds?: string[] }, auth: AuthContext): Promise<AdminSubmissionReviewPreviewResponse>;
  reviewSubmission(input: { submissionId: string; decision: AdminSubmissionReviewRequest["decision"]; reason?: string; fieldCorrections?: AdminSubmissionReviewRequest["fieldCorrections"]; confirmedChallengeIds?: string[] }, auth: AuthContext, idempotencyKey: string): Promise<AdminSubmissionReviewResponse>;
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
  verifyBindingClaim(input: QqBindingClaimVerifyRequest, auth: AuthContext, idempotencyKey: string): Promise<QqBindingClaimVerifyResponse>;
  listAdminBindingClaims(auth: AuthContext): Promise<AdminBindingClaimListResponse>;
  decideAdminBindingClaim(input: { claimId: string } & AdminBindingClaimDecisionRequest, auth: AuthContext, idempotencyKey: string): Promise<void>;
  getSubmission(input: { submissionId: string }, auth: AuthContext): Promise<SubmissionStatusResponse>;
  getPlayerSubmission(input: { submissionId: string }, sessionToken: string): Promise<PlayerSubmissionDetail>;
  submitPlayerOcrFeedback(input: Omit<OcrAccuracyFeedbackRequest, "contractVersion"> & { submissionId: string }, sessionToken: string, idempotencyKey: string): Promise<OcrAccuracyFeedbackResponse>;
  submitAdminOcrAccuracy(input: Omit<OcrAccuracyFeedbackRequest, "contractVersion"> & { submissionId: string }, auth: AuthContext, idempotencyKey: string): Promise<OcrAccuracyFeedbackResponse>;
  listAdminScreenshotSetCandidates(input: { page: number; pageSize: number }, auth: AuthContext): Promise<AdminScreenshotSetCandidateListResponse>;
  createAdminScreenshotSet(input: Omit<AdminScreenshotSetCreateRequest, "contractVersion">, auth: AuthContext, idempotencyKey: string): Promise<AdminScreenshotSetCreateResponse>;
  listAdminScreenshotSets(input: { page: number; pageSize: number; status?: ScreenshotSetStatus }, auth: AuthContext): Promise<AdminScreenshotSetListResponse>;
  getAdminScreenshotSet(input: { setId: string }, auth: AuthContext): Promise<AdminScreenshotSetDetailResponse>;
  finalizeAdminScreenshotSet(input: { setId: string; note?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminScreenshotSetFinalizeResponse>;
  discardAdminScreenshotSet(input: { setId: string; note?: string }, auth: AuthContext, idempotencyKey: string): Promise<AdminScreenshotSetDiscardResponse>;
  getOcrkitScreenshotSet(input: { version: number }): Promise<OcrkitScreenshotSetResponse>;
  requestManualReview(input: { submissionId: string }, sessionToken: string): Promise<void>;
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
  getCurrentPlayerMastery(input: { sessionToken: string; mapId?: string; gameplayRevisionId?: string; page: number; pageSize: number }): Promise<CurrentPlayerMasteryResponse | null>;
  getPortalSessionIdentity(input: { sessionToken: string }): Promise<{ player: { playerId: string; isAdmin: boolean } } | null>;
  getCurrentPlayer(input: { sessionToken: string }): Promise<CurrentPlayerResponse | null>;
  createQqLoginAttempt(input: QqLoginAttemptRequest): Promise<QqLoginAttemptResponse>;
  getQqLoginStatus(input: { attemptId: string; attemptToken: string }): Promise<QqLoginStatusResponse>;
  verifyQqLogin(input: QqLoginVerifyRequest, auth: AuthContext, idempotencyKey: string): Promise<QqBindingClaimVerifyResponse>;
  createPasskeyLoginOptions(input: { rpId: string }): Promise<PasskeyLoginOptionsResponse>;
  completePasskeyLogin(input: PasskeyLoginVerifyRequest & { origin: string; rpId: string }): Promise<{ sessionToken: string }>;
  createCurrentPlayerPasskeyRegistrationOptions(input: { sessionToken: string; name: string; rpId: string }): Promise<{ contractVersion: "1"; challengeId: string; options: Record<string, unknown> }>;
  completeCurrentPlayerPasskeyRegistration(input: PasskeyRegistrationVerifyRequest & { sessionToken: string; origin: string; rpId: string }): Promise<void>;
  listCurrentPlayerPasskeys(input: { sessionToken: string }): Promise<PasskeyCredentialListResponse | null>;
  removeCurrentPlayerPasskey(input: { sessionToken: string; passkeyId: string }): Promise<void>;
  createAdminPasskeyRecovery(input: { playerAccountId: string } & AdminPasskeyRecoveryRequest, auth: AuthContext, idempotencyKey: string): Promise<{ token: string; expiresAt: number }>;
  createPasskeyRecoveryOptions(input: PasskeyPublicRegistrationOptionsRequest & { rpId: string }): Promise<{ contractVersion: "1"; challengeId: string; options: Record<string, unknown> }>;
  completePasskeyRecoveryRegistration(input: PasskeyPublicRegistrationVerifyRequest & { origin: string; rpId: string }): Promise<{ sessionToken: string }>;
  logoutPortalSession(input: { sessionToken: string }): Promise<void>;
  listLocalDevAccounts(): Promise<LocalDevAccount[]>;
  createLocalDevSession(input: { accountId: string }): Promise<{ sessionToken: string }>;
};

export type Authenticator<Env> = (request: Request, env: Env) => Promise<AuthContext | null>;
