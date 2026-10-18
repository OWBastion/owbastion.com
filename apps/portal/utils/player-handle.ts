const handleErrorMessages: Record<string, string> = {
  HANDLE_TAKEN: "这个 ID 已被占用。",
  HANDLE_UNCHANGED: "这已经是你当前的 ID。",
  HANDLE_RESERVED: "这个 ID 含有保留词，请换一个。",
  HANDLE_INVALID_CHARACTERS: "ID 只能使用字母、数字和汉字。",
  HANDLE_INVALID_LENGTH: "ID 需为 2–9 个字符。",
  HANDLE_ALL_DIGITS: "ID 不能全为数字。",
  HANDLE_REQUEST_NOT_FOUND: "没有待审核的申请。",
};

export const playerHandleErrorMessage = (code: string | undefined) => (code ? handleErrorMessages[code] : undefined);

export const playerHandlePath = (handle: string) => `/u/${encodeURIComponent(handle)}`;
