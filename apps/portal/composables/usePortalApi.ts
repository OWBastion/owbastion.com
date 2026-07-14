export type SubmissionStatus = "received" | "evidence_pending" | "evidence_stored" | "ocr_pending" | "resubmission_required";

export type CurrentPlayer = {
  contractVersion: "1";
  player: { playerId: string; playerName: string; bindingStatus: "bound" };
  recentSubmissions: Array<{ submissionId: string; status: SubmissionStatus; mapName: string; createdAt: number; updatedAt: number }>;
};

export type PortalApiError = Error & { statusCode?: number; data?: { error?: { code?: string; message?: string } } };

export function usePortalApi() {
  const config = useRuntimeConfig();
  const baseUrl = config.public.apiBaseUrl.replace(/\/$/, "");

  return async <T>(path: string, options: Parameters<typeof $fetch<T>>[1] = {}) =>
    await $fetch<T>(`${baseUrl}${path}`, { ...options, credentials: "include", retry: 0, timeout: 8_000 });
}
