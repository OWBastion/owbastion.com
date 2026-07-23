import type { PortalApiError } from "./usePortalApi";
import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { portalErrorDetails, recordPortalError } from "~/utils/portal-error";

export type Map = { mapId: string; mapName: string; gameVersion: string; difficultyRating: "T0" | "T1" | "T2" | "T3" | "T4" | "T5" | null; mechanics: string[]; coverUrl: string | null; backgroundUrl: string | null };
export type ChallengeStatus = "active" | "sunsetting";
export type MapChallenge = { challengeId: string; family: "map"; type: "map_completion"; kind: "difficulty_completion" | "pioneer" | "classic_completion"; name: string; mapId: string; mapName: string; difficulty?: string; gameVersion: string; status: ChallengeStatus; retiredVersion?: string };
export type AchievementChallenge = { challengeId: string; family: "achievement"; type: "title_achievement"; kind: "title_achievement"; titleKey: string; titleName: string; category: string; condition: string; evidenceRule: string; gameVersion: string; status: "scheduled" | ChallengeStatus; startsAt?: number; endsAt?: number; retiredVersion?: string; submissionMode: "manual" | "automatic" };
export type Challenge = MapChallenge | AchievementChallenge;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const phaseLabels = { hash: "读取截图", session: "创建上传会话", upload: "上传截图", complete: "提交截图" } as const;

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
    const failed = [mapResult, mapChallengeResult, achievementChallengeResult].find((result) => result.status === "rejected");
    if (failed?.status === "rejected") error.value = portalErrorDetails(failed.reason, "挑战目录无法读取，请稍后重试。").description;
    catalogLoading.value = false;
  };
  const submit = async (challengeId: string, file: File) => {
    loading.value = true;
    error.value = "";
    let phase: keyof typeof phaseLabels = "hash";
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      phase = "session";
      const session = await api<{ uploadId: string; uploadUrl: string; submissionId: string }>("/v1/player/uploads/session", { method: "POST", body: { contractVersion: "1", challengeId, contentType: file.type, byteSize: file.size, sha256: hex(digest) } });
      phase = "upload";
      const uploadRequestId = createRequestId();
      try {
        await $fetch(`/api/portal/uploads/${encodeURIComponent(session.uploadId)}`, { method: "PUT", body: file, headers: { "content-type": file.type, [REQUEST_ID_HEADER]: uploadRequestId }, credentials: "include", retry: 0, timeout: 30_000 });
      } catch (cause) {
        Object.assign(cause as object, { requestId: uploadRequestId });
        throw cause;
      }
      phase = "complete";
      return await api<{ submissionId: string; status: string }>(`/v1/player/uploads/${session.uploadId}/complete`, { method: "POST", body: { contractVersion: "1", uploadId: session.uploadId } });
    } catch (cause) {
      const apiError = cause as PortalApiError;
      const apiDetails = apiError.data?.error;
      const code = apiDetails?.code ?? (apiError.statusCode ? `HTTP_${apiError.statusCode}` : "NETWORK_ERROR");
      const details = portalErrorDetails(cause, `${phaseLabels[phase]}失败，请稍后重试。`);
      error.value = `${details.description}${details.code ? ` 错误码：${details.code}` : code !== "NETWORK_ERROR" ? ` 错误码：${code}` : ""}`;
      if (phase === "upload") recordPortalError(cause, { operation: "submission-upload", phase, requestId: details.requestId });
      throw cause;
    } finally { loading.value = false; }
  };

  return { maps, mapChallenges, achievementChallenges, loading, catalogLoading, error, loadCatalog, submit };
}
