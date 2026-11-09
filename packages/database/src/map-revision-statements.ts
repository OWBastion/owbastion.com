/** The Revision row a preceding guarded UPDATE wrote; dependent statements run only while it still matches. */
type AppliedRevision = { revisionId: string; lifecycle: string; updatedAt: number };
const appliedGuard = "EXISTS (SELECT 1 FROM gameplay_revisions WHERE id = ? AND lifecycle = ? AND updated_at = ?)";
const appliedBinds = ({ revisionId, lifecycle, updatedAt }: AppliedRevision) => [revisionId, lifecycle, updatedAt];

export const deleteGuardedAssignments = (database: D1Database, applied: AppliedRevision) => database.prepare(
  `DELETE FROM gameplay_revision_challenge_assignments WHERE gameplay_revision_id = ? AND ${appliedGuard}`,
).bind(applied.revisionId, ...appliedBinds(applied));

export const insertGuardedAssignment = (
  database: D1Database,
  applied: AppliedRevision,
  mapId: string,
  assignment: { challengeFamily: string; challengeId: string; enabled: boolean; condition: string | null; evidenceRule: string | null; submissionMode: string | null; slot: string | null },
  timestamp: number,
) => database.prepare(
  `INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${appliedGuard}`,
).bind(
  `assignment:${applied.revisionId}:${crypto.randomUUID()}`, applied.revisionId, mapId, assignment.challengeFamily, assignment.challengeId, assignment.enabled ? 1 : 0, assignment.condition, assignment.evidenceRule, assignment.submissionMode, assignment.slot, timestamp, timestamp, ...appliedBinds(applied),
);

export const insertGuardedMapTitleRuleAssignment = (database: D1Database, applied: AppliedRevision, mapId: string, ruleId: string, timestamp: number) => database.prepare(
  `INSERT INTO gameplay_revision_challenge_assignments (id, gameplay_revision_id, map_id, challenge_family, challenge_id, enabled, condition, evidence_rule, submission_mode, slot, created_at, updated_at) SELECT ?, ?, ?, 'map_title_rule', ?, 1, NULL, NULL, NULL, NULL, ?, ? WHERE ${appliedGuard} ON CONFLICT (gameplay_revision_id, challenge_family, challenge_id) DO NOTHING`,
).bind(`assignment:${applied.revisionId}:map_title_rule:${ruleId}`, applied.revisionId, mapId, ruleId, timestamp, timestamp, ...appliedBinds(applied));

export const upsertGuardedPioneerException = (database: D1Database, applied: AppliedRevision, mapId: string, window: { ruleId: string; startsAt: number | null; endsAt: number | null }, timestamp: number) => database.prepare(
  `INSERT INTO map_title_rule_exceptions (id, rule_id, map_id, enabled, starts_at, ends_at, created_at, updated_at) SELECT ?, ?, ?, 1, ?, ?, ?, ? WHERE ${appliedGuard} ON CONFLICT(rule_id, map_id) DO UPDATE SET enabled = 1, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = excluded.updated_at`,
).bind(crypto.randomUUID(), window.ruleId, mapId, window.startsAt, window.endsAt, timestamp, timestamp, ...appliedBinds(applied));

export const reconcileEquippedTitlesForHistoricalRevision = (database: D1Database, revisionId: string) => [
  database.prepare(`
    WITH replacements AS MATERIALIZED (
      SELECT equipped.grant_id AS old_grant_id, (
        SELECT replacement.id
        FROM player_title_grants AS old_grant
        JOIN player_title_grants AS replacement
          ON replacement.player_account_id = old_grant.player_account_id
         AND replacement.title_key = old_grant.title_key
        JOIN title_catalog AS title ON title.key = replacement.title_key
        LEFT JOIN gameplay_revisions AS replacement_revision ON replacement_revision.id = replacement.gameplay_revision_id
        WHERE old_grant.id = equipped.grant_id
          AND replacement.status = 'active'
          AND title.scope = 'global'
          AND title.game_version IS NOT NULL
          AND (
            (replacement.map_id IS NULL AND replacement.gameplay_revision_id IS NULL)
            OR (replacement.map_id = replacement_revision.map_id AND replacement_revision.lifecycle IN ('default', 'selectable'))
          )
          AND NOT EXISTS (
            SELECT 1 FROM player_equipped_titles AS existing
            WHERE existing.player_account_id = equipped.player_account_id
              AND existing.grant_id = replacement.id
          )
        ORDER BY replacement.granted_at DESC, replacement.id
        LIMIT 1
      ) AS replacement_grant_id
      FROM player_equipped_titles AS equipped
      JOIN player_title_grants AS old_grant ON old_grant.id = equipped.grant_id
      JOIN gameplay_revisions AS old_revision ON old_revision.id = old_grant.gameplay_revision_id
      WHERE old_grant.gameplay_revision_id = ?
        AND old_revision.lifecycle = 'historical'
    )
    UPDATE player_equipped_titles
    SET grant_id = (
      SELECT replacement_grant_id FROM replacements
      WHERE old_grant_id = player_equipped_titles.grant_id
    )
    WHERE grant_id IN (SELECT old_grant_id FROM replacements WHERE replacement_grant_id IS NOT NULL)
  `).bind(revisionId),
  database.prepare(`
    DELETE FROM player_equipped_titles
    WHERE grant_id IN (
      SELECT grant.id
      FROM player_title_grants AS grant
      JOIN gameplay_revisions AS revision ON revision.id = grant.gameplay_revision_id
      WHERE grant.gameplay_revision_id = ?
        AND revision.lifecycle = 'historical'
    )
  `).bind(revisionId),
];
