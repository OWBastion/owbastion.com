type InviteState = "idle" | "submitting" | "waiting" | "failed";

export function useBindingInvite() {
  const api = usePortalApi();
  const state = ref<InviteState>("idle");
  const code = ref("");
  const playerName = ref("");
  const playerId = ref("");
  const confirmationCode = ref("");
  const errorMessage = ref("");

  async function submit() {
    state.value = "submitting"; errorMessage.value = "";
    try {
      const response = await api<{ code: string }>("/v1/public/binding-invites/redeem", { method: "POST", body: { contractVersion: "1", code: code.value.trim().toUpperCase(), playerName: playerName.value.trim(), playerId: playerId.value.trim() } });
      confirmationCode.value = response.code; state.value = "waiting";
    } catch (error: any) { errorMessage.value = error?.data?.error?.code === "INVITE_INVALID" ? "邀请码不可用。" : "无法提交绑定申请，请稍后重试。"; state.value = "failed"; }
  }
  return { state, code, playerName, playerId, confirmationCode, errorMessage, submit };
}
