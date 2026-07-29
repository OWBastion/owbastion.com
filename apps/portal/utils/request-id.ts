export const REQUEST_ID_HEADER = "x-request-id";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const normalizeRequestId = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized && requestIdPattern.test(normalized) ? normalized : undefined;
};

export const createRequestId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const b6 = bytes[6];
    const b8 = bytes[8];
    if (b6 !== undefined && b8 !== undefined) {
      bytes[6] = (b6 & 0x0f) | 0x40;
      bytes[8] = (b8 & 0x3f) | 0x80;
    }
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const ensureRequestId = (value?: string | null) => normalizeRequestId(value) ?? createRequestId();

