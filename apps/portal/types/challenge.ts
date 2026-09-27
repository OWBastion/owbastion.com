import type { Challenge, Map } from "@owbastion/contracts";

export type { Map };
export type MapChallenge = Extract<Challenge, { family: "map" }>;
