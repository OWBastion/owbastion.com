import type { DatabaseSync } from "node:sqlite";
import { createOcrDifficultyResponse, seedRevisionAssignment, seedTitle } from "../src/ocr-test-harness";

const now = Date.now();

/**
 * N distinct, automatic map-achievement candidates on one map. Each
 * candidate is a real Title + Challenge + revision assignment — the same shape
 * `fetchAllAutoMatchChallenges` and `prepareCanonicalAutoMatchChallenges` scan in
 * production, just scaled up to stand in for a growing catalog.
 */
export const seedScaledCandidates = (sqlite: DatabaseSync, mapId: string, count: number) => {
  for (let i = 0; i < count; i += 1) {
    const titleKey = `SCALE_TITLE_${i}`;
    const challengeId = `challenge.scale.${mapId}.${i}`;
    seedTitle(sqlite, titleKey);
    sqlite.prepare(
      "INSERT INTO achievement_challenges (id, map_id, type, name, difficulty, condition, evidence_rule, submission_mode, reward_title_key, game_version, status, introduced_version, created_at, updated_at) VALUES (?, ?, 'difficulty_completion', ?, '困难', '完成通关', '上传截图', 'automatic', ?, '2026.07.15', 'active', '2026.07.15', ?, ?)",
    ).run(challengeId, mapId, `候选 ${i}`, titleKey, now, now);
    seedRevisionAssignment(sqlite, { gameplayRevisionId: `revision:${mapId}:initial`, mapId, challengeFamily: "map_challenge", challengeId });
  }
};

export const seedSubmissionPlayer = (sqlite: DatabaseSync, playerId: string, bindingId: string) => {
  sqlite.prepare("INSERT INTO player_accounts (id, player_id, player_name, normalized_player_name, is_admin, status, created_at, updated_at) VALUES (?, ?, 'Tester', 'tester', 0, 'active', ?, ?)").run(playerId, playerId, now, now);
  sqlite.prepare("INSERT INTO bindings (id, identity_id, player_account_id, provider, group_open_id, member_open_id, status, created_at) VALUES (?, ?, ?, 'qq', ?, ?, 'active', ?)").run(bindingId, `identity.${playerId}`, playerId, `group.${playerId}`, `member.${playerId}`, now);
};

export const seedOcrPendingSubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_pending', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, `message.${submissionId}`, now, now);
  sqlite.prepare("INSERT INTO attachments (id, submission_id, provider, external_attachment_id, content_type, byte_size, sha256, object_key, upload_status, created_at) VALUES (?, ?, 'portal', ?, 'image/png', 1, 'hash', ?, 'stored', ?)").run(`attachment.${submissionId}`, submissionId, `external.${submissionId}`, `evidence/${submissionId}.png`, now);
};

export const seedReviewableSubmission = (sqlite: DatabaseSync, submissionId: string, bindingId: string, ocrResponse: unknown) => {
  sqlite.prepare("INSERT INTO submissions (id, binding_id, status, challenge_type, map_name, player_name, source_provider, source_conversation_id, source_message_id, created_at, updated_at) VALUES (?, ?, 'ocr_review_required', 'unknown', '成就挑战', 'Tester', 'portal', 'portal', ?, ?, ?)").run(submissionId, bindingId, `message.${submissionId}`, now, now);
  sqlite.prepare("INSERT INTO ocr_results (id, submission_id, attempt, status, response_json, match_json, created_at) VALUES (?, ?, 1, 'review_required', ?, '{}', ?)").run(`ocr.${submissionId}`, submissionId, JSON.stringify(ocrResponse), now);
};

// Evidence that recognizes the real map (so the full seeded candidate set is still
// scanned) but never satisfies a required-difficulty condition, so every scale keeps
// the same "review"/"resubmit" outcome and never crosses into "automatic" — the one
// path that materializes `challenges` rows.
export const nonMatchingOcrResponse = () => createOcrDifficultyResponse("地图 map.scale", "简单");

export const matchingOcrResponse = () => createOcrDifficultyResponse("地图 map.scale", "困难");
