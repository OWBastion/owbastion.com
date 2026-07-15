import type { PortalApiError } from "./usePortalApi";

export type Map = { mapId: string; mapName: string; gameVersion: string };
export type Challenge = { challengeId: string; type: "map_completion"; kind: "difficulty_completion" | "pioneer" | "classic_completion"; name: string; mapId: string; mapName: string; difficulty?: string; gameVersion: string };

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

export function useSubmissionUpload() {
  const api = usePortalApi();
  const maps = ref<Map[]>([]);
  const challenges = ref<Challenge[]>([]);
  const loading = ref(false);
  const catalogLoading = ref(false);
  const error = ref("");

  const loadCatalog = async () => {
    catalogLoading.value = true;
    error.value = "";
    try {
      const [mapResponse, challengeResponse] = await Promise.all([
        api<{ items: Map[] }>("/v1/maps"),
        api<{ items: Challenge[] }>("/v1/challenges"),
      ]);
      maps.value = mapResponse.items;
      challenges.value = challengeResponse.items;
    } catch (cause) {
      const apiError = cause as PortalApiError;
      error.value = apiError.data?.error?.message ?? "暂时无法读取可提交内容，请稍后重试。";
    } finally {
      catalogLoading.value = false;
    }
  };
  const submit = async (challengeId: string, file: File) => {
    loading.value = true;
    error.value = "";
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const session = await api<{ uploadId: string; uploadUrl: string; submissionId: string }>("/v1/player/uploads/session", { method: "POST", body: { contractVersion: "1", challengeId, contentType: file.type, byteSize: file.size, sha256: hex(digest) } });
      await $fetch(session.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type }, credentials: "include", retry: 0, timeout: 30_000 });
      return await api<{ submissionId: string; status: string }>(`/v1/player/uploads/${session.uploadId}/complete`, { method: "POST", body: { contractVersion: "1", uploadId: session.uploadId } });
    } catch (cause) {
      const apiError = cause as PortalApiError;
      error.value = apiError.data?.error?.message ?? "截图提交失败，请稍后重试。";
      throw cause;
    } finally { loading.value = false; }
  };

  return { maps, challenges, loading, catalogLoading, error, loadCatalog, submit };
}
