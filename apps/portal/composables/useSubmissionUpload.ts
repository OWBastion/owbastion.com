import type { PortalApiError } from "./usePortalApi";
import { createRequestId, REQUEST_ID_HEADER } from "~/utils/request-id";
import { portalErrorDetails, recordPortalError } from "~/utils/portal-error";

export type Map = { mapId: string; mapName: string; gameVersion: string; difficultyRating: "T0" | "T1" | "T2" | "T3" | "T4" | "T5" | null; mechanics: string[]; coverUrl: string | null; backgroundUrl: string | null };
export type ChallengeStatus = "active" | "sunsetting";
export type MapChallenge = { challengeId: string; family: "map"; gameplayRevisionId: string; type: "map_completion"; kind: "difficulty_completion" | "pioneer" | "classic_completion" | "map_title_achievement"; name: string; mapId: string; mapName: string; titleKey?: string; mapVariant?: "classic"; difficulty?: string; gameVersion: string; status: ChallengeStatus; retiredVersion?: string };
export type AchievementChallenge = { challengeId: string; family: "achievement"; type: "title_achievement"; kind: "title_achievement"; titleKey: string; titleName: string; category: string; condition: string; evidenceRule: string; gameVersion: string; status: "scheduled" | ChallengeStatus; startsAt?: number; endsAt?: number; retiredVersion?: string; submissionMode: "manual" | "automatic"; scope?: "global" | "map"; mapIds?: string[]; mapVariant?: "classic" };
export type Challenge = MapChallenge | AchievementChallenge;

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
const phaseLabels = { hash: "读取截图", session: "开始上传", upload: "上传截图", complete: "完成上传" } as const;

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
  // Keeps a started upload session so a retry resumes at the failed step instead of creating a second submission.
  let pending: { key: string; uploadId: string; expiresAt: number; uploaded: boolean } | null = null;
  const errorCode = (cause: unknown) => (cause as PortalApiError).data?.error?.code;
  const isTransient = (cause: unknown) => {
    const status = (cause as PortalApiError).statusCode;
    return status === undefined || status === 408 || status >= 500;
  };
  const sendEvidence = async (uploadId: string, file: File) => {
    const requestId = createRequestId();
    try {
      await $fetch(`/api/portal/uploads/${encodeURIComponent(uploadId)}`, { method: "PUT", body: file, headers: { "content-type": file.type, [REQUEST_ID_HEADER]: requestId }, credentials: "include", retry: 0, timeout: 30_000 });
    } catch (cause) {
      Object.assign(cause as object, { requestId });
      throw cause;
    }
  };
  const uploadEvidence = async (uploadId: string, file: File) => {
    try { await sendEvidence(uploadId, file); }
    catch (cause) {
      if (!isTransient(cause)) throw cause;
      // The first attempt may have landed with its response lost; the server then reports the session as no longer pending.
      try { await sendEvidence(uploadId, file); }
      catch (retryCause) { if (errorCode(retryCause) !== "UPLOAD_SESSION_INVALID") throw retryCause; }
    }
  };
  const submit = async (file: File, challengeId?: string, mapId?: string, gameplayRevisionId?: string) => {
    loading.value = true;
    error.value = "";
    let phase: keyof typeof phaseLabels = "hash";
    try {
      const sha256 = hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()));
      const key = [sha256, file.type, challengeId, mapId, gameplayRevisionId].join("|");
      if (pending && (pending.key !== key || pending.expiresAt - Date.now() < 30_000)) pending = null;
      if (!pending) {
        phase = "session";
        const session = await api<{ uploadId: string; expiresAt: number }>("/v1/player/uploads/session", { method: "POST", body: { contractVersion: "1", ...(challengeId ? { challengeId } : {}), ...(mapId ? { mapId } : {}), ...(gameplayRevisionId ? { gameplayRevisionId } : {}), contentType: file.type, byteSize: file.size, sha256 } });
        pending = { key, uploadId: session.uploadId, expiresAt: session.expiresAt, uploaded: false };
      }
      if (!pending.uploaded) {
        phase = "upload";
        await uploadEvidence(pending.uploadId, file);
        pending.uploaded = true;
      }
      phase = "complete";
      const result = await api<{ submissionId: string; status: string }>(`/v1/player/uploads/${pending.uploadId}/complete`, { method: "POST", body: { contractVersion: "1", uploadId: pending.uploadId } });
      pending = null;
      return result;
    } catch (cause) {
      const apiError = cause as PortalApiError;
      const code = errorCode(cause) ?? (apiError.statusCode ? `HTTP_${apiError.statusCode}` : "NETWORK_ERROR");
      const details = portalErrorDetails(cause, `${phaseLabels[phase]}失败，请稍后重试。`);
      // A retry resumes only while the session is still usable; a client error means the session was rejected.
      if (apiError.statusCode !== undefined && apiError.statusCode < 500 && apiError.statusCode !== 408) pending = null;
      const hint = pending ? (pending.uploaded ? "截图已上传，再次点击将直接完成提交，不会重复上传。" : "请直接再次点击上传，无需重新选择截图。") : "";
      error.value = [`${details.description}${details.code ? ` 错误码：${details.code}` : code !== "NETWORK_ERROR" ? ` 错误码：${code}` : ""}`, hint].filter(Boolean).join(" ");
      if (phase === "upload") recordPortalError(cause, { operation: "submission-upload", phase, requestId: details.requestId });
      throw cause;
    } finally { loading.value = false; }
  };

  return { maps, mapChallenges, achievementChallenges, loading, catalogLoading, error, loadCatalog, submit };
}
