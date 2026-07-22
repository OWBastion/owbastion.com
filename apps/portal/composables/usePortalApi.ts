export type SubmissionStatus = "received" | "evidence_pending" | "evidence_stored" | "upload_pending" | "ocr_pending" | "ready_for_review" | "ocr_review_required" | "approved" | "rejected" | "resubmission_required";

export type CurrentPlayer = {
  contractVersion: "1";
  player: { playerId: string; playerName: string; bindingStatus: "bound"; isAdmin: boolean };
  recentSubmissions: Array<{ submissionId: string; status: SubmissionStatus; mapName: string; challengeId?: string; difficulty?: string; reason?: string; createdAt: number; updatedAt: number }>;
};

export type PortalApiError = Error & { statusCode?: number; data?: { error?: { code?: string; message?: string } } };

export function usePortalApi() {
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch;

  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) =>
    await requestFetch<T>(`/api/portal${path}`, { ...options, credentials: "include", retry: 0, timeout: 8_000 });
}
