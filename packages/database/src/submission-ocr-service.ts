import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { PlatformServices } from "@owbastion/domain";
import type { VerifiedRunConflictField } from "@owbastion/domain";
import type { CanonicalChallengePlan } from "./canonical-challenge-service";
import type { createCanonicalChallengeServices } from "./canonical-challenge-service";
import type { ChallengeCompletionAward } from "./challenge-completion-service";
import type { createChallengeCompletionServices } from "./challenge-completion-service";
import { matchOcrAgainstChallenges, type CanonicalOcrChallenge } from "./ocr-auto-match";
import type { OcrResponse } from "./ocr-response";
import { maxUploadBytes } from "./player-upload-service";
import type { MapTitleRuleSnapshot } from "./challenge-snapshot-service";
import { attachments, ocrResults, playerTitleGrants, submissionReviews, submissionSpotChecks, submissions, titleCatalog } from "./schema";

const ocrkitRequestTimeoutMs = 20_000;

export type VerifiedRunSubmissionOutcomeStatus = "created" | "reused" | "ineligible" | "conflict" | "invalidated";
export type VerifiedRunSubmissionOutcome = {
  status: VerifiedRunSubmissionOutcomeStatus;
  verifiedRunId: string | null;
  awardedXp: number;
  reason: string | null;
  conflictFields: VerifiedRunConflictField[];
};

type SubmissionRow = typeof submissions.$inferSelect;
type PreparedAutoMatchChallenges = {
  candidates: CanonicalOcrChallenge[];
  snapshots: Map<string, MapTitleRuleSnapshot>;
  canonicalChallengePlans: ReadonlyMap<string, CanonicalChallengePlan>;
  titleNamesByKey: ReadonlyMap<string, string>;
  mapIdsByName: ReadonlyMap<string, string>;
};
type SubmissionOcrServices = Pick<PlatformServices, "processOcrJob" | "markOcrJobFailed">;
type SubmissionOcrServicesDependencies = {
  database: D1Database;
  db: ReturnType<typeof drizzle>;
  now: () => number;
  hashRequest: (value: unknown) => Promise<string>;
  logOcrEvent: (event: string, fields: Record<string, unknown>) => void;
  errorDetails: (error: unknown) => { errorName: string; errorMessage: string };
  evidenceBucket?: R2Bucket;
  ocrkitBaseUrl?: string;
  ocrkitApiToken?: string;
  ocrAutoReviewSampleRate: number;
  resetActiveMapsCache: () => void;
  preparePlayerAutoMatchChallenges: (row: SubmissionRow, response: OcrResponse) => Promise<PreparedAutoMatchChallenges>;
  resolveVerifiedRunSubmissionOutcome: (row: SubmissionRow, response: OcrResponse, acceptanceSource: "submission_automatic" | "submission_review") => Promise<VerifiedRunSubmissionOutcome>;
  masterySubmissionOutcomeStatement: (submissionId: string, outcome: VerifiedRunSubmissionOutcome) => D1PreparedStatement;
  approvedSubmissionOutcomeStatement: (input: { submissionId: string; outcomeKey: string; outcomeType: "title_grant" | "challenge"; status: "created" | "reused"; entityId: string | null; details: Record<string, unknown> }) => D1PreparedStatement;
  completion: Pick<ReturnType<typeof createChallengeCompletionServices>, "titleGrantScopeKey" | "addChallengeCompletionAward" | "selectCompletionGrantAwards" | "challengeCompletionChains">;
  canonicalChallenges: Pick<ReturnType<typeof createCanonicalChallengeServices>, "materializingCanonicalChallenges">;
};

export const createSubmissionOcrServices = ({
  database,
  db,
  now,
  hashRequest,
  logOcrEvent,
  errorDetails,
  evidenceBucket,
  ocrkitBaseUrl,
  ocrkitApiToken,
  ocrAutoReviewSampleRate,
  resetActiveMapsCache,
  preparePlayerAutoMatchChallenges,
  resolveVerifiedRunSubmissionOutcome,
  masterySubmissionOutcomeStatement,
  approvedSubmissionOutcomeStatement,
  completion,
  canonicalChallenges,
}: SubmissionOcrServicesDependencies): SubmissionOcrServices => {
  const persistOcrResult = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    status: string;
    responseJson?: string;
    matchJson?: string;
    nextStatus: string;
    reviewReason: string | null;
    incrementFailCount: boolean;
    allowExistingStatus: boolean;
    ruleSnapshotJson?: string | null;
    verifiedRunOutcome?: VerifiedRunSubmissionOutcome;
  }) => {
    const timestamp = now();
    const resultInsert = input.allowExistingStatus
      ? database.prepare(
        "INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.status, input.responseJson ?? null, input.matchJson ?? null, timestamp)
      : database.prepare(
        "INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')"
      ).bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.status, input.responseJson ?? null, input.matchJson ?? null, timestamp, input.submissionId);
    const submissionUpdate = database.prepare(
      "UPDATE submissions SET status = ?, review_reason = ?, ocr_fail_count = ocr_fail_count + ?, rule_snapshot_json = COALESCE(?, rule_snapshot_json), updated_at = ? WHERE id = ? AND status = 'ocr_pending'"
    ).bind(input.nextStatus, input.reviewReason, input.incrementFailCount ? 1 : 0, input.ruleSnapshotJson ?? null, timestamp, input.submissionId);
    await database.batch(input.verifiedRunOutcome ? [resultInsert, submissionUpdate, masterySubmissionOutcomeStatement(input.submissionId, input.verifiedRunOutcome)] : [resultInsert, submissionUpdate]);
  };

  const shouldSampleAutomaticDecision = async (submissionId: string) => {
    if (ocrAutoReviewSampleRate <= 0) return false;
    const digest = await hashRequest({ submissionId, policy: "ocr-auto-v1" });
    return Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff < ocrAutoReviewSampleRate;
  };

  const persistAutomaticDecision = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    responseJson: string;
    matchJson: string;
    grants: Array<{ snapshot: MapTitleRuleSnapshot; canonicalChallengeId: string; titleKey: string; mapId: string | null; slot: string | null; alreadyOwned: boolean; existingGrantId: string | null }>;
    completionRoots: Array<{ canonicalChallengeId: string; snapshot: MapTitleRuleSnapshot; slot: string | null }>;
    canonicalChallengePlans: ReadonlyMap<string, CanonicalChallengePlan>;
    sample: boolean;
    verifiedRunOutcome?: VerifiedRunSubmissionOutcome;
  }) => {
    const timestamp = now();
    const reviewId = crypto.randomUUID();
    const spotCheckId = crypto.randomUUID();
    const planIds = [...new Set([...input.grants, ...input.completionRoots].map((item) => item.canonicalChallengeId))];
    const plans = planIds.map((id) => {
      const plan = input.canonicalChallengePlans.get(id);
      if (!plan) throw new Error("CHALLENGE_NOT_FOUND");
      return plan;
    });
    await canonicalChallenges.materializingCanonicalChallenges.resolvePlans(plans);
    const grants = input.grants.map((grant) => ({ ...grant, grantId: crypto.randomUUID() }));
    const primaryGrant = grants[0];
    if (!primaryGrant) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
    if (grants.some((grant) => grant.mapId !== null && !grant.snapshot.gameplayRevisionId)) throw new Error("GAMEPLAY_REVISION_NOT_FOUND");
    const submission = await db.select({ playerAccountId: submissions.playerAccountId, gameplayRevisionId: submissions.gameplayRevisionId, createdAt: submissions.createdAt }).from(submissions).where(eq(submissions.id, input.submissionId)).get();
    if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
    if (grants.some((grant) => grant.snapshot.gameplayRevisionId && submission.gameplayRevisionId && grant.snapshot.gameplayRevisionId !== submission.gameplayRevisionId)) throw new Error("SUBMISSION_REVISION_MISMATCH");
    const completionAwards = new Map<string, ChallengeCompletionAward>();
    const completionChains = await completion.challengeCompletionChains({
      playerAccountId: submission.playerAccountId,
      roots: input.completionRoots.map((root) => ({ challengeId: root.canonicalChallengeId, slot: root.slot })),
      eligibilityAt: submission.createdAt,
    });
    for (const chain of completionChains) {
      for (const award of chain) completion.addChallengeCompletionAward(completionAwards, award);
    }
    const completionAwardRows = [...completionAwards.values()].map((award) => ({
      ...award,
      grantId: grants.find((item) => completion.titleGrantScopeKey(item) === completion.titleGrantScopeKey(award))?.grantId ?? crypto.randomUUID(),
    }));
    const directGrantsByScope = new Map(grants.map((grant) => [completion.titleGrantScopeKey(grant), grant]));
    const completionGrantsByScope = completion.selectCompletionGrantAwards(completionAwardRows, directGrantsByScope);
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, 'matched', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.responseJson, input.matchJson, timestamp, input.submissionId),
      database.prepare("INSERT OR IGNORE INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, ?, 'approved', NULL, 'system:ocr', ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(reviewId, input.submissionId, timestamp, input.submissionId),
    ];
    for (const award of completionAwardRows) {
      statements.push(database.prepare("INSERT OR IGNORE INTO challenge_completions (id, player_account_id, challenge_id, gameplay_revision_id, status, source_type, source_id, completed_at, created_at) SELECT ?, ?, ?, ?, 'active', ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending') AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(crypto.randomUUID(), submission.playerAccountId, award.challengeId, award.gameplayRevisionId, award.completionSourceType, input.submissionId, timestamp, timestamp, input.submissionId, reviewId));
    }
    for (const award of completionGrantsByScope.values()) {
      statements.push(database.prepare("INSERT OR IGNORE INTO player_title_grants (id, player_account_id, title_key, map_id, gameplay_revision_id, slot, status, source_type, source_id, granted_by, granted_at, completion_id) SELECT ?, ?, ?, ?, ?, ?, 'active', 'automatic', ?, 'system:ocr', ?, (SELECT completion.id FROM challenge_completions completion WHERE completion.player_account_id = ? AND completion.challenge_id = ? AND completion.status = 'active' AND completion.gameplay_revision_id IS ? LIMIT 1) WHERE EXISTS (SELECT 1 FROM challenge_completions completion WHERE completion.player_account_id = ? AND completion.challenge_id = ? AND completion.status = 'active' AND completion.gameplay_revision_id IS ?)").bind(award.grantId, submission.playerAccountId, award.titleKey, award.mapId, award.gameplayRevisionId, award.slot, input.submissionId, timestamp, submission.playerAccountId, award.challengeId, award.gameplayRevisionId, submission.playerAccountId, award.challengeId, award.gameplayRevisionId));
    }
    statements.push(
      database.prepare("UPDATE submissions SET status = 'approved', review_reason = NULL, gameplay_revision_id = COALESCE(gameplay_revision_id, ?), grant_id = (SELECT g.id FROM player_title_grants g WHERE g.player_account_id = submissions.player_account_id AND g.title_key = ? AND g.status = 'active' AND (g.map_id = ? OR (g.map_id IS NULL AND ? IS NULL)) AND (g.gameplay_revision_id = ? OR (g.gameplay_revision_id IS NULL AND ? IS NULL))), rule_snapshot_json = ?, updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(primaryGrant.snapshot.gameplayRevisionId, primaryGrant.titleKey, primaryGrant.mapId, primaryGrant.mapId, primaryGrant.snapshot.gameplayRevisionId, primaryGrant.snapshot.gameplayRevisionId, JSON.stringify(primaryGrant.snapshot), timestamp, input.submissionId, reviewId),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_review', 'submission', id, ?, ? FROM submissions WHERE id = ? AND status = 'approved' AND grant_id IS NOT NULL").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ requestId: input.requestId, attempt: input.attempt, decision: "approved", grants: grants.map(({ titleKey, mapId, slot, alreadyOwned }) => ({ titleKey, mapId, slot, alreadyOwned })), match: JSON.parse(input.matchJson), ruleSnapshot: primaryGrant.snapshot }), timestamp, input.submissionId),
    );
    if (input.verifiedRunOutcome) statements.push(masterySubmissionOutcomeStatement(input.submissionId, input.verifiedRunOutcome));
    for (const grant of grants) {
      const grantScope = `${grant.titleKey}:${grant.mapId ?? ""}:${grant.snapshot.gameplayRevisionId ?? ""}`;
      statements.push(
        approvedSubmissionOutcomeStatement({
          submissionId: input.submissionId,
          outcomeKey: `title_grant:${grantScope}`,
          outcomeType: "title_grant",
          status: grant.alreadyOwned ? "reused" : "created",
          entityId: grant.existingGrantId ?? grant.grantId,
          details: { titleKey: grant.titleKey, mapId: grant.mapId, gameplayRevisionId: grant.snapshot.gameplayRevisionId, slot: grant.slot },
        }),
      );
    }
    const titleGrantOutcomeScopes = new Set(grants.map(completion.titleGrantScopeKey));
    for (const award of completionAwardRows) {
      statements.push(approvedSubmissionOutcomeStatement({ submissionId: input.submissionId, outcomeKey: `challenge:${award.challengeId}:${award.mapId ?? ""}:${award.gameplayRevisionId ?? ""}`, outcomeType: "challenge", status: "created", entityId: award.challengeId, details: { mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, titleKey: award.titleKey } }));
      const scope = completion.titleGrantScopeKey(award);
      if (!award.root && award.grantable && !titleGrantOutcomeScopes.has(scope)) {
        titleGrantOutcomeScopes.add(scope);
        statements.push(approvedSubmissionOutcomeStatement({ submissionId: input.submissionId, outcomeKey: `title_grant:${scope}`, outcomeType: "title_grant", status: "created", entityId: award.grantId, details: { titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, slot: award.slot, satisfiedBy: award.satisfiedBy } }));
      }
      statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'challenge.completion.submission', 'challenge_completion', id, ?, ? FROM challenge_completions WHERE player_account_id = ? AND challenge_id = ? AND gameplay_revision_id IS ? AND status = 'active' AND source_id = ? LIMIT 1").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ submissionId: input.submissionId, challengeId: award.challengeId, titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, satisfaction: award.satisfiedBy }), timestamp, submission.playerAccountId, award.challengeId, award.gameplayRevisionId, input.submissionId));
    }
    for (const grant of grants) {
      statements.push(
        database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_grant', 'player_title_grant', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved') AND EXISTS (SELECT 1 FROM player_title_grants WHERE id = ?)").bind(crypto.randomUUID(), input.requestId, grant.grantId, JSON.stringify({ submissionId: input.submissionId, sourceType: "automatic", sourceId: input.submissionId, titleKey: grant.titleKey, mapId: grant.mapId, gameplayRevisionId: grant.snapshot.gameplayRevisionId, alreadyOwned: grant.alreadyOwned, ruleSnapshot: grant.snapshot }), timestamp, input.submissionId, grant.grantId),
      );
    }
    for (const [scope, award] of completionGrantsByScope) {
      if (directGrantsByScope.has(scope)) continue;
      statements.push(database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_grant', 'player_title_grant', id, ?, ? FROM player_title_grants WHERE id = ?").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ submissionId: input.submissionId, sourceType: "automatic", titleKey: award.titleKey, mapId: award.mapId, gameplayRevisionId: award.gameplayRevisionId, challengeId: award.challengeId, satisfiedBy: award.satisfiedBy }), timestamp, award.grantId));
    }
    if (input.sample) statements.push(database.prepare("INSERT OR IGNORE INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) SELECT ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved')").bind(spotCheckId, input.submissionId, JSON.stringify({ version: "ocr-auto-v1", sampleRate: ocrAutoReviewSampleRate }), timestamp, input.submissionId));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  const persistMasteryOnlyDecision = async (input: {
    submissionId: string;
    requestId: string;
    attempt: number;
    responseJson: string;
    matchJson: string;
    verifiedRunOutcome: VerifiedRunSubmissionOutcome;
    sample: boolean;
  }) => {
    if (!["created", "reused"].includes(input.verifiedRunOutcome.status)) throw new Error("VERIFIED_RUN_OUTCOME_NOT_ACCEPTED");
    const timestamp = now();
    const reviewId = crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, response_json, match_json, created_at) SELECT ?, ?, ?, ?, 'matched', ?, ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(crypto.randomUUID(), input.submissionId, input.requestId, input.attempt, input.responseJson, input.matchJson, timestamp, input.submissionId),
      database.prepare("INSERT OR IGNORE INTO submission_reviews (id, submission_id, decision, reason, reviewer, created_at) SELECT ?, ?, 'approved', NULL, 'system:ocr', ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'ocr_pending')").bind(reviewId, input.submissionId, timestamp, input.submissionId),
      database.prepare("UPDATE submissions SET status = 'approved', review_reason = NULL, grant_id = NULL, updated_at = ? WHERE id = ? AND status = 'ocr_pending' AND EXISTS (SELECT 1 FROM submission_reviews WHERE id = ?)").bind(timestamp, input.submissionId, reviewId),
      masterySubmissionOutcomeStatement(input.submissionId, input.verifiedRunOutcome),
      database.prepare("INSERT INTO audit_events (id, correlation_id, actor_type, actor_id, operation, entity_type, entity_id, payload_json, created_at) SELECT ?, ?, 'service', 'system:ocr', 'submission.automatic_mastery', 'submission', id, ?, ? FROM submissions WHERE id = ? AND status = 'approved' AND grant_id IS NULL").bind(crypto.randomUUID(), input.requestId, JSON.stringify({ requestId: input.requestId, attempt: input.attempt, decision: "approved", verifiedRunOutcome: { status: input.verifiedRunOutcome.status, awardedXp: input.verifiedRunOutcome.awardedXp } }), timestamp, input.submissionId),
    ];
    if (input.sample) statements.push(database.prepare("INSERT OR IGNORE INTO submission_spot_checks (id, submission_id, status, policy_json, sampled_at) SELECT ?, ?, 'pending', ?, ? WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND status = 'approved')").bind(crypto.randomUUID(), input.submissionId, JSON.stringify({ version: "ocr-auto-v1", sampleRate: ocrAutoReviewSampleRate }), timestamp, input.submissionId));
    await database.batch(statements as [D1PreparedStatement, ...D1PreparedStatement[]]);
  };

  return {
    async processOcrJob(input) {
      resetActiveMapsCache();
      const ocrRequestId = input.requestId ?? crypto.randomUUID();
      const context = { submissionId: input.submissionId, attempt: input.attempt, manual: Boolean(input.manual), requestId: ocrRequestId };
      const startedAt = Date.now();
      logOcrEvent("job_started", context);
      if (!evidenceBucket || !ocrkitBaseUrl || !ocrkitApiToken) {
        logOcrEvent("job_processing_failed", { ...context, stage: "configuration", durationMs: Date.now() - startedAt, errorName: "Error", errorMessage: "OCR_NOT_CONFIGURED" });
        throw new Error("OCR_NOT_CONFIGURED");
      }
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row) throw new Error("SUBMISSION_NOT_FOUND");
      if (row.status !== "ocr_pending") return;
      const attachment = await db.select().from(attachments).where(and(eq(attachments.submissionId, row.id), eq(attachments.objectKey, input.objectKey), eq(attachments.uploadStatus, "stored"))).get();
      if (!attachment?.objectKey) throw new Error("OCR_EVIDENCE_UNAVAILABLE");
      let evidenceBytes: ArrayBuffer;
      let contentType: string;
      try {
        const evidenceObject = await evidenceBucket.get(attachment.objectKey);
        if (!evidenceObject || evidenceObject.size > maxUploadBytes) throw new Error("evidence_unavailable");
        evidenceBytes = await evidenceObject.arrayBuffer();
        if (evidenceBytes.byteLength === 0 || evidenceBytes.byteLength > maxUploadBytes) throw new Error("evidence_unavailable");
        contentType = evidenceObject.httpMetadata?.contentType ?? attachment.contentType;
      } catch {
        throw new Error("OCR_EVIDENCE_UNAVAILABLE");
      }
      let response: Response;
      try {
        const formData = new FormData();
        formData.append("file", new Blob([evidenceBytes], { type: contentType }), "evidence");
        response = await fetch(`${ocrkitBaseUrl.replace(/\/$/, "")}/api/v1/ocr/challenge`, { method: "POST", headers: { authorization: `Bearer ${ocrkitApiToken}`, "user-agent": "OWBastion-PlatformAPI/1.0", "x-request-id": ocrRequestId }, body: formData, signal: AbortSignal.timeout(ocrkitRequestTimeoutMs) });
      } catch (error) {
        logOcrEvent("ocrkit_request_failed", { ...context, stage: "fetch", durationMs: Date.now() - startedAt, ...errorDetails(error) });
        throw new Error("OCR_NETWORK");
      }
      logOcrEvent("ocrkit_response", { ...context, status: response.status, ok: response.ok, contentType: response.headers.get("content-type"), durationMs: Date.now() - startedAt });
      if (!response.ok) throw new Error(`OCR_HTTP_${response.status}`);
      let result: OcrResponse;
      try {
        const parsed = await response.json() as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("response_body_not_object");
        result = parsed as OcrResponse;
        logOcrEvent("ocrkit_response_parsed", { ...context, responseRequestId: result.request_id ?? null, schemaVersion: result.schema_version ?? null, responseOk: result.ok ?? null, dataFields: Object.keys(result.data ?? {}), evidenceFields: Object.keys(result.fields ?? {}), durationMs: Date.now() - startedAt });
      } catch (error) {
        logOcrEvent("ocrkit_response_parse_failed", { ...context, stage: "parse_response", durationMs: Date.now() - startedAt, ...errorDetails(error) });
        throw new Error("OCR_INVALID_RESPONSE");
      }
      let stage = "load_submission";
      try {
        stage = "resolve_auto_candidates";
        const preparedCanonicalCandidates = await preparePlayerAutoMatchChallenges(row, result);
        const canonicalDecision = matchOcrAgainstChallenges(preparedCanonicalCandidates.candidates, result, preparedCanonicalCandidates.mapIdsByName, preparedCanonicalCandidates.titleNamesByKey);
        const verifiedRunOutcome = await resolveVerifiedRunSubmissionOutcome(row, result, input.manual ? "submission_review" : "submission_automatic");
        const masteryAccepted = verifiedRunOutcome.status === "created" || verifiedRunOutcome.status === "reused";
        if (verifiedRunOutcome.status === "conflict") {
          stage = "persist_mastery_conflict";
          await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: "review_required", responseJson: JSON.stringify(result), matchJson: JSON.stringify({ verifiedRunOutcome: { status: verifiedRunOutcome.status, conflictFields: verifiedRunOutcome.conflictFields } }), nextStatus: "ocr_review_required", reviewReason: "通关码与已验证记录存在冲突，请人工核对", incrementFailCount: false, allowExistingStatus: Boolean(input.manual), verifiedRunOutcome });
          logOcrEvent("job_completed", { ...context, outcome: "mastery_conflict", conflictFields: verifiedRunOutcome.conflictFields, durationMs: Date.now() - startedAt });
          return;
        }
        {
          const prepared = preparedCanonicalCandidates;
          const decision = canonicalDecision;
          const candidateOutcomes = decision.candidates.map(({ challenge, canonicalChallengeId, evaluation, quality }) => ({
            challengeId: challenge.challengeId,
            canonicalChallengeId,
            challengeType: challenge.family === "map" ? challenge.kind : challenge.scope === "map" ? "map_title_achievement" : "title_achievement",
            targetMapName: challenge.family === "map" ? challenge.mapName : undefined,
            targetDifficulty: challenge.family === "map" ? challenge.difficulty ?? null : undefined,
            titleName: challenge.titleKey ? prepared.titleNamesByKey.get(challenge.titleKey) ?? null : null,
            matched: evaluation.matched,
            conditionsSupported: evaluation.supported,
            requiredFields: evaluation.requiredFields,
            quality,
          }));
          const matchJson = JSON.stringify({ mode: "canonical_conditions", outcome: decision.outcome, candidates: candidateOutcomes, verifiedRunOutcome: { status: verifiedRunOutcome.status } });
          if (decision.outcome === "automatic") {
            const completionRoots = [...new Map(decision.exact.map((item) => {
              const snapshot = prepared.snapshots.get(item.canonicalChallengeId);
              if (!snapshot?.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              return [item.canonicalChallengeId, { canonicalChallengeId: item.canonicalChallengeId, snapshot, slot: snapshot.slot }] as const;
            })).values()];
            const uniqueGrantCandidates = [...new Map(decision.exact.filter((item) => item.grantable).map((item) => {
              const snapshot = prepared.snapshots.get(item.canonicalChallengeId);
              if (!snapshot?.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              return [`${snapshot.titleKey}:${snapshot.mapId ?? ""}:${snapshot.gameplayRevisionId ?? ""}`, item] as const;
            })).values()];
            const grantTitleKeys = [...new Set(uniqueGrantCandidates.map((item) => prepared.snapshots.get(item.canonicalChallengeId)?.titleKey).filter((key): key is string => Boolean(key)))];
            const existingGrantRows = grantTitleKeys.length ? await db.select({ id: playerTitleGrants.id, titleKey: playerTitleGrants.titleKey, mapId: playerTitleGrants.mapId, gameplayRevisionId: playerTitleGrants.gameplayRevisionId }).from(playerTitleGrants).where(and(
              eq(playerTitleGrants.playerAccountId, row.playerAccountId),
              eq(playerTitleGrants.status, "active"),
              sql`${playerTitleGrants.titleKey} IN (SELECT value FROM json_each(${JSON.stringify(grantTitleKeys)}))`,
            )) : [];
            const existingGrantByScope = new globalThis.Map(existingGrantRows.map((grant) => [JSON.stringify([grant.titleKey, grant.mapId, grant.gameplayRevisionId]), grant]));
            const grants: Array<{ snapshot: MapTitleRuleSnapshot; canonicalChallengeId: string; titleKey: string; mapId: string | null; slot: string | null; alreadyOwned: boolean; existingGrantId: string | null }> = [];
            for (const grantCandidate of uniqueGrantCandidates) {
              const snapshot = prepared.snapshots.get(grantCandidate.canonicalChallengeId);
              if (!snapshot?.titleKey) throw new Error("CHALLENGE_REWARD_NOT_CONFIGURED");
              const mapId = snapshot.mapId;
              const existing = existingGrantByScope.get(JSON.stringify([snapshot.titleKey, mapId, snapshot.gameplayRevisionId]));
              grants.push({ snapshot, canonicalChallengeId: grantCandidate.canonicalChallengeId, titleKey: snapshot.titleKey, mapId, slot: snapshot.slot, alreadyOwned: Boolean(existing), existingGrantId: existing?.id ?? null });
            }
            const sample = await shouldSampleAutomaticDecision(row.id);
            stage = "persist_automatic_decision";
            await persistAutomaticDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson, grants, completionRoots, canonicalChallengePlans: prepared.canonicalChallengePlans, sample, verifiedRunOutcome });
            logOcrEvent("job_completed", { ...context, outcome: "automatic", titleKey: grants[0]?.titleKey ?? null, grantCount: grants.length, spotCheck: sample, durationMs: Date.now() - startedAt });
            return;
          }
          stage = "persist_auto_routing";
          if (masteryAccepted && decision.outcome === "resubmit") {
            await persistMasteryOnlyDecision({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, responseJson: JSON.stringify(result), matchJson, verifiedRunOutcome, sample: await shouldSampleAutomaticDecision(row.id) });
          } else {
            await persistOcrResult({ submissionId: row.id, requestId: ocrRequestId, attempt: input.attempt, status: decision.outcome === "review" ? "review_required" : "mismatch", responseJson: JSON.stringify(result), matchJson, nextStatus: decision.outcome === "review" ? "ocr_review_required" : "resubmission_required", reviewReason: decision.outcome === "review" ? "无法唯一判断挑战，请人工核对" : "截图与当前挑战目录不匹配，请重新提交", incrementFailCount: decision.outcome === "resubmit", allowExistingStatus: Boolean(input.manual), verifiedRunOutcome });
          }
          logOcrEvent("job_completed", { ...context, outcome: decision.outcome, candidateCount: decision.exact.length, durationMs: Date.now() - startedAt });
          return;
        }
      } catch (error) {
        const errorCode = error instanceof Error && error.message.startsWith("OCR_") ? error.message : `OCR_PROCESS_FAILED_${stage.toUpperCase()}`;
        logOcrEvent("job_processing_failed", { ...context, stage, errorCode, durationMs: Date.now() - startedAt, ...errorDetails(error) });
        throw new Error(errorCode, { cause: error });
      }
    },

    async markOcrJobFailed(input) {
      const row = await db.select().from(submissions).where(eq(submissions.id, input.submissionId)).get();
      if (!row || (!input.manual && row.status !== "ocr_pending")) return;
      const requestId = input.requestId ?? crypto.randomUUID();
      await database.batch([
        database.prepare("INSERT OR IGNORE INTO ocr_results (id, submission_id, request_id, attempt, status, error_code, created_at) VALUES (?, ?, ?, ?, 'error', ?, ?)").bind(crypto.randomUUID(), row.id, requestId, input.attempt, input.errorCode, now()),
        database.prepare("UPDATE submissions SET status = 'resubmission_required', review_reason = ?, ocr_fail_count = ocr_fail_count + 1, updated_at = ? WHERE id = ? AND status = 'ocr_pending'").bind("截图暂时无法处理，请重新提交截图。", now(), row.id),
      ]);
      logOcrEvent("job_failure_recorded", { submissionId: row.id, attempt: input.attempt, manual: Boolean(input.manual), requestId, errorCode: input.errorCode });
    },

  };
};
