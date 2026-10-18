// Shared by public challenge reads and the admin title summary.
export const publicTitleChallengeStatus = (status: string, startsAt: number | null, endsAt: number | null, timestamp: number, gameVersion: string | null | undefined = "known", retiredVersion?: string | null) => {
  if (!gameVersion?.trim() || status !== "active") return null;
  if (endsAt !== null && timestamp >= endsAt) return null;
  if (startsAt !== null && timestamp < startsAt) return "scheduled";
  return retiredVersion ? "sunsetting" : "active";
};
export const deriveTitleAvailability = (paths: Array<{ status: string; startsAt: number | null; endsAt: number | null; retiredVersion: string | null; gameVersion?: string | null }>, timestamp: number): "active" | "sunsetting" | "scheduled" | "ended" => {
  const statuses = paths.map(path => publicTitleChallengeStatus(path.status, path.startsAt, path.endsAt, timestamp, path.gameVersion, path.retiredVersion));
  return statuses.includes("active") ? "active" : statuses.includes("sunsetting") ? "sunsetting" : statuses.includes("scheduled") ? "scheduled" : "ended";
};
