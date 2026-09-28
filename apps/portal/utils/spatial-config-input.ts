export const spatialNumberInput = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined || (typeof value !== "string" && typeof value !== "number")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const spatialTextInput = (value: unknown): string => value === null || value === undefined ? "" : String(value);
