import { verifiedRunMapRatings, verifiedRunXpRuleV3, type VerifiedRunMapRating } from "@owbastion/domain";

export const isMapRating = (value: string | null | undefined): value is VerifiedRunMapRating =>
  verifiedRunMapRatings.includes(value as VerifiedRunMapRating);

/** The mastery-XP bonus a map rating adds to verified runs, e.g. "+16%"; null when it adds none. */
export const mapRatingBonusLabel = (rating: string | null | undefined) => {
  if (!isMapRating(rating)) return null;
  const percent = Math.round(verifiedRunXpRuleV3.mapRatingBonus[rating] * 100);
  return percent ? `+${percent}%` : null;
};
