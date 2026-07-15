import type { PortalApiError } from "./usePortalApi";

export type Map = { mapId: string; mapName: string; gameVersion: string };
export type MapChallenge = { challengeId: string; family: "map"; type: "map_completion"; kind: "difficulty_completion" | "pioneer" | "classic_completion"; name: string; mapId: string; mapName: string; difficulty?: string; gameVersion: string };
export type AchievementChallenge = { challengeId: string; family: "achievement"; type: "title_achievement"; kind: "title_achievement"; titleKey: string; titleName: string; category: string; condition: string; evidenceRule: string; gameVersion: string; status: "active" };
export type Challenge = MapChallenge | AchievementChallenge;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

export function useSubmissionUpload() {
  const api = usePortalApi();
  const maps = ref<Map[]>([]);
  const mapChallenges = ref<MapChallenge[]>([]);
  const achievementChallenges = ref<AchievementChallenge[]>([]);
  const loading = ref(false);
  const catalogLoading = ref(false);
  const error = ref("");

  const loadCatalog = async () => {
    catalogLoading.value = true;
    error.value = "";
    const [mapResult, mapChallengeResult, achievementChallengeResult] = await Promise.allSettled([
      api<{ items: Map[] }>("/v1/maps"),
      api<{ items: MapChallenge[] }>("/v1/challenges?family=map"),
      api<{ items: AchievementChallenge[] }>("/v1/challenges?family=achievement"),
    ]);
    if (mapResult.status === "fulfilled") maps.value = mapResult.value.items;
    if (mapChallengeResult.status === "fulfilled") mapChallenges.value = mapChallengeResult.value.items;
    if (achievementChallengeResult.status === "fulfilled") achievementChallenges.value = achievementChallengeResult.value.items;
    if ([mapResult, mapChallengeResult, achievementChallengeResult].some((result) => result.status === "rejected")) error.value = "部分可提交内容暂时无法读取，请稍后重试。";
    catalogLoading.value = false;
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

  return { maps, mapChallenges, achievementChallenges, loading, catalogLoading, error, loadCatalog, submit };
}
