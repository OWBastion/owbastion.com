export const gameplayRevisionLifecycles = ["preparing", "default", "selectable", "historical"] as const;

export type GameplayRevisionLifecycle = (typeof gameplayRevisionLifecycles)[number];
export type GameplayRevisionLegacyVariant = "classic" | null;

export const isGameplayRevisionBastionEnabled = (lifecycle: GameplayRevisionLifecycle) =>
  lifecycle === "default" || lifecycle === "selectable";

export const isGameplayRevisionDefault = (lifecycle: GameplayRevisionLifecycle) =>
  lifecycle === "default";

// A standalone game mode such as 2026镜中回响 is played on its own selectable Gameplay
// Revisions. Labels compare without whitespace, which the HUD and OCR disagree about.
export const normalizeGameMode = (value: string | null | undefined) => value?.replace(/\s+/gu, "") || null;

const editDistance = (left: string, right: string) => {
  const a = [...left];
  const b = [...right];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length]!;
};

export const regularGameModeLabel = "随机事件";

// OCR reads the HUD's mode label with the odd wrong character (镜中 as 镜申, 2026 as 202S, 随机事件 as
// 随机票件). A label that is one near-miss away from exactly one known mode, or from the regular label
// (which carries a trailing version such as 5.0), is that mode; anything else stays as read.
// A different four-digit year is a different mode, never a misread.
export const matchGameMode = (read: string | null | undefined, knownModes: readonly string[]): { mode: string | null; approximate: boolean } => {
  const label = normalizeGameMode(read);
  if (!label || label.includes(regularGameModeLabel) || knownModes.some((mode) => normalizeGameMode(mode) === label)) return { mode: label, approximate: false };
  const regularSuffix = /[\d.]+$/u.exec(label)?.[0] ?? "";
  const candidates: Array<{ mode: string; distance: number }> = [];
  const consider = (target: string, text: string, canonical: string) => {
    const allowed = Math.max(1, Math.floor([...target].length / 4));
    const readYear = /^\d{4}/u.exec(text)?.[0];
    const targetYear = /^\d{4}/u.exec(target)?.[0];
    if (readYear && targetYear && readYear !== targetYear) return;
    const distance = editDistance(text, target);
    if (distance <= allowed) candidates.push({ mode: canonical, distance });
  };
  for (const mode of knownModes) {
    const target = normalizeGameMode(mode);
    if (target) consider(target, label, target);
  }
  if (regularSuffix) consider(regularGameModeLabel, label.slice(0, -regularSuffix.length), `${regularGameModeLabel}${regularSuffix}`);
  const best = Math.min(...candidates.map((candidate) => candidate.distance));
  const closest = candidates.filter((candidate) => candidate.distance === best);
  return closest.length === 1 ? { mode: closest[0]!.mode, approximate: true } : { mode: label, approximate: false };
};

export const initialGameplayRevisionId = (mapId: string) => `revision:${mapId}:initial`;

// Legacy compatibility remains represented by legacyMapVariant. The revision
// identity itself uses a reserved machine sequence rather than that label.
export const legacyGameplayRevisionId = (mapId: string) => ["revision", mapId, "v0"].join(":");
