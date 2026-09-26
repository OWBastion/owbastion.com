import type { Challenge } from "@owbastion/contracts";
import type { CanonicalChallengeConditions, ChallengeConditionEvaluation } from "@owbastion/domain";
import { evaluateCanonicalChallengeConditions } from "@owbastion/domain";
import { assessChallengeOcrQuality, type OcrQualityGate, type OcrResponse } from "./ocr-response";

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
  const candidates = challenges.map((candidate) => ({
    ...candidate,
    evaluation: evaluateCanonicalChallengeConditions(candidate.conditions, evaluationInput, titleNamesByKey),
    quality: assessChallengeOcrQuality(candidate.conditions, response, humanConfirmed),
    grantable: Boolean(candidate.challenge.titleKey),
  }));
  const exact = candidates.filter((candidate) => candidate.evaluation.supported && candidate.evaluation.matched);
  const lowConfidence = candidates.filter((candidate) => !candidate.quality.accepted);
  const outcome = lowConfidence.length > 0
    ? "review"
    : exact.length > 0
      ? "automatic"
      : "resubmit";
  return { candidates, exact, lowConfidence, outcome };
};
