export type ParsedBattleTag = { playerName: string; playerId: string };

export const parseBattleTag = (value: string): ParsedBattleTag | null => {
  const match = value.trim().match(/^(.+)#(\d{1,10})$/);
  const playerName = match?.[1]?.trim();
  const playerId = match?.[2];
  if (!playerName || !playerId || playerName.length > 64) return null;
  return { playerName, playerId };
};

export const qqVerificationCommand = (code: string) => `/验证 ${code}`;

export const bindingInviteCopyText = (code: string, origin: string) => {
  const link = new URL("/bind", origin);
  link.searchParams.set("code", code);
  return `【躲避堡垒 3 · QQ 绑定】\n\n绑定链接：${link.toString()}\n\n打开链接后按提示完成 QQ 验证。邀请码 7 天有效，请勿转发。`;
};
