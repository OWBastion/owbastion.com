import { portalErrorDetails } from "~/utils/portal-error";

type InviteState = "ready" | "submitting" | "waiting" | "review" | "completed" | "rejected" | "expired" | "failed";
type ClaimStatus = "pending_confirmation" | "pending_review" | "approved" | "rejected" | "expired";
type StoredClaim = { claimId: string; claimToken: string; code: string; playerName: string; playerId: string; expiresAt: number };
type InvitedPlayer = { playerName: string; playerId: string };

const storageKey = "owbastion-binding-claim";

export function useBindingInvite() {
  const api = usePortalApi();
  const state = ref<InviteState>("ready");
  const invite = ref<InvitedPlayer | null>(null);
  const confirmationCode = ref("");
  const claimStatus = ref<ClaimStatus>("pending_confirmation");
  const claim = ref<StoredClaim | null>(null);
  const errorMessage = ref("");
  const refreshing = ref(false);
  let pollTimer: ReturnType<typeof setTimeout> | undefined;

  const stopPolling = () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = undefined;
  };

  const clearClaim = () => {
    stopPolling();
    claim.value = null;
    invite.value = null;
    confirmationCode.value = "";
    if (import.meta.client) sessionStorage.removeItem(storageKey);
  };

  const persistClaim = () => {
    if (import.meta.client && claim.value) sessionStorage.setItem(storageKey, JSON.stringify(claim.value));
  };

  const establishSession = async () => {
    if (!claim.value) return;
    await api(`/v1/public/binding-claims/${claim.value.claimId}/session`, { method: "POST", headers: { "x-claim-token": claim.value.claimToken } });
    state.value = "completed";
    clearClaim();
    await navigateTo({ path: "/login/complete", query: { returnTo: "/me" } });
  };

  const pollStatus = async () => {
    if (!claim.value || ["completed", "rejected", "expired"].includes(state.value)) return;
    try {
      const result = await api<{ status: ClaimStatus; expiresAt: number }>(`/v1/public/binding-claims/${claim.value.claimId}`, { headers: { "x-claim-token": claim.value.claimToken } });
      claimStatus.value = result.status;
      claim.value.expiresAt = result.expiresAt;
      persistClaim();
      if (result.status === "approved") {
        await establishSession();
        return;
      }
      if (result.status === "pending_review") state.value = "review";
      else if (result.status === "pending_confirmation") state.value = "waiting";
      else if (result.status === "rejected") { state.value = "rejected"; stopPolling(); return; }
      else if (result.status === "expired") { state.value = "expired"; stopPolling(); return; }
      pollTimer = setTimeout(() => void pollStatus(), 2000);
    } catch (error) {
      errorMessage.value = portalErrorDetails(error, "无法读取绑定状态，请稍后重试。请保留此页面。").description;
      state.value = "failed";
      stopPolling();
    }
  };

  const refreshStatus = async () => {
    if (!claim.value || refreshing.value) return;
    refreshing.value = true;
    errorMessage.value = "";
    try { await pollStatus(); }
    finally { refreshing.value = false; }
  };

  const submit = async (inviteCode: string) => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      errorMessage.value = "请使用管理员发送的绑定链接。";
      state.value = "failed";
      return;
    }
    state.value = "submitting";
    errorMessage.value = "";
    try {
      const response = await api<{ code: string; claimId: string; claimToken: string; playerName: string; playerId: string; expiresAt: number }>("/v1/public/binding-invites/redeem", { method: "POST", body: { contractVersion: "1", code } });
      invite.value = { playerName: response.playerName, playerId: response.playerId };
      confirmationCode.value = response.code;
      claimStatus.value = "pending_confirmation";
      claim.value = { claimId: response.claimId, claimToken: response.claimToken, code: response.code, playerName: response.playerName, playerId: response.playerId, expiresAt: response.expiresAt };
      state.value = "waiting";
      persistClaim();
      void pollStatus();
    } catch (error) {
      const details = portalErrorDetails(error, "无法打开绑定邀请，请稍后重试。");
      errorMessage.value = details.code === "INVITE_INVALID" ? "绑定链接不可用，可能已过期、撤销或使用过。" : details.description;
      state.value = "failed";
    }
  };

  onMounted(() => {
    if (!import.meta.client) return;
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as StoredClaim;
      if (!saved.claimId || !saved.claimToken || !saved.code || !saved.playerName || saved.expiresAt <= Date.now()) throw new Error("expired");
      claim.value = saved;
      invite.value = { playerName: saved.playerName, playerId: saved.playerId };
      confirmationCode.value = saved.code;
      state.value = "waiting";
      void pollStatus();
    } catch { clearClaim(); state.value = "ready"; }
  });

  onBeforeUnmount(stopPolling);

  return { state, invite, confirmationCode, claimStatus, errorMessage, refreshing, refreshStatus, submit };
}
