import type { Challenge } from "@owbastion/contracts";
import { matchOcrResult, type OcrMatch } from "./ocr-match";
import { assessOcrQuality, type OcrQualityGate, type OcrResponse } from "./ocr-response";

export type AutoMatchCandidate = {
  challenge: Challenge;
  challengeType: "difficulty_completion" | "title_achievement" | "map_title_achievement";
  targetMapName: string;
  targetDifficulty: string | null;
  targetPlayerName: string;
  titleName: string | null;
  requiredMapVariant: "classic" | null;
  match: OcrMatch;
  quality: OcrQualityGate;
  grantable: boolean;
};

export type AutoMatchDecision = {
  candidates: AutoMatchCandidate[];
  exact: AutoMatchCandidate[];
  lowConfidence: AutoMatchCandidate[];
  outcome: "automatic" | "review" | "resubmit";
};

const isMapTitleChallenge = (challenge: Challenge) => challenge.family === "map" && challenge.kind === "map_title_achievement";

const candidateType = (challenge: Challenge): AutoMatchCandidate["challengeType"] => {
  if (challenge.family === "achievement") return "title_achievement";
  return isMapTitleChallenge(challenge) ? "map_title_achievement" : "difficulty_completion";
};

const candidateTitleName = (challenge: Challenge) => {
  if (challenge.family === "achievement") return challenge.titleName;
  return isMapTitleChallenge(challenge) ? challenge.name : null;
};

const normalized = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

const isReliableMapEvidence = (response: OcrResponse) => {
  const field = response.fields?.map_name;
  return Boolean(response.data?.map_name?.trim()) && field?.status === "ok" && typeof field.confidence === "number" && field.confidence >= 0.85;
};

const evaluateCandidate = (challenge: Challenge, response: OcrResponse, playerName: string): AutoMatchCandidate => {
  const challengeType = candidateType(challenge);
  const targetMapName = challenge.family === "map" ? challenge.mapName : "成就挑战";
  const targetDifficulty = challenge.family === "map" ? challenge.difficulty ?? null : null;
  const requiredMapVariant = challenge.mapVariant ?? (challenge.family === "map" && challenge.kind === "classic_completion" ? "classic" : null);
  const titleName = candidateTitleName(challenge);
  const quality = assessOcrQuality(challengeType, response, requiredMapVariant, Boolean(titleName));
  const data = response.data ?? {};
  const { skipped, ...match } = matchOcrResult({
    challengeType,
    targetMapName,
    targetDifficulty,
    targetPlayerName: playerName,
    mapName: data.map_name,
    difficulty: data.difficulty,
    challengeCompleted: data.challenge_completed,
    player: data.viewer_player,
    mapVariant: data.map_variant,
    requiredMapVariant,
    titleName,
    achievementTitles: data.achievement_titles,
    achievementPanelText: data.achievement_panel_text,
  });
  const matchWithEvidence = titleName && !match.achievement
    ? { ...match, achievement: false }
    : match;
  const qualityWithEvidence = titleName && !match.achievement
    ? { ...quality, accepted: false, reasons: [...quality.reasons, "achievement_evidence:title_not_checked"] }
    : quality;
  return {
    challenge,
    challengeType,
    targetMapName,
    targetDifficulty,
    targetPlayerName: playerName,
    titleName,
    requiredMapVariant,
    match: { ...matchWithEvidence, skipped },
    quality: qualityWithEvidence,
    grantable: Boolean(challenge.titleKey),
  };
};

export const matchOcrAgainstChallenges = (challenges: Challenge[], response: OcrResponse, playerName: string): AutoMatchDecision => {
  const publicManualChallenges = challenges.filter((challenge) =>
    (challenge.status === "active" || challenge.status === "sunsetting") && challenge.submissionMode !== "automatic",
  );
  const currentMapName = response.data?.map_name?.trim() ?? "";
  const mapChallenges = publicManualChallenges.filter((challenge) => challenge.family === "map");
  const candidates = publicManualChallenges
    .filter((challenge) => challenge.family !== "map" || Boolean(currentMapName) && normalized(challenge.mapName) === normalized(currentMapName))
    .map((challenge) => evaluateCandidate(challenge, response, playerName));
  const exact = candidates.filter((candidate) => Object.values(candidate.match).filter((value) => typeof value === "boolean").every(Boolean));
  const lowConfidence = exact.filter((candidate) => !candidate.quality.accepted);
  const grantableExact = exact.filter((candidate) => candidate.grantable && candidate.quality.accepted);
  const mapEvidenceUnresolved = mapChallenges.length > 0 && (!currentMapName || !isReliableMapEvidence(response));
  const outcome = grantableExact.length === 1 && exact.length === 1 && !mapEvidenceUnresolved
    ? "automatic"
    : exact.length > 0 || candidates.some((candidate) => !candidate.quality.accepted) || mapEvidenceUnresolved
      ? "review"
      : "resubmit";
  return { candidates, exact, lowConfidence, outcome };
};
