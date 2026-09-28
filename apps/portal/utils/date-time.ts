export const formatTime = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(value);
export const formatDate = (value: number) => new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(value);
