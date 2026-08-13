export function formatCurrentGameVersion(date = new Date()) {
  return date.toISOString().slice(0, 10).replaceAll("-", ".");
}
