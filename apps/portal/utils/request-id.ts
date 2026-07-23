export const REQUEST_ID_HEADER = "x-request-id";

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const normalizeRequestId = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized && requestIdPattern.test(normalized) ? normalized : undefined;
};

export const createRequestId = () => crypto.randomUUID();

export const ensureRequestId = (value?: string | null) => normalizeRequestId(value) ?? createRequestId();
