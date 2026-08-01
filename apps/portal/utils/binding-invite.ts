export const bindingInviteCopyText = (code: string, origin: string) => {
  const link = new URL("/bind", origin);
  link.searchParams.set("code", code);
  return `【躲避堡垒 3 · QQ 绑定】\n\n绑定链接：${link.toString()}\n\n打开链接后按提示完成 QQ 验证。邀请码 7 天有效，请勿转发。`;
};
