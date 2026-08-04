import type { Challenge } from "@owbastion/contracts";
import { difficultyRank, matchOcrResult, type OcrMatch } from "./ocr-match";
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
  automaticCandidates: AutoMatchCandidate[];
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

export const challengeTargetDifficulty = (challenge: Challenge) => {
  if (challenge.family !== "map") return null;
  if (challenge.difficulty) return challenge.difficulty;
  switch (challenge.mapTitleRule?.kind) {
    case "pioneer":
    case "dominator":
      return "地狱";
    case "conqueror":
      return "传奇";
    default:
      return null;
  }
};

const normalized = (value: string | null | undefined) => value?.trim().toLocaleLowerCase() ?? "";

const isReliableMapEvidence = (response: OcrResponse) => {
  const field = response.fields?.map_name;
  return Boolean(response.data?.map_name?.trim()) && field?.status === "ok" && typeof field.confidence === "number" && field.confidence >= 0.85;
};

const evaluateCandidate = (challenge: Challenge, response: OcrResponse, playerName: string): AutoMatchCandidate => {
  const challengeType = candidateType(challenge);
  const targetMapName = challenge.family === "map" ? challenge.mapName : "成就挑战";
  const targetDifficulty = challengeTargetDifficulty(challenge);
  const requiredMapVariant = challenge.mapVariant ?? (challenge.family === "map" && challenge.kind === "classic_completion" ? "classic" : null);
  const titleName = candidateTitleName(challenge);
  const requiresAchievementEvidence = challenge.family === "achievement";
  const qualityChallengeType = challengeType === "map_title_achievement" && targetDifficulty ? "difficulty_completion" : challengeType;
  const quality = assessOcrQuality(qualityChallengeType, response, requiredMapVariant, requiresAchievementEvidence);
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
  const matchWithEvidence = requiresAchievementEvidence && titleName && !match.achievement
    ? { ...match, achievement: false }
    : match;
  const qualityWithEvidence = requiresAchievementEvidence && titleName && !match.achievement
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
  const difficultyCandidates = exact.filter((candidate) => candidate.challenge.family === "map" && candidate.targetDifficulty);
  const highestDifficultyRank = Math.max(...difficultyCandidates.map((candidate) => difficultyRank(candidate.targetDifficulty)), -1);
  const automaticCandidates = exact.filter((candidate) => candidate.challenge.family !== "map" || !candidate.targetDifficulty || difficultyRank(candidate.targetDifficulty) === highestDifficultyRank);
  const lowConfidence = exact.filter((candidate) => !candidate.quality.accepted);
  const grantableExact = automaticCandidates.filter((candidate) => candidate.grantable && candidate.quality.accepted);
  const exactMapCandidates = exact.filter((candidate) => candidate.challenge.family === "map");
  const exactAchievementCandidates = exact.filter((candidate) => candidate.challenge.family === "achievement");
  const mapGrantKeys = new Set(exactMapCandidates.map((candidate) => `${candidate.challenge.titleKey ?? ""}:${candidate.challenge.family === "map" ? candidate.challenge.mapId : ""}`));
  const mapOnlyAutomatic = exactMapCandidates.length > 0
    && exactAchievementCandidates.length === 0
    && mapGrantKeys.size === exactMapCandidates.length
    && exactMapCandidates.every((candidate) => candidate.grantable && candidate.quality.accepted)
    && automaticCandidates.length > 0
    && automaticCandidates.every((candidate) => candidate.challenge.family === "map" && candidate.grantable && candidate.quality.accepted);
  const titleOnlyAutomatic = exactMapCandidates.length === 0
    && exactAchievementCandidates.length === 1
    && exactAchievementCandidates[0].grantable
    && exactAchievementCandidates[0].quality.accepted;
  const matchedFamilies = new Set(exact.map((candidate) => candidate.challenge.family));
  const qualityReviewCandidates = candidates.filter((candidate) => !candidate.quality.accepted && (matchedFamilies.size === 0 || matchedFamilies.has(candidate.challenge.family)));
  const mapEvidenceUnresolved = mapChallenges.length > 0 && (!currentMapName || !isReliableMapEvidence(response));
  const outcome = (mapOnlyAutomatic || titleOnlyAutomatic) && grantableExact.length > 0 && !mapEvidenceUnresolved
    ? "automatic"
    : exact.length > 0 || qualityReviewCandidates.length > 0 || mapEvidenceUnresolved
      ? "review"
      : "resubmit";
  return { candidates, exact, automaticCandidates, lowConfidence, outcome };
};
