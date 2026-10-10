import type { AdminPlayerDetail } from "../composables/useAdminApi";
import { playerSubmissionStatusLabel, playerSubmissionStatusTone, type SubmissionStatusTone } from "./submissionStatus";

export type TimelineEntry = {
  id: string;
  at: number;
  kind: "submission" | "completion" | "run";
  title: string;
  detail: string;
  status?: { label: string; tone: SubmissionStatusTone };
};

type Submission = AdminPlayerDetail["recentSubmissions"][number];

/** Names what a submission was for: map, difficulty and variant, not just "achievement challenge". */
export function describeSubmission(submission: Submission): { title: string; detail: string } {
  const challenge = submission.challenge;
  if (!challenge) return { title: submission.mapName, detail: "" };
  if (challenge.family === "achievement") {
    return { title: `成就：${challenge.titleName}`, detail: [challenge.category, challenge.condition].filter(Boolean).join(" · ") };
  }
  const classic = challenge.mapVariant === "classic";
  switch (challenge.kind) {
    case "pioneer": return { title: `开拓者 · ${challenge.mapName}`, detail: "地图重置后的限时挑战" };
    case "classic_completion": return { title: `经典版 · ${challenge.mapName} 通关`, detail: challenge.name };
    case "map_title_achievement": return { title: `称号：${challenge.name}`, detail: challenge.mapName };
    case "difficulty_completion": return { title: `${classic ? "经典版 · " : ""}${challenge.mapName}${challenge.difficulty ? ` · ${challenge.difficulty}` : ""} 通关`, detail: challenge.name };
    default: return { title: challenge.name, detail: [challenge.mapName, challenge.difficulty].filter(Boolean).join(" · ") };
  }
}

export function buildPlayerTimeline(player: AdminPlayerDetail): TimelineEntry[] {
  const submissions = player.recentSubmissions.map((submission): TimelineEntry => {
    const described = describeSubmission(submission);
    const detail = [described.detail, submission.reason ? `原因：${submission.reason}` : ""].filter(Boolean).join(" · ");
    return {
      id: `submission:${submission.submissionId}`,
      at: submission.updatedAt,
      kind: "submission",
      title: described.title,
      detail,
      status: { label: playerSubmissionStatusLabel(submission.status, submission.resubmissionRequired), tone: playerSubmissionStatusTone(submission.status, submission.resubmissionRequired) },
    };
  });
  const completions = player.recentCompletions.map((completion): TimelineEntry => ({
    id: `completion:${completion.completionId}`,
    at: completion.completedAt,
    kind: "completion",
    title: `获得称号：${completion.titleName}`,
    detail: [completion.mapName, completion.gameVersion].filter(Boolean).join(" · "),
    status: completion.status === "active" ? undefined : { label: "已失效", tone: "default" },
  }));
  const runs = player.progression.recentVerifiedRuns.map((run): TimelineEntry => ({
    id: `run:${run.runId}`,
    at: run.acceptedAt,
    kind: "run",
    title: `${run.mapName} · ${run.difficulty} 通关记录`,
    detail: `${run.gameVersion} · +${run.awardedXp} XP`,
  }));
  return [...submissions, ...completions, ...runs].sort((left, right) => right.at - left.at);
}
