import { count, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import { playerAccounts, submissions } from "./schema";
import { playerSubmissionStatus } from "./player-upload-service";
import type { VerifiedRunSubmissionOutcome } from "./submission-ocr-service";

export const playerVerifiedRunSubmissionOutcome = (outcome: VerifiedRunSubmissionOutcome) => outcome.status === "conflict"
  ? null
  : { status: outcome.status, awardedXp: outcome.status === "created" ? outcome.awardedXp : 0 };

export const playerVerifiedRunSubmissionOutcomeFields = (outcome: VerifiedRunSubmissionOutcome | null | undefined) => {
  const safeOutcome = outcome ? playerVerifiedRunSubmissionOutcome(outcome) : null;
  return safeOutcome ? { verifiedRunOutcome: safeOutcome } : {};
};

export const playerSubmissionSummaryColumns = { id: submissions.id, status: submissions.status, mapName: submissions.mapName, challengeId: submissions.challengeId, difficulty: submissions.difficulty, reviewReason: submissions.reviewReason, createdAt: submissions.createdAt, updatedAt: submissions.updatedAt };
export const playerSubmissionSummary = (submission: { id: string; status: string; mapName: string; challengeId: string | null; difficulty: string | null; reviewReason: string | null; createdAt: number; updatedAt: number }, verifiedRunOutcome: VerifiedRunSubmissionOutcome | null | undefined) => ({
  submissionId: submission.id,
  status: playerSubmissionStatus(submission.status),
  resubmissionRequired: submission.status === "resubmission_required",
  mapName: submission.mapName,
  challengeId: submission.challengeId ?? undefined,
  difficulty: submission.difficulty ?? undefined,
  reason: verifiedRunOutcome?.status === "conflict" ? undefined : submission.reviewReason ?? undefined,
  ...playerVerifiedRunSubmissionOutcomeFields(verifiedRunOutcome),
  createdAt: submission.createdAt,
  updatedAt: submission.updatedAt,
});

type PlayerSubmissionDependencies = {
  db: ReturnType<typeof drizzle>;
  getCurrentPortalPlayer: (sessionToken: string) => Promise<{ player: typeof playerAccounts.$inferSelect } | null>;
  loadVerifiedRunSubmissionOutcomes: (submissionIds: string[]) => Promise<globalThis.Map<string, VerifiedRunSubmissionOutcome>>;
};

export const createPlayerSubmissionServices = (dependencies: PlayerSubmissionDependencies): Pick<PlatformServices, "listCurrentPlayerSubmissions"> => {
  const { db, getCurrentPortalPlayer, loadVerifiedRunSubmissionOutcomes } = dependencies;
  return {
    async listCurrentPlayerSubmissions(input) {
      const access = await getCurrentPortalPlayer(input.sessionToken);
      if (!access) return null;
      const [rows, [{ total }]] = await Promise.all([
        db.select(playerSubmissionSummaryColumns).from(submissions).where(eq(submissions.playerAccountId, access.player.id)).orderBy(desc(submissions.createdAt), desc(submissions.id)).limit(input.pageSize + 1).offset((input.page - 1) * input.pageSize),
        db.select({ total: count() }).from(submissions).where(eq(submissions.playerAccountId, access.player.id)),
      ]);
      const visibleRows = rows.slice(0, input.pageSize);
      const verifiedRunOutcomes = await loadVerifiedRunSubmissionOutcomes(visibleRows.map((submission) => submission.id));
      return { contractVersion: "1" as const, items: visibleRows.map((submission) => playerSubmissionSummary(submission, verifiedRunOutcomes.get(submission.id))), page: input.page, pageSize: input.pageSize, total, hasMore: rows.length > input.pageSize };
    },
  };
};
