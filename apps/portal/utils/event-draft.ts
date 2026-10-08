import type { RandomEvent } from "~/types/random-event";

// The fields the batch API can change; a draft holds only what differs from the saved event.
export type EventPatch = Partial<Pick<RandomEvent, "name" | "category" | "description" | "durationSeconds" | "cooldownSeconds" | "weight" | "gameVersion" | "eventGroup" | "releaseStatus" | "effectTags">>;
export type EventDraft = ReadonlyMap<string, EventPatch>;

const patchKeys = ["name", "category", "description", "durationSeconds", "cooldownSeconds", "weight", "gameVersion", "eventGroup", "releaseStatus", "effectTags"] as const;
const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

// Stage a change; a value equal to the saved one removes itself, and an event with nothing left leaves the draft.
export function stage(draft: EventDraft, event: RandomEvent, patch: EventPatch): EventDraft {
  const next = new Map(draft);
  const merged: EventPatch = { ...(draft.get(event.eventId) ?? {}), ...patch };
  for (const key of patchKeys) if (key in merged && same(merged[key], event[key])) delete merged[key];
  if (Object.keys(merged).length) next.set(event.eventId, merged); else next.delete(event.eventId);
  return next;
}

export const applyDraft = (events: RandomEvent[], draft: EventDraft) => draft.size ? events.map((event) => draft.has(event.eventId) ? { ...event, ...draft.get(event.eventId) } : event) : events;

// The request that saves the draft; an empty group is sent as "" so the server clears it.
export const draftToUpdates = (draft: EventDraft) => [...draft].map(([eventId, patch]) => ({ eventId, ...patch, ...("eventGroup" in patch ? { eventGroup: patch.eventGroup ?? "" } : {}) }));

// The request that puts the saved events back as they were before the draft was applied.
export function undoUpdates(before: RandomEvent[], draft: EventDraft) {
  const byId = new Map(before.map((event) => [event.eventId, event]));
  return [...draft].flatMap(([eventId, patch]) => {
    const event = byId.get(eventId);
    if (!event) return [];
    const original: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as Array<keyof EventPatch>) original[key] = key === "eventGroup" ? event.eventGroup ?? "" : event[key];
    return [{ eventId, ...original }];
  });
}

export const draftedFields = (draft: EventDraft, eventId: string) => new Set(Object.keys(draft.get(eventId) ?? {}));
