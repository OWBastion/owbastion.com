import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { recordPortalError } from "~/utils/portal-error";

export type AdminPlayer = {
  playerAccountId: string;
  playerId: string;
  playerName: string;
  status: "active" | "banned";
  bindingCount: number;
  updatedAt: number;
};

export type AdminPlayerDetail = AdminPlayer & {
  bindings: Array<{ bindingId: string; provider: "qq"; groupOpenId: string; memberOpenId: string; createdAt: number }>;
  recentSubmissions: Array<{
    submissionId: string;
    status: string;
    mapName: string;
    challengeId?: string;
    difficulty?: string;
    reason?: string;
    challenge?: { family: "map"; name: string; mapName: string; difficulty: string | null; mapVariant?: "classic" } | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string; mapVariant?: "classic" } | null;
    createdAt: number;
    updatedAt: number;
  }>;
  titleGrants: Array<{ grantId: string; titleKey: string; label: string; icon: string; iconUrl?: string | null; category: string; condition: string; scope: "global" | "map"; mapName?: string; slot?: "pioneer" | "conqueror" | "dominator"; grantedAt: number; sourceType: "historical" | "submission" | "manual" | "automatic"; grantedBy: string }>;
};

export type AdminGroup = { groupOpenId: string; displayName: string; environment: "production" | "test"; status: "pending" | "active" | "legacy" | "disconnected"; bindEnabled: boolean; verifyEnabled: boolean; updatedAt: number };
export type AdminSubmission = { submissionId: string; status: string; challengeId: string; gameplayRevisionId?: string | null; challenge: { family: "map"; name: string; mapName: string; difficulty: string | null; mapVariant?: "classic" } | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string; mapVariant?: "classic" } | null; mapName: string; difficulty: string; playerAccountId: string; playerName: string; createdAt: number; updatedAt: number; ocrStatus: "not_started" | "pending" | "matched" | "mismatch" | "review_required" | "error"; ocrAttempt: number | null; ocrErrorCode: string | null; ocr: Record<string, unknown> | null; match?: Record<string, unknown> | null; reason?: string | null; evidenceUrl: string | null; spotCheck?: { status: "pending" | "confirmed" | "revoked"; sampledAt: number; resolvedAt: number | null; reviewer: string | null; reason: string | null } | null; masteryOutcome?: { status: "created" | "reused" | "ineligible" | "conflict" | "invalidated"; masteryRunId: string | null; awardedXp: number; reason: string | null; conflictFields: Array<"run_code" | "map" | "map_variant" | "difficulty" | "game_version" | "completion_duration" | "deaths" | "skips" | "event_counters"> } };
export type AdminMasteryDifficulty = "简单" | "一般" | "困难" | "专家" | "传奇" | "地狱";
export type AdminMasteryRun = {
  runId: string;
  playerAccountId: string;
  playerId: string;
  playerName: string;
  sourceSubmissionId: string;
  mapId: string;
  mapName: string;
  mapVariant: "classic" | null;
  difficulty: AdminMasteryDifficulty;
  gameVersion: string;
  runCode: string;
  completionDurationSeconds: number;
  deaths: number | null;
  skips: number | null;
  eventCounters: Record<string, number>;
  acceptanceSource: "submission_automatic" | "submission_review";
  acceptedAt: number;
  status: "active" | "invalidated";
  invalidatedAt: number | null;
  invalidatedBy: string | null;
  invalidationReason: string | null;
  xpRuleVersion: "v1";
  xpInputSnapshot: { ruleVersion: "v1"; baseDifficultyXp: number; mapFactor: number; performanceBonus: number; performanceBonusReasons: Array<"no_deaths" | "no_skips">; challengeBonus: number };
  awardedXp: number;
  conflictCount: number;
};
export type AdminMasteryRunProjection = {
  mapId: string;
  totalXp: number;
  verifiedRunCount: number;
  difficultyStats: Array<{ difficulty: AdminMasteryDifficulty; verifiedRunCount: number; fastestCompletionSeconds: number }>;
  lowestDeaths: number | null;
  fewestSkips: number | null;
  highestSingleRunXp: number | null;
  highestCompletedDifficulty: AdminMasteryDifficulty | null;
};
export type AdminMasteryRunConflict = {
  submissionId: string;
  submissionStatus: string;
  playerAccountId: string;
  playerName: string;
  conflictFields: Array<"run_code" | "map" | "map_variant" | "difficulty" | "game_version" | "completion_duration" | "deaths" | "skips" | "event_counters">;
  facts: { mapName: string | null; mapVariant: "classic" | null; difficulty: AdminMasteryDifficulty | null; gameVersion: string | null; runCode: string | null; completionDurationSeconds: number | null; deaths: number | null; skips: number | null };
  resolution: { action: "keep_existing" | "invalidate_existing"; actorType: "service" | "user"; actorId: string; reason: string | null; resolvedAt: number } | null;
};
export type AdminMasteryRunDetail = {
  contractVersion: "1";
  run: AdminMasteryRun;
  projection: AdminMasteryRunProjection;
  sourceSubmission: AdminSubmission;
  lifecycle: Array<{ transition: "accepted" | "invalidated" | "restored"; actorType: "service" | "user"; actorId: string; reason: string | null; createdAt: number }>;
  conflicts: AdminMasteryRunConflict[];
};
export type AdminReview = {
  reviewId: string;
  targetType: "event" | "map";
  targetId: string;
  targetName: string;
  playerAccountId: string;
  playerId: string;
  playerName: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  anonymous: boolean;
  commentStatus: "visible" | "hidden";
  status: "active" | "withdrawn" | "invalidated";
  createdAt: number;
  updatedAt: number;
  withdrawnAt: number | null;
  invalidatedAt: number | null;
  invalidatedBy: string | null;
  invalidationReason: string | null;
};
export type AdminReviewAudit = { operation: string; actorType: string; actorId: string; reason: string | null; createdAt: number };
export type AdminReviewDetail = { contractVersion: "1"; review: AdminReview; audit: AdminReviewAudit[] };
export type AdminAnnotationProposal = {
  proposalId: string;
  submissionId: string;
  submissionMapName: string;
  submissionCreatedAt: number;
  ocrResultId: string;
  fieldKey: "map_name" | "difficulty" | "viewer_player" | "challenge_completed" | "achievement_titles";
  originalValue: string | null;
  feedbackType: "confirmed" | "corrected" | "passive_report";
  promptOrigin: "uncertainty" | "conflict" | "grouped" | "calibration" | null;
  proposedValue: string | null;
  modelVersion: string | null;
  layoutVersion: string | null;
  playerSubmittedAt: number;
  reviewState: "pending" | "accepted" | "rejected";
  priority: { score: number; category: "correction" | "calibration_failure" | "uncertain" | "repeat" | "confirmation"; reasons: string[] };
};
export type AdminAnnotationProposalDetail = { contractVersion: "1"; proposal: AdminAnnotationProposal; ocr: { mapName: string | null; difficulty: string | null; playerName: string | null; challengeCompleted: boolean | null; achievementTitles?: string[] } | null };
export type AdminReviewedAnnotation = {
  annotationId: string;
  submissionId: string;
  submissionMapName: string;
  ocrResultId: string;
  proposalId: string | null;
  fieldKey: AdminAnnotationProposal["fieldKey"];
  originalOcrValue: string | null;
  modelVersion: string | null;
  layoutVersion: string | null;
  reviewedValue: string;
  normalizedValue: string | null;
  playerAccountId: string | null;
  playerProposedValue: string | null;
  promptOrigin: AdminAnnotationProposal["promptOrigin"];
  reviewState: "accepted" | "superseded";
  reviewedBy: string;
  reviewedAt: number;
  note: string | null;
  supersedesAnnotationId: string | null;
  createdAt: number;
};
export type AdminDatasetSnapshot = {
  datasetId: string;
  version: number;
  status: "draft" | "finalized";
  createdBy: string;
  createdAt: number;
  finalizedBy: string | null;
  finalizedAt: number | null;
  note: string | null;
  counts: { eligibleCount: number; excludedCount: number; submissionCount: number; annotationCount: number };
};
export type AdminDatasetDetail = {
  contractVersion: "1";
  snapshot: AdminDatasetSnapshot;
  members: Array<{
    annotationId: string;
    fieldKey: AdminAnnotationProposal["fieldKey"];
    reviewedValue: string;
    normalizedValue: string | null;
    originalOcrValue: string | null;
    modelVersion: string | null;
    layoutVersion: string | null;
    evidence: { available: boolean; contentType: string | null };
  }>;
  exclusions: Array<{ annotationId: string; reason: string }>;
};

export function useAdminApi() {
  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) => {
    const requestId = createRequestId();
    const headers = new Headers(options?.headers as HeadersInit | undefined);
    if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
    try {
      return await $fetch<T>(`/api/admin${path}`, { ...options, headers, cache: "no-store", credentials: "include", retry: 0, timeout: 8_000 });
    } catch (error) {
      Object.assign(error as object, { requestId });
      recordPortalError(error, { operation: path, requestId });
      throw error;
    }
  };
}
