type InviteState = "idle" | "submitting" | "waiting" | "failed";
type ClaimStatus = "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired";
type StoredClaim = { claimId: string; claimToken: string; code: string; expiresAt: number };

const storageKey = "owbastion-binding-claim";

export function useBindingInvite() {
  const api = usePortalApi();
  const state = ref<InviteState>("idle");
  const code = ref("");
  const playerName = ref("");
  const playerId = ref("");
  const confirmationCode = ref("");
  const claimStatus = ref<ClaimStatus>("pending_confirmation");
  const claim = ref<StoredClaim | null>(null);
  const errorMessage = ref("");
  const refreshing = ref(false);

  onMounted(() => {
    if (!import.meta.client) return;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredClaim;
      if (!saved.claimId || !saved.claimToken || !saved.code || saved.expiresAt <= Date.now()) throw new Error("expired");
      claim.value = saved;
      confirmationCode.value = saved.code;
      state.value = "waiting";
    } catch { sessionStorage.removeItem(storageKey); }
  });

  const refreshStatus = async () => {
    if (!claim.value || refreshing.value) return;
    refreshing.value = true; errorMessage.value = "";
    try {
      const result = await api<{ status: ClaimStatus; expiresAt: number }>(`/v1/public/binding-claims/${claim.value.claimId}`, { headers: { "x-claim-token": claim.value.claimToken } });
      claimStatus.value = result.status;
      claim.value.expiresAt = result.expiresAt;
      if (import.meta.client) sessionStorage.setItem(storageKey, JSON.stringify(claim.value));
    } catch (error) { errorMessage.value = portalErrorDetails(error, "无法读取绑定状态，请稍后重试。").description; }
    finally { refreshing.value = false; }
  };

  async function submit() {
    state.value = "submitting"; errorMessage.value = "";
    try {
      const response = await api<{ code: string; claimId: string; claimToken: string; expiresAt: number }>("/v1/public/binding-invites/redeem", { method: "POST", body: { contractVersion: "1", code: code.value.trim().toUpperCase(), playerName: playerName.value.trim(), playerId: playerId.value.trim() } });
      confirmationCode.value = response.code; claimStatus.value = "pending_confirmation"; claim.value = { claimId: response.claimId, claimToken: response.claimToken, code: response.code, expiresAt: response.expiresAt }; state.value = "waiting";
      if (import.meta.client) sessionStorage.setItem(storageKey, JSON.stringify(claim.value));
    } catch (error) { const details = portalErrorDetails(error, "无法提交绑定申请，请稍后重试。"); errorMessage.value = details.code === "INVITE_INVALID" ? `邀请码不可用。${details.requestId ? ` 请求编号：${details.requestId}` : ""}` : details.description; state.value = "failed"; }
  }
  return { state, code, playerName, playerId, confirmationCode, claimStatus, errorMessage, refreshing, refreshStatus, submit };
}
import { portalErrorDetails } from "~/utils/portal-error";
