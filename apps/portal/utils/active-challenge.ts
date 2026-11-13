// Remaining time for a timed challenge: minutes under an hour, hours under a day, otherwise days.
export const remainingLabel = (endsAt: number, now: number) => {
  const minutes = Math.max(1, Math.ceil((endsAt - now) / 60_000));
  if (minutes < 60) return `剩 ${minutes} 分钟`;
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? `剩 ${hours} 小时` : `剩 ${Math.ceil(hours / 24)} 天`;
};
