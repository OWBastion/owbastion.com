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
  recentSubmissions: Array<{ submissionId: string; status: string; mapName: string; createdAt: number; updatedAt: number }>;
};

export type AdminGroup = { groupOpenId: string; displayName: string; environment: "production" | "test"; status: "pending" | "active" | "legacy" | "disconnected"; bindEnabled: boolean; verifyEnabled: boolean; updatedAt: number };
export type AdminSubmission = { submissionId: string; status: string; challengeId: string; challenge: { family: "map"; name: string; mapName: string; difficulty: string | null } | { family: "achievement"; titleName: string; category: string; condition: string; evidenceRule: string } | null; mapName: string; difficulty: string; playerName: string; createdAt: number; updatedAt: number; ocrStatus: "not_started" | "pending" | "matched" | "mismatch" | "review_required" | "error"; ocrAttempt: number | null; ocrErrorCode: string | null; ocr: Record<string, unknown> | null; evidenceUrl: string | null };

export function useAdminApi() {
  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) => {
    const requestId = createRequestId();
    const headers = new Headers(options?.headers as HeadersInit | undefined);
    if (!headers.has(REQUEST_ID_HEADER)) headers.set(REQUEST_ID_HEADER, requestId);
    try {
      return await $fetch<T>(`/api/admin${path}`, { ...options, headers, credentials: "include", retry: 0, timeout: 8_000 });
    } catch (error) {
      Object.assign(error as object, { requestId });
      recordPortalError(error, { operation: path, requestId });
      throw error;
    }
  };
}
