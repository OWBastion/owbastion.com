import type { AgentMap, Map } from "@owbastion/contracts";
import { agentGameplayRevisionSchema } from "@owbastion/contracts";
import { parseAgentSpatialConfig } from "./map-revision-service";
import { groupBy } from "./group-by";

type AgentMapProjectionRow = {
  map_id: string;
  map_name: string;
  map_game_version: string;
  difficulty_rating: string | null;
  mechanics_json: string | null;
  cover_url: string | null;
  background_url: string | null;
  revision_id: string | null;
  revision_map_id: string | null;
  revision_lifecycle: string | null;
  legacy_map_variant: string | null;
  revision_game_version: string | null;
  spatial_config_json: string | null;
};
type AgentRevisionAssignmentRow = {
  revision_id: string;
  assignment_map_id: string;
  revision_map_id: string;
  challenge_family: string;
  challenge_id: string;
  public_challenge_id: string | null;
  compat_rule_id: string | null;
};

export const loadAgentMapProjectionsFast = async (database: D1Database, input: { mapId?: string }, now: () => number): Promise<AgentMap[]> => {
  const timestamp = now();
  const mapFilter = input.mapId ? " AND m.id = ?" : "";
  const mapQuery = database.prepare([
    "SELECT m.id AS map_id, m.name AS map_name, m.game_version AS map_game_version,",
    "md.difficulty_rating, md.mechanics_json, md.cover_url, md.background_url,",
    "r.id AS revision_id, r.map_id AS revision_map_id, r.lifecycle AS revision_lifecycle,",
    "r.legacy_map_variant, r.game_version AS revision_game_version, r.spatial_config_json",
    "FROM maps m",
    "LEFT JOIN map_metadata md ON md.map_id = m.id",
    "LEFT JOIN gameplay_revisions r ON r.map_id = m.id AND r.lifecycle IN ('default', 'selectable')",
    "WHERE m.status = 'active'" + mapFilter,
    "ORDER BY m.name, m.id, CASE r.lifecycle WHEN 'default' THEN 0 WHEN 'selectable' THEN 1 ELSE 2 END, r.id",
  ].join(" ")).bind(...(input.mapId ? [input.mapId] : [])).all<AgentMapProjectionRow>();
  const assignmentFilter = input.mapId ? " AND r.map_id = ?" : "";
  const assignmentQuery = database.prepare([
    "SELECT a.gameplay_revision_id AS revision_id, a.map_id AS assignment_map_id, r.map_id AS revision_map_id,",
    "a.challenge_family, a.challenge_id,",
    "CASE",
    "WHEN a.challenge_family = 'map_challenge' THEN (",
    "  SELECT ac.id FROM achievement_challenges ac",
    "  WHERE ac.id = a.challenge_id AND ac.map_id = a.map_id AND ac.status IN ('active', 'sunsetting')",
    ")",
    "WHEN a.challenge_family = 'map_title_rule' THEN (",
    "  SELECT COALESCE((",
    "    SELECT c.legacy_challenge_id FROM map_title_rule_compat c",
    "    WHERE c.rule_id = rule.id AND c.map_id = a.map_id LIMIT 1",
    "  ), a.map_id || '.' || trim(rule.kind))",
    "  FROM map_title_rules rule",
    "  INNER JOIN title_catalog title ON title.key = rule.title_key AND title.lifecycle = 'active'",
    "  WHERE rule.id = a.challenge_id AND rule.status IN ('active', 'sunsetting')",
    "    AND NOT (lower(trim(rule.kind)) = 'pioneer' AND rule.default_scope <> 'explicit')",
    ")",
    "WHEN a.challenge_family = 'title_challenge' THEN (",
    "  SELECT tc.id FROM title_challenges tc",
    "  INNER JOIN title_catalog title ON title.key = tc.title_key AND title.lifecycle = 'active'",
    "  WHERE tc.id = a.challenge_id AND tc.scope = 'map'",
    "    AND tc.status IN ('scheduled', 'active', 'sunsetting')",
    "    AND NOT EXISTS (SELECT 1 FROM map_title_rule_compat c WHERE c.legacy_challenge_id = tc.id)",
    ")",
    "ELSE NULL END AS public_challenge_id,",
    "CASE WHEN a.challenge_family IN ('map_challenge', 'title_challenge') THEN (",
    "  SELECT c.rule_id FROM map_title_rule_compat c",
    "  WHERE c.legacy_challenge_id = a.challenge_id AND c.map_id = a.map_id LIMIT 1",
    ") ELSE NULL END AS compat_rule_id",
    "FROM gameplay_revision_challenge_assignments a",
    "INNER JOIN gameplay_revisions r ON r.id = a.gameplay_revision_id AND r.lifecycle IN ('default', 'selectable')",
    "INNER JOIN maps m ON m.id = r.map_id AND m.status = 'active'",
    "WHERE a.enabled = 1",
    "AND NOT (a.challenge_family = 'map_title_rule' AND EXISTS (",
    "  SELECT 1 FROM map_title_rules rule",
    "  LEFT JOIN map_title_rule_exceptions exception ON exception.rule_id = rule.id AND exception.map_id = a.map_id",
    "  WHERE rule.id = a.challenge_id",
    "    AND rule.status IN ('active', 'sunsetting')",
    "    AND lower(trim(rule.kind)) = 'pioneer'",
    "    AND (rule.default_scope <> 'explicit' OR COALESCE(exception.enabled, 0) <> 1",
    "      OR exception.starts_at IS NULL OR exception.ends_at IS NULL",
    "      OR exception.ends_at <= exception.starts_at OR ? < exception.starts_at OR ? >= exception.ends_at)",
    "))" + assignmentFilter,
  ].join(" ")).bind(...(input.mapId ? [timestamp, timestamp, input.mapId] : [timestamp, timestamp])).all<AgentRevisionAssignmentRow>();
  const [mapResult, assignmentResult] = await Promise.all([mapQuery, assignmentQuery]);
  const revisionsByMap = groupBy(mapResult.results, (row) => row.map_id);
  const assignmentsByRevision = groupBy(assignmentResult.results, (row) => row.revision_id);
  const items: AgentMap[] = [];
  for (const [mapId, rows] of revisionsByMap) {
    const first = rows[0];
    if (!first) continue;
    const revisionRows = rows.filter((row) => row.revision_id !== null);
    const defaultRows = revisionRows.filter((row) => row.revision_lifecycle === "default");
    const projectRevision = (row: AgentMapProjectionRow): AgentMap["gameplayRevisions"][number] | null => {
      if (!row.revision_id || !row.revision_map_id || !row.revision_lifecycle || !row.revision_game_version) return null;
      if (row.revision_map_id !== mapId || row.revision_lifecycle === "default" && row.legacy_map_variant === "classic" || row.legacy_map_variant !== null && row.legacy_map_variant !== "classic") return null;
      const spatialConfig = parseAgentSpatialConfig(row.spatial_config_json);
      if (!spatialConfig) return null;
      const assignments = assignmentsByRevision.get(row.revision_id) ?? [];
      const challengeIds = new Set<string>();
      for (const assignment of assignments) {
        if (assignment.assignment_map_id !== mapId || assignment.revision_map_id !== mapId) return null;
        let publicChallengeId = assignment.public_challenge_id;
        if (assignment.compat_rule_id) {
          publicChallengeId = assignments.find((candidate) => candidate.challenge_family === "map_title_rule" && candidate.challenge_id === assignment.compat_rule_id)?.public_challenge_id ?? null;
        }
        if (!publicChallengeId) return null;
        challengeIds.add(publicChallengeId);
      }
      const challengeRefs = [...challengeIds].sort().map((challengeId) => ({ family: "map" as const, challengeId }));
      const parsed = agentGameplayRevisionSchema.safeParse({
        gameplayRevisionId: row.revision_id,
        mapId,
        mapVariant: row.legacy_map_variant === "classic" ? "classic" : null,
        lifecycle: row.revision_lifecycle,
        enabled: true,
        isDefault: row.revision_lifecycle === "default",
        isSelectable: row.revision_lifecycle === "selectable",
        gameVersion: row.revision_game_version,
        spatialConfig,
        challengeRefs,
      });
      return parsed.success ? parsed.data : null;
    };
    const candidateRevisions = defaultRows.length === 1 ? revisionRows.map(projectRevision) : [];
    const projectedRevisions = candidateRevisions.every((revision): revision is AgentMap["gameplayRevisions"][number] => revision !== null)
      ? candidateRevisions
      : [];
    projectedRevisions.sort((left, right) => (left.isDefault ? 0 : 1) - (right.isDefault ? 0 : 1)
      || (left.gameplayRevisionId < right.gameplayRevisionId ? -1 : left.gameplayRevisionId > right.gameplayRevisionId ? 1 : 0));
    items.push({
      mapId,
      mapName: first.map_name,
      gameVersion: first.map_game_version,
      difficultyRating: first.difficulty_rating as Map["difficultyRating"] ?? null,
      mechanics: first.mechanics_json ? JSON.parse(first.mechanics_json) as string[] : [],
      coverUrl: first.cover_url,
      backgroundUrl: first.background_url,
      gameplayRevisions: projectedRevisions,
    });
  }
  return items.sort((left, right) => left.mapName < right.mapName ? -1 : left.mapName > right.mapName ? 1 : left.mapId < right.mapId ? -1 : left.mapId > right.mapId ? 1 : 0);
};
