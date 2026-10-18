export type ParsedBattleTag = { playerName: string; playerId: string };

export const parseBattleTag = (value: string): ParsedBattleTag | null => {
  const match = value.trim().match(/^(.+)#(\d{1,10})$/);
  const playerName = match?.[1]?.trim();
  const playerId = match?.[2];
  if (!playerName || !playerId || playerName.length > 64) return null;
  return { playerName, playerId };
};

export const bindingInviteBatchLimit = 100;

export const parseBattleTagBatch = (input: string): { players: ParsedBattleTag[]; errors: string[] } => {
  const players: ParsedBattleTag[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    const player = parseBattleTag(line);
    if (!player) { errors.push(`第 ${index + 1} 行格式无效`); return; }
    const key = `${player.playerName.toLocaleLowerCase()}#${player.playerId}`;
    if (seen.has(key)) { errors.push(`第 ${index + 1} 行重复`); return; }
    seen.add(key);
    players.push(player);
  });
  if (players.length > bindingInviteBatchLimit) errors.push(`一次最多生成 ${bindingInviteBatchLimit} 个邀请码`);
  return { players, errors };
};

export const qqVerificationCommand = (code: string) => `/验证 ${code}`;

export const bindingInviteCopyText = (code: string, origin: string) => {
  const link = new URL("/bind", origin);
  return `【躲避堡垒 3 · QQ 绑定邀请】\n\n绑定页面：${link.toString()}\n邀请码：${code}\n\n请打开绑定页面并手动输入邀请码，再按提示在 QQ 群完成验证。验证通过后会登录玩家账号；登录后可在个人设置添加 Passkey，用于以后登录。邀请码 7 天有效，请勿转发。`;
};
