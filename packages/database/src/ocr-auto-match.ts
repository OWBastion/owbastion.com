import type { Challenge } from "@owbastion/contracts";
import type { CanonicalChallengeConditions, ChallengeConditionEvaluation } from "@owbastion/domain";
import { evaluateCanonicalChallengeConditions } from "@owbastion/domain";
import { assessChallengeOcrQuality, assessSubmissionOcrResponseQuality, type OcrQualityGate, type OcrResponse } from "./ocr-response";

export type CanonicalOcrChallenge = {
  challenge: Challenge;
  canonicalChallengeId: string;
  conditions: CanonicalChallengeConditions | null;
};

export type AutoMatchCandidate = CanonicalOcrChallenge & {
  evaluation: ChallengeConditionEvaluation;
  quality: OcrQualityGate;
  grantable: boolean;
};

export type AutoMatchDecision = {
  candidates: AutoMatchCandidate[];
  exact: AutoMatchCandidate[];
  lowConfidence: AutoMatchCandidate[];
  outcome: "automatic" | "review" | "resubmit";
};

const normalizeMapName = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

export const matchOcrAgainstChallenges = (
  challenges: CanonicalOcrChallenge[],
  response: OcrResponse,
  mapIdsByName: ReadonlyMap<string, string>,
  titleNamesByKey: ReadonlyMap<string, string>,
  humanConfirmed = false,
): AutoMatchDecision => {
  const data = response.data ?? {};
  const evaluationInput = {
    mapId: mapIdsByName.get(normalizeMapName(data.map_name)) ?? null,
    difficulty: data.difficulty,
    completed: data.challenge_completed,
    mapVariant: data.map_variant,
    achievementTitles: data.achievement_titles,
    achievementPanelText: data.achievement_panel_text,
  };
  const candidates = challenges.map((candidate) => {
    const evaluation = evaluateCanonicalChallengeConditions(candidate.conditions, evaluationInput, titleNamesByKey);
    const conditionMatches = candidate.conditions?.conditions.map((condition) => evaluateCanonicalChallengeConditions(
      { operator: "and", conditions: [condition] },
      evaluationInput,
      titleNamesByKey,
    ).matched) ?? [];
    const conditionQualities = candidate.conditions?.conditions.map((_, index) => assessChallengeOcrQuality(
      candidate.conditions,
      response,
      humanConfirmed,
      [index],
    )) ?? [];
    const conditionHasEvidence = conditionQualities.map((quality) => quality.requiredFields.length > 0
      && !quality.reasons.some((reason) => quality.requiredFields.some((field) => reason === `${field}:missing_value`)));
    const matchingIndexes = conditionMatches.flatMap((matched, index) => matched ? [index] : []);
    const reliableMatchingIndexes = matchingIndexes.filter((index) => conditionQualities[index]?.accepted);
    const uncertainIndexes = conditionQualities.flatMap((quality, index) => !quality.accepted && conditionHasEvidence[index] ? [index] : []);
    const qualityIndexes = candidate.conditions?.operator === "or"
      ? reliableMatchingIndexes.length
        ? reliableMatchingIndexes
        : matchingIndexes.length
          ? matchingIndexes
          : uncertainIndexes.length
            ? uncertainIndexes
            : candidate.conditions.conditions.map((_, index) => index)
      : candidate.conditions?.conditions.map((_, index) => index);
    const quality = assessChallengeOcrQuality(candidate.conditions, response, humanConfirmed, qualityIndexes);
    const knownAndMismatch = candidate.conditions?.operator === "and"
      && conditionMatches.some((matched, index) => !matched && conditionQualities[index]?.accepted);
    const plausible = !evaluation.supported
      || (candidate.conditions?.operator === "or"
        ? matchingIndexes.length > 0 || uncertainIndexes.length > 0
        : !knownAndMismatch && (conditionMatches.some(Boolean) || conditionHasEvidence.some(Boolean)));
    return { ...candidate, evaluation, quality, plausible, grantable: Boolean(candidate.challenge.titleKey) };
  });
  const exact = candidates.filter((candidate) => candidate.evaluation.supported && candidate.evaluation.matched);
  const lowConfidence = candidates.filter((candidate) => !candidate.quality.accepted && candidate.plausible);
  const outcome = !assessSubmissionOcrResponseQuality(response, humanConfirmed).accepted || lowConfidence.length > 0
    ? "review"
    : exact.length > 0
      ? "automatic"
      : "resubmit";
  return { candidates, exact, lowConfidence, outcome };
};
