import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { recordPortalError, type PortalErrorData } from "~/utils/portal-error";

export type SubmissionStatus = "received" | "evidence_pending" | "evidence_stored" | "upload_pending" | "ocr_pending" | "ready_for_review" | "ocr_review_required" | "approved" | "rejected" | "resubmission_required";

export type CurrentPlayer = {
  contractVersion: "1";
  player: { playerId: string; playerName: string; bindingStatus: "bound"; isAdmin: boolean };
  recentSubmissions: Array<{ submissionId: string; status: SubmissionStatus; mapName: string; challengeId?: string; difficulty?: string; reason?: string; createdAt: number; updatedAt: number }>;
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
