import type { RandomEvent as ContractRandomEvent } from "@owbastion/contracts";

export type RandomEvent = ContractRandomEvent;
export type EventOutcome = RandomEvent["outcomes"][number];
export type EventChallenge = RandomEvent["challenges"][number];
export type EffectAnnotation = RandomEvent["effectAnnotations"][number];
