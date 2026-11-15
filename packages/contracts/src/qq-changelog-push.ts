import { z } from "zod";
import { contractVersion, externalId } from "./shared";

const changelogVersion = z.string().trim().min(1).max(32).regex(/^[0-9]+(\.[0-9]+)+$/);
// QQ rejects oversized markdown with 40054007; qqbot splits it, so the platform only bounds the request.
const changelogMarkdown = z.string().min(1).max(64_000);

/** Admin request: push one changelog version to the chosen groups. */
export const qqChangelogPushRequestSchema = z.object({
  contractVersion,
  version: changelogVersion,
  markdown: changelogMarkdown,
  groupOpenIds: z.array(externalId).min(1).max(50).refine((ids) => new Set(ids).size === ids.length),
  // A group that already received this version is rejected unless the admin confirms a resend.
  confirmResend: z.boolean().default(false),
}).strict();
export type QqChangelogPushRequest = z.infer<typeof qqChangelogPushRequestSchema>;

export const qqChangelogPushStatusSchema = z.enum(["pending", "sent", "failed"]);

export const qqChangelogPushItemSchema = z.object({
  version: changelogVersion,
  groupOpenId: externalId,
  status: qqChangelogPushStatusSchema,
  // Set only when status is failed: a retryable failure may succeed on a later attempt.
  retryable: z.boolean().nullable(),
  errorCode: z.string().nullable(),
  updatedAt: z.number().int().nonnegative(),
});
export type QqChangelogPushItem = z.infer<typeof qqChangelogPushItemSchema>;

export const qqChangelogPushListResponseSchema = z.object({ contractVersion, items: z.array(qqChangelogPushItemSchema) });
export type QqChangelogPushListResponse = z.infer<typeof qqChangelogPushListResponseSchema>;

/** Signed platform → qqbot request, one group per request. */
export const qqbotChangelogSendRequestSchema = z.object({
  contractVersion,
  version: changelogVersion,
  groupOpenId: externalId,
  idempotencyKey: z.string().min(1).max(512),
  markdown: changelogMarkdown,
}).strict();
export type QqbotChangelogSendRequest = z.infer<typeof qqbotChangelogSendRequestSchema>;

export const qqbotChangelogSendResponseSchema = z.discriminatedUnion("status", [
  z.object({ contractVersion, status: z.literal("sent") }),
  z.object({ contractVersion, status: z.literal("failed"), retryable: z.boolean(), errorCode: z.string().min(1).max(64) }),
]);
export type QqbotChangelogSendResponse = z.infer<typeof qqbotChangelogSendResponseSchema>;
