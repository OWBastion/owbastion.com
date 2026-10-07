import type { RandomEvent } from "~/types/random-event";

export type EventLink = { family: "map" | "achievement"; challengeId: string };
export type EventForm = {
  name: string; category: string; eventGroup: string; description: string;
  durationSeconds: number | null; cooldownSeconds: number | null; weight: number | null;
  gameVersion: string; effectTags: string[]; releaseStatus: RandomEvent["releaseStatus"]; links: EventLink[];
};

export const emptyEventForm = (): EventForm => ({ name: "", category: "", eventGroup: "", description: "", durationSeconds: null, cooldownSeconds: null, weight: null, gameVersion: "", effectTags: [], releaseStatus: "development", links: [] });

const numberOrNull = (value: number | string | null | undefined) => value === "" || value === null || value === undefined ? null : Number(value);

// The create request. An empty group is sent as "" and stored as no group.
export const bodyFromForm = (form: EventForm) => ({
  contractVersion: "1" as const,
  name: form.name, category: form.category, eventGroup: form.eventGroup.trim(), description: form.description,
  durationSeconds: numberOrNull(form.durationSeconds), cooldownSeconds: numberOrNull(form.cooldownSeconds), weight: numberOrNull(form.weight),
  gameVersion: form.gameVersion, effectTags: form.effectTags.map((value) => value.trim()).filter(Boolean),
  releaseStatus: form.releaseStatus, challengeLinks: form.links,
});
