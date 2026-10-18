// Player handle rules (#438). The handle is a public address, never an
// authentication identifier. Normalized form: NFKC, then ASCII lowercase; the
// normalized value is what uniqueness, lookup, and display use.

export const playerHandleMinLength = 2;
export const playerHandleMaxLength = 9;

// Reserved terms live in two lists. Route/system words are rejected only as the
// whole handle, so ordinary IDs that merely contain them (james, 堡垒王) stay
// available. Impersonation words are rejected anywhere inside the handle.
// Traditional/simplified variants are distinct IDs, so only the listed forms apply.
export const exactReservedPlayerHandleTerms = ["user", "root", "api", "me", "login", "settings", "null", "undefined", "堡垒"] as const;
export const containedReservedPlayerHandleTerms = [
  "admin", "system", "support", "official", "owbastion", "bastion",
  "管理员", "官方", "客服", "系统", "运营", "审核",
] as const;

export type PlayerHandleRejection = "HANDLE_INVALID_CHARACTERS" | "HANDLE_INVALID_LENGTH" | "HANDLE_ALL_DIGITS" | "HANDLE_RESERVED";

export const normalizePlayerHandle = (value: string) => value.trim().normalize("NFKC").replace(/[A-Z]/g, (letter) => letter.toLowerCase());

const allowedCharacters = /^[a-z0-9一-鿿]+$/;

export const validatePlayerHandle = (value: string): { handle: string } | { error: PlayerHandleRejection } => {
  const handle = normalizePlayerHandle(value);
  if (!allowedCharacters.test(handle)) return { error: "HANDLE_INVALID_CHARACTERS" };
  const length = [...handle].length;
  if (length < playerHandleMinLength || length > playerHandleMaxLength) return { error: "HANDLE_INVALID_LENGTH" };
  if (/^[0-9]+$/.test(handle)) return { error: "HANDLE_ALL_DIGITS" };
  if ((exactReservedPlayerHandleTerms as readonly string[]).includes(handle) || containedReservedPlayerHandleTerms.some((term) => handle.includes(term))) return { error: "HANDLE_RESERVED" };
  return { handle };
};
