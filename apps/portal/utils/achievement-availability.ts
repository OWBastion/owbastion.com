export type AchievementAvailability = "scheduled" | "sunsetting" | "ended";

export const availabilityLabel: Record<AchievementAvailability, string> = { scheduled: "未开放", sunsetting: "即将结束", ended: "不再发放" };
export const availabilityIcon: Record<AchievementAvailability, string> = { scheduled: "i-lucide-clock", sunsetting: "i-lucide-hourglass", ended: "i-lucide-archive" };

// Open titles carry no marker; every other status maps to one.
export const availabilityOf = (status: string): AchievementAvailability | undefined =>
  status === "scheduled" || status === "sunsetting" || status === "ended" ? status : undefined;

export const availabilityNote = (availability: AchievementAvailability, retiredVersion?: string | null) =>
  availability === "sunsetting" && retiredVersion ? `${availabilityLabel[availability]} · ${retiredVersion}` : availabilityLabel[availability];
