import type { MasterySubmissionOutcome } from "~/composables/usePortalApi";

export type MasteryOutcomePresentation = { title: string; description: string; inline: string };

export const masteryOutcomePresentation = (outcome: MasterySubmissionOutcome | undefined): MasteryOutcomePresentation | null => {
  if (!outcome) return null;
  if (outcome.status === "created") {
    const xp = `${outcome.awardedXp} XP`;
    return { title: "精通记录已保存", description: `获得 ${xp}。`, inline: `精通 +${xp}` };
  }
  if (outcome.status === "reused") return { title: "精通记录已保存", description: "这次通关已记录。", inline: "精通已记录" };
  if (outcome.status === "ineligible") return { title: "本次未计入精通进度", description: "", inline: "未计入精通" };
  return { title: "精通记录已失效", description: "", inline: "精通记录已失效" };
};

export const formatMasteryDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(remainder).padStart(2, "0");
  return hours ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${minutes}:${paddedSeconds}`;
};
