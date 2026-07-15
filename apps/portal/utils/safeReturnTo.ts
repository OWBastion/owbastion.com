export const safeReturnTo = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/me";

export const hasSafeReturnTo = (value: unknown) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
