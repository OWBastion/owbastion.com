import type { FeaturedReviewComments } from "@owbastion/domain";

export const featuredReviewCount = 3;
export const featuredMinRating = 4;
export const featuredMinCommentLength = 8;

// Random public comments for the home page. Only event reviews: an event is shown while it is
// implemented or removed and not archived, matching the public event list. Anonymous by design.
export const listFeaturedReviewComments = async (database: D1Database): Promise<FeaturedReviewComments> => {
  const result = await database.prepare(`
    SELECT r.rating, r.comment, e.name AS target_name
    FROM reviews r
    JOIN random_events e ON e.id = r.target_id
    WHERE r.target_type = 'event' AND r.status = 'active' AND r.comment_status = 'visible'
      AND r.rating >= ? AND LENGTH(r.comment) >= ?
      AND e.archived_at IS NULL AND e.release_status IN ('implemented', 'removed')
    ORDER BY RANDOM() LIMIT ?
  `).bind(featuredMinRating, featuredMinCommentLength, featuredReviewCount).all<{ rating: number; comment: string; target_name: string }>();
  return { items: result.results.map((row) => ({ rating: row.rating as 4 | 5, comment: row.comment, targetName: row.target_name })) };
};
