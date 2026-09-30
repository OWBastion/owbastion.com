import type {
  CurrentPlayerResponse as ContractCurrentPlayerResponse,
  CurrentPlayerMasteryResponse as ContractCurrentPlayerMasteryResponse,
  Map,
  PlayerMasteryMapProfile as ContractPlayerMasteryMapProfile,
  PlayerSubmissionDetail,
  PlayerVerifiedRun as ContractPlayerVerifiedRun,
} from "@owbastion/contracts";
import { createApiClient } from "~/utils/api-client";
import type { PortalErrorData } from "~/utils/portal-error";

export type VerifiedRunSubmissionOutcome = NonNullable<PlayerSubmissionDetail["verifiedRunOutcome"]>;

export type PlayerVerifiedRun = ContractPlayerVerifiedRun;

export type PlayerMasteryMapProfile = ContractPlayerMasteryMapProfile;

export type PortalMap = Pick<Map, "mapId" | "mapName" | "defaultGameplayRevisionId">;

export type CurrentPlayerMasteryResponse = ContractCurrentPlayerMasteryResponse;

export type CurrentPlayer = ContractCurrentPlayerResponse;

export type PortalApiError = Error & { statusCode?: number; requestId?: string; data?: { error?: PortalErrorData }; response?: { status?: number; headers?: Headers; _data?: unknown } };

export function usePortalApi() {
  return createApiClient("/api/portal", import.meta.server ? useRequestFetch() : $fetch);
}
