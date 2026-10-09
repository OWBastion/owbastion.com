import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { recordPortalError, type PortalErrorData } from "~/utils/portal-error";

export type SubmissionStatus = "processing" | "needs_review" | "completed" | "rejected";

export type VerifiedRunSubmissionOutcome = {
  status: "created" | "reused" | "ineligible" | "invalidated";
  awardedXp: number;
};

export type VerifiedRunDifficulty = "简单" | "一般" | "困难" | "专家" | "传奇" | "地狱";

export type PlayerVerifiedRun = {
  runId: string;
  mapId: string;
  gameplayRevisionId: string;
  gameplayRevisionLifecycle: "preparing" | "default" | "selectable" | "historical";
  mapVariant: "classic" | null;
  difficulty: VerifiedRunDifficulty;
  completionDurationSeconds: number;
  deaths: number | null;
  skips: number | null;
  awardedXp: number;
  acceptedAt: number;
  status: "active" | "invalidated";
};

export type PlayerMasteryMapProfile = {
  mapId: string;
  gameplayRevisionId: string;
  gameplayRevisionLifecycle: "preparing" | "default" | "selectable" | "historical";
  totalXp: number;
  verifiedRunCount: number;
  difficultyStats: Array<{ difficulty: VerifiedRunDifficulty; verifiedRunCount: number; fastestCompletionSeconds: number }>;
  lowestDeaths: number | null;
  fewestSkips: number | null;
  highestSingleRunXp: number | null;
  highestCompletedDifficulty: VerifiedRunDifficulty | null;
  recentRuns: PlayerVerifiedRun[];
};

export type PortalMap = {
  mapId: string;
  mapName: string;
  defaultGameplayRevisionId?: string | null;
};

export type AchievementProgressRule = {
  type: "required_maps_completed";
  mapIds: string[];
  difficultyAtLeast?: string;
};

export type PlayerChallengeProgress = {
  challengeId: string;
  titleKey: string;
  titleName: string;
  icon: string;
  iconUrl?: string | null;
  status: "scheduled" | "active" | "sunsetting";
  startsAt?: number;
  endsAt?: number;
  progressRule: AchievementProgressRule;
  maps: Array<{ mapId: string; completed: boolean }>;
  completedMaps: number;
  satisfied: boolean;
};

export type PlayerChallengeProgressListResponse = {
  contractVersion: "1";
  items: PlayerChallengeProgress[];
};

export type CurrentPlayerMasteryResponse = {
  contractVersion: "1";
  profiles: PlayerMasteryMapProfile[];
  runs: PlayerVerifiedRun[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type PlayerActivityDay = { date: string; runCount: number };

export type PlayerActivityResponse = { contractVersion: "1"; days: PlayerActivityDay[] };

export type CurrentPlayer = {
  contractVersion: "1";
  player: { playerId: string; playerName: string; isAdmin: boolean };
  recentSubmissions: Array<{ submissionId: string; status: SubmissionStatus; resubmissionRequired?: boolean; mapName: string; challengeId?: string; difficulty?: string; reason?: string; verifiedRunOutcome?: VerifiedRunSubmissionOutcome; createdAt: number; updatedAt: number }>;
};

export type PortalApiError = Error & { statusCode?: number; requestId?: string; data?: { error?: PortalErrorData }; response?: { status?: number; headers?: Headers; _data?: unknown } };

const requestOptions = (options: Parameters<typeof $fetch>[1], requestId: string) => {
  const headers = new Headers(options?.headers as HeadersInit | undefined);
  if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
  return { ...options, headers };
};

type PlainFetch = <T>(url: string, options?: Record<string, unknown>) => Promise<T>;

export function usePortalApi() {
  // Each branch is cast on its own: letting the compiler reduce the union of the two typed Nitro fetch signatures recurses past its depth limit.
  const requestFetch = (import.meta.server ? (useRequestFetch() as unknown as PlainFetch) : ($fetch as unknown as PlainFetch));

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
