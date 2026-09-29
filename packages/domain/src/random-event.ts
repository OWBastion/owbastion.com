export const randomEventRarities = ["SSR", "SR", "R", "N"] as const;
export type RandomEventRarity = (typeof randomEventRarities)[number];

export const randomEventRarityForWeight = (weight: number | null): RandomEventRarity | "" => {
  if (weight === null) return "";
  if (weight <= 0.4) return "SSR";
  if (weight <= 0.8) return "SR";
  if (weight <= 1.2) return "R";
  return "N";
};
