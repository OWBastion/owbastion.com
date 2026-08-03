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

const evaluateCandidate = (challenge: Challenge, response: OcrResponse, playerName: string): AutoMatchCandidate => {
  const challengeType = candidateType(challenge);
  const targetMapName = challenge.family === "map" ? challenge.mapName : "成就挑战";
  const targetDifficulty = challenge.family === "map" ? challenge.difficulty ?? null : null;
  const requiredMapVariant = challenge.mapVariant ?? null;
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
  return {
    challenge,
    challengeType,
    targetMapName,
    targetDifficulty,
    targetPlayerName: playerName,
    titleName,
    requiredMapVariant,
    match: { ...match, skipped },
    quality,
    grantable: challenge.family === "achievement" || Boolean(challenge.titleKey),
  };
};

export const matchOcrAgainstChallenges = (challenges: Challenge[], response: OcrResponse, playerName: string): AutoMatchDecision => {
  const candidates = challenges
    .filter((challenge) => (challenge.status === "active" || challenge.status === "sunsetting") && challenge.submissionMode !== "automatic")
    .map((challenge) => evaluateCandidate(challenge, response, playerName));
  const exact = candidates.filter((candidate) => Object.values(candidate.match).filter((value) => typeof value === "boolean").every(Boolean));
  const lowConfidence = exact.filter((candidate) => !candidate.quality.accepted);
  const grantableExact = exact.filter((candidate) => candidate.grantable && candidate.quality.accepted);
  const outcome = grantableExact.length === 1 && exact.length === 1
    ? "automatic"
    : exact.length > 0 || candidates.some((candidate) => !candidate.quality.accepted)
      ? "review"
      : "resubmit";
  return { candidates, exact, lowConfidence, outcome };
};
