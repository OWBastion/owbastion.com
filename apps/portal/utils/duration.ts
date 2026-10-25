const clockPattern = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/u;
const unitPattern = /^(?:(\d+)\s*小时)?\s*(?:(\d+)\s*分钟?)?\s*(?:(\d+)\s*秒)?$/u;

/** Seconds from "1小时2分3秒", "2分3秒", "1:02:03", "2:03" or plain "123"; null when unreadable. */
export const parseDurationSeconds = (input: string): number | null => {
  const text = input.trim();
  if (/^\d+$/u.test(text)) return Number(text);
  const clock = clockPattern.exec(text);
  if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  const units = text ? unitPattern.exec(text) : null;
  if (!units || (units[1] === undefined && units[2] === undefined && units[3] === undefined)) return null;
  return Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0);
};

/** "X小时X分X秒" as the screenshot shows it; leading zero units are dropped. */
export const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return `${hours ? `${hours}小时` : ""}${hours || minutes ? `${minutes}分` : ""}${rest}秒`;
};
