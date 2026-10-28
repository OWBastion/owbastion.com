export type PlayerInvitationPeriod = "day" | "week" | "month";

export const playerInvitationCodeMinLength = 4;
export const playerInvitationCodeMaxLength = 20;
const reservedPrefixes = ["ADMIN", "BASTION", "OWB", "OFFICIAL", "STAFF", "SYSTEM"] as const;
const codePattern = /^[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?$/;

export type PlayerInvitationCodeRejection = "PLAYER_INVITATION_CODE_INVALID" | "PLAYER_INVITATION_CODE_RESERVED";

export const normalizePlayerInvitationCode = (value: string) => value.trim().toUpperCase();

export const validatePlayerInvitationCode = (value: string): { code: string } | { error: PlayerInvitationCodeRejection } => {
  const code = normalizePlayerInvitationCode(value);
  if (code.length < playerInvitationCodeMinLength || code.length > playerInvitationCodeMaxLength || !codePattern.test(code)) return { error: "PLAYER_INVITATION_CODE_INVALID" };
  if (reservedPrefixes.some((prefix) => code.startsWith(prefix))) return { error: "PLAYER_INVITATION_CODE_RESERVED" };
  return { code };
};

// Periods follow the fixed UTC+8 calendar: a day starts at 00:00, a week on
// Monday 00:00, a month on the 1st at 00:00. The offset has no daylight saving.
const utcPlus8Ms = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export const playerInvitationPeriodRange = (period: PlayerInvitationPeriod, timestamp: number): { start: number; end: number } => {
  const local = new Date(timestamp + utcPlus8Ms);
  const dayStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const toUtc = (localMs: number) => localMs - utcPlus8Ms;
  if (period === "day") return { start: toUtc(dayStart), end: toUtc(dayStart + dayMs) };
  if (period === "week") {
    const sinceMonday = (local.getUTCDay() + 6) % 7;
    const weekStart = dayStart - sinceMonday * dayMs;
    return { start: toUtc(weekStart), end: toUtc(weekStart + 7 * dayMs) };
  }
  return { start: toUtc(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)), end: toUtc(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1)) };
};
