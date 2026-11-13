import { sql, type SQL } from "drizzle-orm";
import { playerTitleGrants } from "./schema";

// ALL_IN_ONE, SKY and TRAVELER are global grants with no map or revision. They stay valid only
// while the holder has the required evidence on the default revision of every active map, so a
// map rework or a new map suspends them until the holder re-earns that map. Classic revisions
// (selectable) never count. Grants are kept; this condition only hides the unmet ones.
//   ALL_IN_ONE: CONQUEROR   SKY: DOMINATOR   TRAVELER: any clear (a map title or an accepted run)
export const AGGREGATE_TITLE_KEYS = ["ALL_IN_ONE", "SKY", "TRAVELER"] as const;

/** SQL condition on a `player_title_grants` row: true for other titles and for aggregate titles still met. */
export const aggregateTitleStillMet = (grant: typeof playerTitleGrants = playerTitleGrants): SQL => sql`(
  ${grant.titleKey} NOT IN ('ALL_IN_ONE', 'SKY', 'TRAVELER')
  OR NOT EXISTS (
    SELECT 1 FROM maps agg_map
    INNER JOIN gameplay_revisions agg_rev ON agg_rev.map_id = agg_map.id AND agg_rev.lifecycle = 'default'
    WHERE agg_map.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM player_title_grants agg_grant
        WHERE agg_grant.player_account_id = ${grant.playerAccountId}
          AND agg_grant.status = 'active'
          AND agg_grant.gameplay_revision_id = agg_rev.id
          AND (
            ${grant.titleKey} = 'TRAVELER'
            OR (${grant.titleKey} = 'ALL_IN_ONE' AND agg_grant.title_key = 'CONQUEROR')
            OR (${grant.titleKey} = 'SKY' AND agg_grant.title_key = 'DOMINATOR')
          )
        UNION ALL
        SELECT 1 FROM mastery_runs agg_run
        WHERE ${grant.titleKey} = 'TRAVELER'
          AND agg_run.player_account_id = ${grant.playerAccountId}
          AND agg_run.status = 'active'
          AND agg_run.gameplay_revision_id = agg_rev.id
      )
  )
)`;
