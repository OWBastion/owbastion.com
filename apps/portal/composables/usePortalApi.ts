import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { recordPortalError, type PortalErrorData } from "~/utils/portal-error";

export type SubmissionStatus = "received" | "evidence_pending" | "evidence_stored" | "upload_pending" | "ocr_pending" | "awaiting_player_confirmation" | "ready_for_review" | "ocr_review_required" | "approved" | "rejected" | "resubmission_required";

export type MasterySubmissionOutcome = {
  status: "created" | "reused" | "ineligible" | "invalidated";
  awardedXp: number;
};

export type MasteryDifficulty = "简单" | "一般" | "困难" | "专家" | "传奇" | "地狱";

export type PlayerMasteryRun = {
  runId: string;
  mapId: string;
  mapVariant: "classic" | null;
  difficulty: MasteryDifficulty;
  completionDurationSeconds: number;
  deaths: number | null;
  skips: number | null;
  awardedXp: number;
  acceptedAt: number;
  status: "active" | "invalidated";
};

export type PlayerMasteryMapProfile = {
  mapId: string;
  totalXp: number;
  verifiedRunCount: number;
  difficultyStats: Array<{ difficulty: MasteryDifficulty; verifiedRunCount: number; fastestCompletionSeconds: number }>;
  lowestDeaths: number | null;
  fewestSkips: number | null;
  highestSingleRunXp: number | null;
  highestCompletedDifficulty: MasteryDifficulty | null;
  recentRuns: PlayerMasteryRun[];
};

export type CurrentPlayerMasteryResponse = {
  contractVersion: "1";
  profiles: PlayerMasteryMapProfile[];
  runs: PlayerMasteryRun[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type CurrentPlayer = {
  contractVersion: "1";
  player: { playerId: string; playerName: string; bindingStatus: "bound"; isAdmin: boolean };
  recentSubmissions: Array<{ submissionId: string; status: SubmissionStatus; mapName: string; challengeId?: string; difficulty?: string; reason?: string; masteryOutcome?: MasterySubmissionOutcome; createdAt: number; updatedAt: number }>;
};

export type PortalApiError = Error & { statusCode?: number; requestId?: string; data?: { error?: PortalErrorData }; response?: { status?: number; headers?: Headers; _data?: unknown } };

const requestOptions = (options: Parameters<typeof $fetch>[1], requestId: string) => {
  const headers = new Headers(options?.headers as HeadersInit | undefined);
  if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
  return { ...options, headers };
};

export function usePortalApi() {
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) => {
    const requestId = createRequestId();
    try {
      return await requestFetch<T>(`/api/portal${path}`, { ...requestOptions(options, requestId), credentials: "include", retry: 0, timeout: 8_000 });
    } catch (error) {
      Object.assign(error as object, { requestId });
      recordPortalError(error, { operation: path, requestId });
      throw error;
    }
  };
}
