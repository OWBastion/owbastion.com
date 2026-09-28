import type {
  CurrentPlayerResponse as ContractCurrentPlayerResponse,
  CurrentPlayerMasteryResponse as ContractCurrentPlayerMasteryResponse,
  PlayerActivityDay as ContractPlayerActivityDay,
  PlayerActivityResponse as ContractPlayerActivityResponse,
  Map,
  PlayerChallengeProgress as ContractPlayerChallengeProgress,
  PlayerChallengeProgressListResponse as ContractPlayerChallengeProgressListResponse,
  PlayerMasteryMapProfile as ContractPlayerMasteryMapProfile,
  PlayerSubmissionDetail,
  PlayerVerifiedRun as ContractPlayerVerifiedRun,
} from "@owbastion/contracts";
import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { recordPortalError, type PortalErrorData } from "~/utils/portal-error";

export type VerifiedRunSubmissionOutcome = NonNullable<PlayerSubmissionDetail["verifiedRunOutcome"]>;

export type PlayerVerifiedRun = ContractPlayerVerifiedRun;

export type PlayerMasteryMapProfile = ContractPlayerMasteryMapProfile;

export type PortalMap = Pick<Map, "mapId" | "mapName" | "defaultGameplayRevisionId">;

export type PlayerChallengeProgress = ContractPlayerChallengeProgress;

export type PlayerChallengeProgressListResponse = ContractPlayerChallengeProgressListResponse;

export type CurrentPlayerMasteryResponse = ContractCurrentPlayerMasteryResponse;

export type PlayerActivityDay = ContractPlayerActivityDay;

export type PlayerActivityResponse = ContractPlayerActivityResponse;

export type CurrentPlayer = ContractCurrentPlayerResponse;

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
