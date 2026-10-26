import { z } from "zod";
import { contractVersion, externalId } from "./common";
// index.ts re-exports this module, so challengeSchema is read lazily at parse
// time to keep the circular module edge from evaluating an uninitialized binding.
import { challengeSchema } from "./index";

const randomEventStatus = z.enum(["development", "implemented", "removed"]);
const randomEventVersionAvailability = z.enum(["available", "suspended"]);
const randomEventLinkSchema = z.object({ family: z.enum(["map", "achievement"]), challengeId: externalId });
const effectGlossaryTermSchema = z.object({ key: z.string().trim().min(1).max(64), nameZh: z.string().trim().min(1).max(128), aliases: z.array(z.string().trim().min(1).max(128)).max(16), category: z.string().trim().min(1).max(64), summary: z.string().trim().min(1).max(512), definition: z.string().trim().min(1).max(4096), rules: z.array(z.string().trim().min(1).max(512)).max(16), sourceVersion: z.string().trim().min(1).max(64) });
const randomEventEffectAnnotationSchema = z.object({ tag: z.string().trim().min(1).max(64), term: effectGlossaryTermSchema });
// An outcome is one equally likely internal result of a composite event, not an event itself.
export const randomEventOutcomeInputSchema = z.object({ name: z.string().trim().min(1).max(256), polarity: z.enum(["buff", "debuff"]), description: z.string().trim().max(4096), effectTags: z.array(z.string().trim().min(1).max(64)).max(16) }).strict();
export const randomEventOutcomeSchema = randomEventOutcomeInputSchema.extend({ position: z.number().int().nonnegative() }).strict();
export const randomEventSchema = z.object({
  eventId: externalId, name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), rarity: z.string().trim().max(32), description: z.string().trim().max(4096),
  durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().nonnegative().nullable(), weight: z.number().nonnegative().nullable(),
  gameVersion: z.string().trim().min(1).max(64), eventGroup: z.string().max(64).nullable(), effectTags: z.array(z.string().trim().min(1).max(64)).max(16), effectAnnotations: z.array(randomEventEffectAnnotationSchema).max(16), releaseStatus: randomEventStatus, archived: z.boolean(), challenges: z.array(z.lazy(() => challengeSchema)), outcomes: z.array(randomEventOutcomeSchema).max(32).default([]),
});
export const randomEventListResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) });
// Optional on write: omitting it leaves the group unchanged; an empty string clears it.
const randomEventGroupInput = z.string().trim().max(64).transform((value) => value || null).nullable().optional();
// Optional on write: omitting outcomes leaves the stored set unchanged; when present it replaces it in write order.
const randomEventWriteFields = z.object({ name: z.string().trim().min(1).max(256), category: z.string().trim().min(1).max(64), description: z.string().trim().max(4096), durationSeconds: z.number().int().nonnegative().nullable(), cooldownSeconds: z.number().nonnegative().nullable(), weight: z.number().nonnegative().nullable(), gameVersion: z.string().trim().min(1).max(64), eventGroup: randomEventGroupInput, effectTags: z.array(z.string().trim().min(1).max(64)).max(16), releaseStatus: randomEventStatus, challengeLinks: z.array(randomEventLinkSchema).max(64), outcomes: z.array(randomEventOutcomeInputSchema).max(32).optional() }).strict();
export const adminRandomEventCreateRequestSchema = z.object({ contractVersion }).merge(randomEventWriteFields);
export const adminRandomEventUpdateRequestSchema = z.object({ contractVersion }).merge(randomEventWriteFields);
// A batch changes only the listed fields of up to 100 distinct events, all or nothing; challenge links and outcomes are not part of it.
const randomEventBatchUpdate = randomEventWriteFields.omit({ challengeLinks: true, outcomes: true }).partial().extend({ eventId: externalId }).strict()
  .refine((update) => Object.keys(update).length > 1, "A batch update must change at least one field");
export const adminRandomEventBatchRequestSchema = z.object({ contractVersion, updates: z.array(randomEventBatchUpdate).min(1).max(100) }).strict()
  .refine((request) => new Set(request.updates.map((update) => update.eventId)).size === request.updates.length, "Each event may appear once");
export const adminRandomEventBatchResponseSchema = z.object({ contractVersion, items: z.array(randomEventSchema) });
export const adminRandomEventImportRequestSchema = z.object({ contractVersion, fileName: z.string().trim().min(1).max(256), csv: z.string().min(1).max(512 * 1024) }).strict();
// mode names the standalone mode whose build owns this pool (set from that mode); null is the regular build.
export const randomEventVersionSchema = z.object({ gameVersion: z.string().trim().min(1).max(64), availability: randomEventVersionAvailability, mode: z.string().nullable(), eventCount: z.number().int().nonnegative() }).strict();
export const adminRandomEventVersionListResponseSchema = z.object({ contractVersion, items: z.array(randomEventVersionSchema) }).strict();
export const adminRandomEventVersionAvailabilityRequestSchema = z.object({ contractVersion, availability: randomEventVersionAvailability }).strict();

export type RandomEvent = z.infer<typeof randomEventSchema>;
export type RandomEventOutcome = z.infer<typeof randomEventOutcomeSchema>;
export type RandomEventOutcomeInput = z.infer<typeof randomEventOutcomeInputSchema>;
export type RandomEventListResponse = z.infer<typeof randomEventListResponseSchema>;
export type AdminRandomEventCreateRequest = z.infer<typeof adminRandomEventCreateRequestSchema>;
export type AdminRandomEventUpdateRequest = z.infer<typeof adminRandomEventUpdateRequestSchema>;
export type AdminRandomEventBatchRequest = z.infer<typeof adminRandomEventBatchRequestSchema>;
export type AdminRandomEventImportRequest = z.infer<typeof adminRandomEventImportRequestSchema>;
export type RandomEventVersion = z.infer<typeof randomEventVersionSchema>;
export type AdminRandomEventVersionListResponse = z.infer<typeof adminRandomEventVersionListResponseSchema>;
export type AdminRandomEventVersionAvailabilityRequest = z.infer<typeof adminRandomEventVersionAvailabilityRequestSchema>;
