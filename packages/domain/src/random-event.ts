export const randomEventRarities = ["SSR", "SR", "R", "N"] as const;
export type RandomEventRarity = (typeof randomEventRarities)[number];

export const randomEventCompositeCategory = "复合";

// A composite event needs at least one buff and one debuff outcome; any other
// category is atomic and stores no outcomes.
export const randomEventOutcomesValid = (category: string, outcomes: ReadonlyArray<{ polarity: string }>) =>
  category === randomEventCompositeCategory
    ? outcomes.length >= 2 && outcomes.some((outcome) => outcome.polarity === "buff") && outcomes.some((outcome) => outcome.polarity === "debuff")
    : outcomes.length === 0;

// A composite event's tags are the union of its outcomes' tags.
export const randomEventOutcomeEffectTags = (outcomes: ReadonlyArray<{ effectTags: string[] }>) => [...new Set(outcomes.flatMap((outcome) => outcome.effectTags))];

export const randomEventRarityForWeight = (weight: number | null): RandomEventRarity | "" => {
  if (weight === null) return "";
  if (weight <= 0.4) return "SSR";
  if (weight <= 0.8) return "SR";
  if (weight <= 1.2) return "R";
  return "N";
};
