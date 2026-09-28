import type { RandomEvent as ContractRandomEvent } from "@owbastion/contracts";

export type RandomEvent = ContractRandomEvent;
export type EventChallenge = RandomEvent["challenges"][number];
export type EffectAnnotation = RandomEvent["effectAnnotations"][number];
