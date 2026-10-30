import { playerInvitationUnlimited } from "@owbastion/contracts/player-invitation";
import type { PlayerInvitation, PlayerInvitationClaimRejectionReason, PlayerInvitationStateResponse } from "@owbastion/contracts/player-invitation";

const errorMessages: Record<string, string> = {
  PLAYER_INVITATION_CODE_INVALID: "邀请码需为 4–20 位字母、数字或中间的连字符。",
  PLAYER_INVITATION_CODE_RESERVED: "这个邀请码含有保留词，请换一个。",
  PLAYER_INVITATION_CODE_TAKEN: "这个邀请码已被占用。",
  PLAYER_INVITATION_DISABLED: "邀请功能暂未开放。",
  PLAYER_INVITATION_NOT_ELIGIBLE: "你暂未满足邀请条件。",
  PLAYER_INVITATION_LIMIT_EXCEEDED: "次数或有效期超出当前上限。",
  PLAYER_INVITATION_QUOTA_EXHAUSTED: "本周期的邀请名额已用完。",
  PLAYER_INVITATION_NOT_FOUND: "邀请码不存在。",
  PLAYER_INVITATION_ACCOUNT_EXISTS: "这个 BattleTag 已注册，请直接登录。",
  PLAYER_INVITATION_LEGACY_CANDIDATE: "这个 BattleTag 需要维护者协助，请联系维护者。",
};

export const playerInvitationErrorMessage = (code: string | undefined) => (code ? errorMessages[code] : undefined);

const rejectionMessages: Record<PlayerInvitationClaimRejectionReason, string> = {
  account_exists: "这个 BattleTag 已注册，请直接登录。",
  legacy_candidate: "这个 BattleTag 需要维护者协助，请联系维护者。",
  qq_conflict: "这个 QQ 已绑定其他帐号。",
  invitation_unavailable: "邀请码已失效。",
  inviter_quota_exhausted: "邀请人的名额已用完。",
  code_exhausted: "邀请码的使用次数已用完。",
};

export const playerInvitationRejectionMessage = (reason: PlayerInvitationClaimRejectionReason | undefined) => (reason ? rejectionMessages[reason] : undefined);

export const playerInvitationStatusLabel = (status: PlayerInvitation["status"]) => ({ available: "可用", exhausted: "已用完", expired: "已过期", revoked: "已撤销", inviter_blocked: "已停用" })[status];

export const playerInvitationLimitLabel = (value: number, unit = "") => value >= playerInvitationUnlimited ? "不限" : `${value}${unit ? ` ${unit}` : ""}`;

export const playerInvitationPeriodLabel = (period: "day" | "week" | "month") => ({ day: "今日", week: "本周", month: "本月" })[period];

export const playerInvitationBlockedMessage = (state: Pick<PlayerInvitationStateResponse, "createBlockedReason" | "eligibility">) => {
  if (state.createBlockedReason === "disabled") return "邀请功能暂未开放。";
  if (state.createBlockedReason === "quota_exhausted") return "本周期的邀请名额已用完。";
  const eligibility = state.eligibility;
  if (state.createBlockedReason !== "ineligible" || !eligibility) return undefined;
  const age = `帐号注册满 ${eligibility.minAccountAgeDays} 天（现 ${eligibility.accountAgeDays} 天）`;
  const submissions = `通过 ${eligibility.minApprovedSubmissions} 次提交（现 ${eligibility.approvedSubmissions} 次）`;
  const needs = [eligibility.minAccountAgeDays ? age : "", eligibility.minApprovedSubmissions ? submissions : ""].filter(Boolean);
  return `需${needs.join(eligibility.mode === "all" ? "且" : "或")}。`;
};

export const playerInvitationShareUrl = (siteUrl: string, code: string) => `${siteUrl}/bind?player-code=${encodeURIComponent(code)}`;
