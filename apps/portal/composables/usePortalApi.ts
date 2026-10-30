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
  PlayerSubmissionListResponse as ContractPlayerSubmissionListResponse,
  PlayerVerifiedRun as ContractPlayerVerifiedRun,
} from "@owbastion/contracts";
import { createApiClient, type ApiFetcher } from "~/utils/api-client";
import type { PortalErrorData } from "~/utils/portal-error";

export type VerifiedRunSubmissionOutcome = NonNullable<PlayerSubmissionDetail["verifiedRunOutcome"]>;

export type PlayerSubmissionListResponse = ContractPlayerSubmissionListResponse;

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

export function usePortalApi() {
  const requestFetch: ApiFetcher = import.meta.server
    ? <T>(request: string, options?: Parameters<ApiFetcher>[1]) => (useRequestFetch() as (request: string, options?: never) => Promise<T>)(request, options as never)
    : $fetch as ApiFetcher;
  return createApiClient("/api/portal", requestFetch);
}
